#!/usr/bin/env python3

import argparse
import json
import math
from pathlib import Path


STEPGAME_LABEL_MAP = {
    "above": "north",
    "below": "south",
    "left": "west",
    "right": "east",
    "upper-left": "northwest",
    "upper-right": "northeast",
    "lower-left": "southwest",
    "lower-right": "southeast",
}


def load_jsonl(path: Path):
    with path.open() as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def stepgame_difficulty(k_hop: int) -> str:
    if k_hop <= 1:
        return "easy"
    if k_hop <= 3:
        return "medium"
    return "hard"


def text_difficulty(level: int) -> str:
    if level <= 2:
        return "easy"
    if level <= 4:
        return "medium"
    return "hard"


def infer_spartqa_level(story: str, question: str) -> int:
    token_count = len((story + " " + question).split())
    if token_count <= 55:
        return 2
    if token_count <= 85:
        return 3
    if token_count <= 120:
        return 4
    return 5


def load_corrected_stepgame(prefix: Path):
    grouped = {hop: [] for hop in range(1, 6)}
    for hop in range(1, 6):
        path = Path(f"{prefix}{hop}-valid.txt")
        current = []
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("1 ") and current:
                grouped[hop].append(current)
                current = []
            current.append(line)
        if current:
            grouped[hop].append(current)
    return grouped


def normalize_stepgame(prefix: Path):
    by_hop = load_corrected_stepgame(prefix)
    tasks = []
    for hop, groups in by_hop.items():
        picked = evenly_spaced(groups, 3)
        for index, group in enumerate(picked, start=1):
            context_lines = [line.split(" ", 1)[1] for line in group[:-1]]
            question_line = group[-1].split(" ", 1)[1]
            question, label, _ = question_line.split("\t")
            if label not in STEPGAME_LABEL_MAP:
                continue
            prompt = "Context:\n" + "\n".join(f"- {sentence}" for sentence in context_lines)
            prompt += f"\n\nQuestion:\n{question}\n\nRespond with the spatial relation only."
            tasks.append({
                "id": f"stepgame-clean-k{hop}-{index:02d}",
                "suite_id": "stepgame",
                "category": "relationship",
                "cognitive_level": hop,
                "prompt": prompt,
                "expected_answer": STEPGAME_LABEL_MAP[label],
                "answer_format": "direction",
                "difficulty": stepgame_difficulty(hop),
            })
    return tasks


def evenly_spaced(rows, count):
    if len(rows) <= count:
        return rows
    if count == 1:
        return [rows[len(rows) // 2]]
    indices = [round(i * (len(rows) - 1) / (count - 1)) for i in range(count)]
    seen = set()
    picked = []
    for index in indices:
        while index < len(rows) and index in seen:
            index += 1
        if index >= len(rows):
            index = len(rows) - 1
            while index in seen:
                index -= 1
        seen.add(index)
        picked.append(rows[index])
    return picked


def normalize_spartqa(path: Path):
    by_answer = {answer: [] for answer in range(4)}
    for row in load_jsonl(path):
        by_answer[row["answer"]].append(row)

    selected = []
    targets = {0: 4, 1: 4, 2: 4, 3: 3}
    for answer, rows in by_answer.items():
        rows = sorted(rows, key=lambda row: (len(row["story"].split()), len(row["question"].split())))
        selected.extend(evenly_spaced(rows, targets[answer]))

    tasks = []
    for index, row in enumerate(selected, start=1):
        choices = "\n".join(
            f"{chr(65 + i)}. {choice.strip()}"
            for i, choice in enumerate(row["candidate_answers"])
        )
        expected = row["candidate_answers"][row["answer"]].strip()
        level = infer_spartqa_level(row["story"], row["question"])
        prompt = (
            f"Context:\n{row['story'].strip()}\n\n"
            f"Question:\n{row['question'].strip()}\n\n"
            f"Choices:\n{choices}\n\n"
            "Respond with the best answer choice text only."
        )
        tasks.append({
            "id": f"spartqa-validation-{index:02d}",
            "suite_id": "spartqa",
            "category": "relationship",
            "cognitive_level": level,
            "prompt": prompt,
            "expected_answer": expected,
            "answer_format": "entity",
            "difficulty": text_difficulty(level),
        })
    return tasks


def path_to_directions(points):
    directions = []
    for current, nxt in zip(points, points[1:]):
        dx = nxt["x"] - current["x"]
        dy = nxt["y"] - current["y"]
        if dx == 1 and dy == 0:
            directions.append("east")
        elif dx == -1 and dy == 0:
            directions.append("west")
        elif dx == 0 and dy == 1:
            directions.append("south")
        elif dx == 0 and dy == -1:
            directions.append("north")
        else:
            raise ValueError(f"Unexpected step delta: {(dx, dy)}")
    return directions


def normalize_sparc(path: Path):
    by_level = {level: [] for level in range(1, 6)}
    for row in load_jsonl(path):
        if row["solution_count"] != 1:
            continue
        by_level[row["difficulty_level"]].append(row)

    selected = []
    for level, rows in by_level.items():
        rows = sorted(rows, key=lambda row: len(row["solutions"][0]["path"]))
        selected.extend(evenly_spaced(rows, 3))

    tasks = []
    for index, row in enumerate(selected, start=1):
        solution = row["solutions"][0]["path"]
        directions = path_to_directions(solution)
        prompt = (
            f"{row['text_visualization'].strip()}\n\n"
            "Question:\nGive the shortest path from start to end as a comma-separated sequence of cardinal moves."
        )
        level = int(row["difficulty_level"])
        tasks.append({
            "id": f"sparc-test-{row['id']}-{index:02d}",
            "suite_id": "sparc",
            "category": "route",
            "cognitive_level": level,
            "prompt": prompt,
            "expected_answer": ", ".join(directions),
            "answer_format": "direction",
            "difficulty": text_difficulty(level),
        })
    return tasks


def to_ts(value, indent=0):
    space = " " * indent
    if isinstance(value, dict):
        items = []
        for key, item in value.items():
            items.append(f"{space}  {key}: {to_ts(item, indent + 2)}")
        return "{\n" + ",\n".join(items) + f"\n{space}" + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        items = [f"{space}  {to_ts(item, indent + 2)}" for item in value]
        return "[\n" + ",\n".join(items) + f"\n{space}" + "]"
    return json.dumps(value)


def build_output(stepgame_tasks, spartqa_tasks, sparc_tasks):
    suites = [
        {
            "id": "stepgame",
            "name": "StepGame",
            "short_name": "StepGame",
            "description": "Corrected clean validation samples from the StepGame benchmark, normalized for execution.",
            "focus": "Symbolic multi-hop spatial relations.",
            "source_url": "https://github.com/Fangjun-Li/SpatialLM-StepGame",
            "accent": "#38bdf8",
            "tasks": stepgame_tasks,
        },
        {
            "id": "spartqa",
            "name": "SPARTQA",
            "short_name": "SPARTQA",
            "description": "Official processed validation samples from SPARTQA multiple-choice QA.",
            "focus": "Richer textual spatial reasoning.",
            "source_url": "https://huggingface.co/datasets/tasksource/spartqa-mchoice",
            "accent": "#f59e0b",
            "tasks": spartqa_tasks,
        },
        {
            "id": "sparc",
            "name": "SPaRC",
            "short_name": "SPaRC",
            "description": "Official SPaRC test puzzles with unique solutions, normalized into route tasks.",
            "focus": "Constraint-heavy pathfinding.",
            "source_url": "https://huggingface.co/datasets/lkaesberg/SPaRC",
            "accent": "#f43f5e",
            "tasks": sparc_tasks,
        },
    ]

    return f"""import {{ SpatialBenchmarkSuite }} from '../types';

// Generated by scripts/build_spatial_benchmark_suites.py from official dataset files.
export const SPATIAL_BENCHMARK_SUITES: SpatialBenchmarkSuite[] = {to_ts(suites)};

export const SPATIAL_BENCHMARK_SUITE_MAP = Object.fromEntries(
  SPATIAL_BENCHMARK_SUITES.map((suite) => [suite.id, suite])
) as Record<SpatialBenchmarkSuite['id'], SpatialBenchmarkSuite>;

export const SPATIAL_REASONING_TASKS = Object.fromEntries(
  SPATIAL_BENCHMARK_SUITES.map((suite) => [suite.id, suite.tasks])
) as Record<SpatialBenchmarkSuite['id'], SpatialBenchmarkSuite['tasks']>;
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stepgame-prefix", type=Path, default=Path("/tmp/stepgame-qa"))
    parser.add_argument("--spartqa", type=Path, default=Path("/tmp/spartqa-validation.jsonl"))
    parser.add_argument("--sparc", type=Path, default=Path("/tmp/sparc-test.jsonl"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("app/chat/frontend/src/data/spatialBenchmarkSuites.ts"),
    )
    args = parser.parse_args()

    output = build_output(
        normalize_stepgame(args.stepgame_prefix),
        normalize_spartqa(args.spartqa),
        normalize_sparc(args.sparc),
    )
    args.output.write_text(output)


if __name__ == "__main__":
    main()
