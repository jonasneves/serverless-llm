"""
Council Mode - Anonymized Peer Review

3-stage process:
1. Stage 1: All models respond independently (parallel)
2. Stage 2: Models rank responses anonymously
3. Stage 3: Chairman synthesizes final answer using rankings
"""

from typing import List, Dict, Any, AsyncGenerator, Tuple
import asyncio
import json
import re
import random
from collections import defaultdict
from model_profiles import MODEL_PROFILES
from error_utils import sanitize_error_message
from rate_limiter import get_rate_limiter

# Pre-defined quip templates for faster response (used as fallback)
CHAIRMAN_QUIP_TEMPLATES = {
    "waiting": [
        "Hmm, {model} is taking their time... probably consulting ancient scrolls.",
        "{model} appears to be deep in thought. The gears are turning!",
        "Waiting on {model}... they're crafting something special, I'm sure.",
        "{model} is still cooking. Good things take time!",
        "The suspense builds as we await {model}'s wisdom...",
        "{model} seems to be having a philosophical moment.",
        "Patience... {model} is working their magic.",
        "{model} is probably double-checking their math. Respect.",
        "Meanwhile, {model} is contemplating the universe...",
        "The council waits patiently for {model}'s wisdom.",
        "{model} is being thorough. Quality over speed!",
        "☕ Coffee break while {model} thinks...",
        "{model} is writing an essay, apparently.",
        "I wonder what {model} is up to... 🤔",
    ],
    "slow": [
        "{model} is being extra thorough today. Respect the process!",
        "Still waiting on {model}... they must be writing a novel.",
        "{model} is fashionably late to the party.",
        "The floor is still {model}'s... any moment now!",
        "{model} is really taking their sweet time here...",
        "Is {model} okay? That's a lot of thinking!",
        "{model} appears to be writing a dissertation.",
    ],
    "first_done": [
        "And {model} takes the lead! First one done.",
        "{model} came in hot! Speed demon of the council.",
        "Lightning fast! {model} is already finished.",
        "🏆 First place goes to {model}!",
        "{model} is the early bird today!",
        "{model} wastes no time! Impressive.",
    ],
    "all_done": [
        "All models have spoken! Let the deliberation begin.",
        "The council has convened. All responses are in!",
        "Excellent! Everyone's had their say. Time for judgment.",
        "🎯 All responses collected. Now the fun begins!",
        "The floor is closed. Ranking time!",
        "All voices heard. Democracy in action!",
    ],
    "ranking_wait": [
        "The models are now judging each other... this should be interesting.",
        "Anonymous peer review in progress. No one knows who wrote what!",
        "Models are ranking responses. The democracy of AI at work.",
        "🗳️ Votes are being cast... anonymously!",
        "Who will come out on top? The suspense!",
        "The council deliberates in secret...",
        "Each model judges the others. No bias, no mercy!",
    ],
}


class CouncilEngine:
    """Orchestrates the 3-stage council process with anonymized peer review"""

    def __init__(
        self,
        model_endpoints: Dict[str, str],
        github_token: str = None,
        timeout: int = 120
    ):
        """
        Initialize council engine

        Args:
            model_endpoints: Dict mapping model_id -> API URL for local models
            github_token: GitHub token for API models
            timeout: Max seconds per stage
        """
        self.model_endpoints = model_endpoints
        self.github_token = github_token
        self.timeout = timeout
        self._quip_cache = {}  # Cache for generated quips
        self._last_quip_time = 0
        self._quip_cooldown = 4.0  # Seconds between quips
        
        # Initialize unified model client
        from model_client import ModelClient
        self.client = ModelClient(github_token)

    def generate_quip(
        self,
        quip_type: str,
        model_name: str = None,
        topic: str = None,
        waiting_models: List[str] = None
    ) -> str:
        """
        Generate a chairman quip (template-based for fast response)
        
        Args:
            quip_type: Type of quip (waiting, slow, first_done, all_done, ranking_wait)
            model_name: Name of model being referenced
            topic: Original query topic for context
            waiting_models: List of models still working
            
        Returns:
            A witty quip string
        """
        templates = CHAIRMAN_QUIP_TEMPLATES.get(quip_type, CHAIRMAN_QUIP_TEMPLATES["waiting"])
        template = random.choice(templates)
        
        if model_name:
            return template.format(model=model_name)
        elif waiting_models and len(waiting_models) > 0:
            # Pick a random waiting model to comment on
            model = random.choice(waiting_models)
            return template.format(model=model)
        return template.format(model="the models")

    async def generate_contextual_quip(
        self,
        chairman_model: str,
        waiting_models: List[str],
        topic: str,
        completed_count: int,
        total_count: int
    ) -> str:
        """
        Generate an AI-powered contextual quip from the chairman
        
        This is more expensive (API call) but produces topic-aware humor.
        Falls back to template if generation fails.
        """
        try:
            # Build a fun prompt for the chairman
            waiting_names = [MODEL_PROFILES.get(m, {}).get("display_name", m) for m in waiting_models]
            waiting_list = ", ".join(waiting_names) if waiting_names else "the remaining models"
            
            quip_prompt = f"""You are the witty Chairman of an AI Council. The council is discussing: "{topic}"

Currently {completed_count}/{total_count} models have responded. We're waiting on: {waiting_list}.

Generate a single SHORT (under 15 words), witty, slightly humorous comment about waiting for these models. 
Be playful but not mean. You can reference the topic if it's funny. Just output the quip, nothing else."""

            messages = [{"role": "user", "content": quip_prompt}]
            result = await self._call_model(chairman_model, messages, max_tokens=50)
            quip = result.get("content", "").strip().strip('"').strip("'")
            
            # Validate the quip isn't too long
            if len(quip) < 100 and len(quip) > 5:
                return quip
                
        except Exception:
            pass  # Fall through to template
        
        # Fallback to template
        return self.generate_quip("waiting", waiting_models=waiting_models)

    async def _call_model(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Call a single model and return response (non-streaming wrapper)
        """
        if stream:
             raise ValueError("Stream=True not supported in _call_model wrapper, use _stream_model_response")
        
        return await self.client.call_model(
            model_id=model_id,
            messages=messages,
            max_tokens=max_tokens
        )

    async def _stream_model_response(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream a single model's response, yielding chunks as they arrive
        """
        try:
            full_response = ""
            async for event in self.client.stream_model(model_id, messages, max_tokens):
                if event["type"] == "chunk":
                    content = event["content"]
                    full_response += content
                    yield {"chunk": content, "full_response": full_response}
                elif event["type"] == "done":
                    full_response = event.get("full_content", full_response) # sync optional
                    yield {"complete": True, "full_response": full_response}
                elif event["type"] == "error":
                    yield {"error": event["error"]}
                    
        except Exception as e:
            yield {"error": str(e)}

    async def stage1_collect_responses(
        self,
        query: str,
        participants: List[str],
        max_tokens: int = 2048,
        completed_responses: Dict[str, str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stage 1: Collect independent responses from all models in parallel with streaming

        Args:
            query: User query
            participants: List of model IDs to participate
            max_tokens: Max tokens per response
            completed_responses: Dict[model_id, response] for already finished models

        Yields:
            Events: stage1_start, model_start, model_chunk, model_response, stage1_complete
        """
        yield {"type": "stage1_start", "participants": participants}

        messages = [{"role": "user", "content": query}]
        stage1_results = []
        model_responses = {model_id: "" for model_id in participants}
        
        # Split participants into completed and active
        completed_responses = completed_responses or {}
        active_participants = []
        
        # First, process already completed models
        for model_id in participants:
            if model_id in completed_responses:
                response = completed_responses[model_id]
                model_name = MODEL_PROFILES.get(model_id, {}).get("display_name", model_id)
                model_responses[model_id] = response
                
                # Emit events as if it just finished
                # yield {"type": "model_start", "model_id": model_id, "model_name": model_name} # Optional?
                stage1_results.append({
                    "model_id": model_id,
                    "model_name": model_name,
                    "response": response
                })
                yield {
                    "type": "model_response",
                    "model_id": model_id,
                    "model_name": model_name,
                    "response": response
                }
            else:
                active_participants.append(model_id)

        if not active_participants and stage1_results:
             yield {"type": "stage1_complete", "results": stage1_results}
             return

        # Create streaming tasks for ACTIVE models only
        async def stream_model(model_id: str):
            """Stream a single model and yield events"""
            model_name = MODEL_PROFILES.get(model_id, {}).get("display_name", model_id)

            # Notify that this model is starting
            yield {
                "type": "model_start",
                "model_id": model_id,
                "model_name": model_name
            }

            async for event in self._stream_model_response(model_id, messages, max_tokens):
                if "error" in event:
                    yield {
                        "type": "model_error",
                        "model_id": model_id,
                        "model_name": model_name,
                        "error": event["error"]
                    }
                    break
                elif "chunk" in event:
                    model_responses[model_id] = event["full_response"]
                    yield {
                        "type": "model_chunk",
                        "model_id": model_id,
                        "model_name": model_name,
                        "chunk": event["chunk"],
                        "full_response": event["full_response"]
                    }
                elif event.get("complete"):
                    final_response = event["full_response"]
                    model_responses[model_id] = final_response
                    stage1_results.append({
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response
                    })
                    yield {
                        "type": "model_response",
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response
                    }

        # Stream all active models concurrently
        tasks = [stream_model(model_id) for model_id in active_participants]

        # Merge all streams
        async for event in self._merge_streams(tasks):
            yield event

        yield {"type": "stage1_complete", "results": stage1_results}

    async def _merge_streams(self, generators: List[AsyncGenerator]) -> AsyncGenerator[Dict[str, Any], None]:
        """Merge multiple async generators into one stream"""
        queues = [asyncio.Queue() for _ in generators]

        async def consume(gen, queue):
            try:
                async for item in gen:
                    await queue.put(item)
            finally:
                await queue.put(None)  # Signal completion

        # Start all consumers
        consumers = [asyncio.create_task(consume(gen, queue)) for gen, queue in zip(generators, queues)]

        # Yield items as they arrive from any queue
        active = len(queues)
        while active > 0:
            for queue in queues:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.01)
                    if item is None:
                        active -= 1
                    else:
                        yield item
                except asyncio.TimeoutError:
                    continue

        # Wait for all consumers to finish
        await asyncio.gather(*consumers)

    def _parse_ranking(self, ranking_text: str) -> List[str]:
        """
        Parse FINAL RANKING section from model's response

        Args:
            ranking_text: Full text response

        Returns:
            List of response labels in ranked order
        """
        if "FINAL RANKING:" in ranking_text:
            parts = ranking_text.split("FINAL RANKING:")
            if len(parts) >= 2:
                ranking_section = parts[1]

                # Look for numbered list (e.g., "1. Response A")
                numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
                if numbered_matches:
                    return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]

                # Fallback: Extract all "Response X" patterns
                matches = re.findall(r'Response [A-Z]', ranking_section)
                return matches

        # Final fallback
        matches = re.findall(r'Response [A-Z]', ranking_text)
        return matches

    async def stage2_collect_rankings(
        self,
        query: str,
        stage1_results: List[Dict[str, Any]],
        participants: List[str]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stage 2: Models rank anonymized responses

        Args:
            query: Original user query
            stage1_results: Results from Stage 1
            participants: List of model IDs

        Yields:
            Events: stage2_start, ranking_response, stage2_complete
        """
        yield {"type": "stage2_start"}

        # Create anonymized labels
        labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

        label_to_model = {
            f"Response {label}": result["model_id"]
            for label, result in zip(labels, stage1_results)
        }

        # Build ranking prompt
        responses_text = "\n\n".join([
            f"Response {label}:\n{result['response']}"
            for label, result in zip(labels, stage1_results)
        ])

        ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. Evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. At the very end, provide a final ranking.
3. Do NOT reveal your identity. Do NOT mention your model name. Do NOT quote or repeat the prompt.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with "FINAL RANKING:" (all caps, with colon)
- List responses from best to worst as a numbered list
- Each line: number, period, space, then ONLY the response label (e.g., "1. Response A")

Example format:

Response A provides good detail but misses X...
Response B is accurate but lacks depth...

FINAL RANKING:
1. Response B
2. Response A

Now provide your evaluation and ranking:"""

        messages = [
            {
                "role": "system",
                "content": "You are an anonymous reviewer. Follow instructions exactly. Output only your review and FINAL RANKING."
            },
            {"role": "user", "content": ranking_prompt},
        ]

        # Run rankings concurrently and stream results as they complete
        # Create wrapper coroutines that preserve model_id
        async def call_with_id(model_id: str):
            try:
                result = await asyncio.wait_for(self._call_model(model_id, messages), timeout=self.timeout)
                return (model_id, result, None)
            except Exception as e:
                return (model_id, None, e)

        tasks = [call_with_id(model_id) for model_id in participants]

        stage2_results = []
        for future in asyncio.as_completed(tasks):
            model_id, result, error = await future

            if error:
                yield {
                    "type": "ranking_error",
                    "model_id": model_id,
                    "error": str(error)
                }
                continue

            ranking_text = result.get("content", "")
            parsed = self._parse_ranking(ranking_text)

            stage2_results.append({
                "model_id": model_id,
                "model_name": MODEL_PROFILES.get(model_id, {}).get("display_name", model_id),
                "ranking": ranking_text,
                "parsed_ranking": parsed
            })

            yield {
                "type": "ranking_response",
                "model_id": model_id,
                "model_name": MODEL_PROFILES.get(model_id, {}).get("display_name", model_id),
                "ranking": ranking_text,
                "parsed_ranking": parsed
            }

        # Calculate aggregate rankings
        aggregate = self._calculate_aggregate_rankings(stage2_results, label_to_model)

        yield {
            "type": "stage2_complete",
            "results": stage2_results,
            "label_to_model": label_to_model,
            "aggregate_rankings": aggregate
        }

    def _calculate_aggregate_rankings(
        self,
        stage2_results: List[Dict[str, Any]],
        label_to_model: Dict[str, str]
    ) -> List[Dict[str, Any]]:
        """Calculate aggregate rankings across all models"""
        model_positions = defaultdict(list)

        for ranking in stage2_results:
            parsed_ranking = ranking.get("parsed_ranking", [])

            for position, label in enumerate(parsed_ranking, start=1):
                if label in label_to_model:
                    model_id = label_to_model[label]
                    model_positions[model_id].append(position)

        # Calculate average position
        aggregate = []
        for model_id, positions in model_positions.items():
            if positions:
                avg_rank = sum(positions) / len(positions)
                aggregate.append({
                    "model_id": model_id,
                    "model_name": MODEL_PROFILES.get(model_id, {}).get("display_name", model_id),
                    "average_rank": round(avg_rank, 2),
                    "votes_count": len(positions)
                })

        # Sort by average rank (lower is better)
        aggregate.sort(key=lambda x: x["average_rank"])

        return aggregate

    async def stage3_synthesize(
        self,
        query: str,
        stage1_results: List[Dict[str, Any]],
        stage2_results: List[Dict[str, Any]],
        chairman_model: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stage 3: Chairman synthesizes final response

        Args:
            query: Original user query
            stage1_results: Individual responses
            stage2_results: Rankings
            chairman_model: Model ID for chairman

        Yields:
            Events: stage3_start, stage3_complete
        """
        yield {"type": "stage3_start", "chairman": chairman_model}

        # Build context
        stage1_text = "\n\n".join([
            f"Model: {result['model_name']}\nResponse: {result['response']}"
            for result in stage1_results
        ])

        stage2_text = "\n\n".join([
            f"Model: {result['model_name']}\nRanking: {result['ranking']}"
            for result in stage2_results
        ])

        chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: {query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task:
- Synthesize the best final answer using the Stage 1 responses and the Stage 2 peer reviews.
- Do NOT repeat or quote any of the prompt text above.
- Do NOT include analysis, chain-of-thought, rankings, or meta-commentary.
- Output ONLY the final answer to the original question as plain text.

Final answer:"""

        messages = [
            {
                "role": "system",
                "content": "You are the council chairman. Return only the final answer, with no extra sections."
            },
            {"role": "user", "content": chairman_prompt},
        ]

        try:
            result = await self._call_model(chairman_model, messages, max_tokens=4096)
            final_response = result.get("content", "")

            yield {
                "type": "stage3_complete",
                "chairman": chairman_model,
                "chairman_name": MODEL_PROFILES.get(chairman_model, {}).get("display_name", chairman_model),
                "response": final_response
            }

        except Exception as e:
            yield {
                "type": "stage3_error",
                "error": str(e),
                "response": "Error: Unable to generate final synthesis."
            }

    async def run_council(
        self,
        query: str,
        participants: List[str],
        chairman_model: str = None,
        max_tokens: int = 2048,
        enable_quips: bool = True,
        completed_responses: Dict[str, str] = None 
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run the complete 3-stage council process with chairman quips

        Args:
            query: User query
            participants: List of model IDs to participate
            chairman_model: Optional chairman model (defaults to first participant)
            max_tokens: Max tokens per response
            enable_quips: Whether to emit chairman quips during waits
            completed_responses: Dict of already completed responses
        """
        import time
        
        if not participants:
            yield {"type": "error", "error": "No participants selected"}
            return

        chairman = chairman_model or participants[0]
        yield {"type": "council_start", "participants": participants, "chairman": chairman}

        # Track model completion for quips
        completed_models = set(completed_responses.keys()) if completed_responses else set()
        active_models = set([p for p in participants if p not in completed_models])
        
        last_quip_time = time.time()
        first_model_done = len(completed_models) > 0 # Initial done state/quip logic might need adjusting
        
        # Stage 1: Collect responses (with streaming and quips)
        stage1_results = []
        async for event in self.stage1_collect_responses(query, participants, max_tokens, completed_responses):
            yield event
            
            # Track completions
            if event["type"] == "model_response":
                completed_models.add(event["model_id"])
                active_models.discard(event["model_id"])
                
                # Quip when first model finishes (only if it wasn't already done)
                if enable_quips and not first_model_done:
                    first_model_done = True
                    quip = self.generate_quip("first_done", model_name=event["model_name"])
                    yield {"type": "chairman_quip", "quip": quip}
                    last_quip_time = time.time()
                    
            elif event["type"] == "model_chunk" and enable_quips:
                # Periodically emit waiting quips
                current_time = time.time()
                if current_time - last_quip_time > self._quip_cooldown and len(active_models) > 0 and len(completed_models) > 0:
                    waiting_names = [MODEL_PROFILES.get(m, {}).get("display_name", m) for m in active_models]
                    quip = self.generate_quip("waiting", waiting_models=waiting_names)
                    yield {"type": "chairman_quip", "quip": quip}
                    last_quip_time = current_time
                    
            elif event["type"] == "stage1_complete":
                stage1_results = event["results"]
                # Quip when all done
                if enable_quips:
                    quip = self.generate_quip("all_done")
                    yield {"type": "chairman_quip", "quip": quip}

        if not stage1_results:
            yield {"type": "error", "error": "All models failed in Stage 1"}
            return

        # Stage 2: Collect rankings (with quips)
        stage2_results = []
        label_to_model = {}
        aggregate_rankings = []
        
        if enable_quips:
            quip = self.generate_quip("ranking_wait")
            yield {"type": "chairman_quip", "quip": quip}

        async for event in self.stage2_collect_rankings(query, stage1_results, participants):
            yield event
            if event["type"] == "stage2_complete":
                stage2_results = event["results"]
                label_to_model = event["label_to_model"]
                aggregate_rankings = event["aggregate_rankings"]

        # Stage 3: Synthesize
        async for event in self.stage3_synthesize(query, stage1_results, stage2_results, chairman):
            yield event

        yield {
            "type": "council_complete",
            "aggregate_rankings": aggregate_rankings
        }
