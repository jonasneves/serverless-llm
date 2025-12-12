#!/usr/bin/env python3
"""
Benchmark local model endpoints (OpenAI-compatible) for latency and throughput.

Examples:
  export QWEN_API_URL=http://localhost:8001
  export PHI_API_URL=http://localhost:8002
  python scripts/bench_models.py --models qwen phi --stream

This script is intentionally dependency-free (stdlib only).
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse


MODEL_ENV_MAP: dict[str, str] = {
    "qwen": "QWEN_API_URL",
    "r1qwen": "R1QWEN_API_URL",
    "phi": "PHI_API_URL",
    "llama": "LLAMA_API_URL",
    "mistral": "MISTRAL_API_URL",
    "gemma": "GEMMA_API_URL",
    "rnj": "RNJ_API_URL",
}


@dataclass
class BenchResult:
    model: str
    url: str
    ok: bool
    status: Optional[int] = None
    error: Optional[str] = None

    # Timings
    ttfb_ms: Optional[int] = None
    ttft_ms: Optional[int] = None
    total_ms: Optional[int] = None

    # Tokens
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

    # Server-reported perf (if include_perf is supported)
    perf: Optional[dict[str, Any]] = None


def _normalize_url(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return raw
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw.rstrip("/")
    return f"http://{raw}".rstrip("/")


def _open_connection(parsed, *, timeout: float) -> http.client.HTTPConnection:
    host = parsed.hostname
    if not host:
        raise ValueError(f"Invalid URL host: {parsed.geturl()}")
    port = parsed.port
    if parsed.scheme == "https":
        return http.client.HTTPSConnection(host, port or 443, timeout=timeout)
    return http.client.HTTPConnection(host, port or 80, timeout=timeout)


def _sse_iter_json_lines(response) -> Any:
    while True:
        raw = response.readline()
        if not raw:
            return
        line = raw.decode("utf-8", errors="ignore").strip()
        if not line or line.startswith(":"):
            continue
        if not line.startswith("data:"):
            continue
        data_str = line[len("data:") :].strip()
        if data_str == "[DONE]":
            return
        try:
            yield json.loads(data_str)
        except json.JSONDecodeError:
            continue


def bench_endpoint(
    *,
    model: str,
    base_url: str,
    prompt: str,
    max_tokens: int,
    temperature: float,
    stream: bool,
    include_perf: bool,
    timeout_s: float,
) -> BenchResult:
    url = _normalize_url(base_url)
    parsed = urlparse(url)
    result = BenchResult(model=model, url=url, ok=False)

    path = (parsed.path.rstrip("/") if parsed.path else "") + "/v1/chat/completions"
    payload: dict[str, Any] = {
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if stream:
        payload["stream"] = True
    if include_perf:
        payload["include_perf"] = True

    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream" if stream else "application/json"}

    start = time.perf_counter()
    try:
        conn = _open_connection(parsed, timeout=timeout_s)
        try:
            conn.request("POST", path, body=body, headers=headers)
            response = conn.getresponse()
            ttfb = time.perf_counter()
            result.status = response.status
            result.ttfb_ms = int((ttfb - start) * 1000)

            if response.status != 200:
                raw = response.read(1024 * 16)
                result.error = raw.decode("utf-8", errors="ignore").strip() or f"HTTP {response.status}"
                return result

            if not stream:
                raw = response.read()
                end = time.perf_counter()
                result.total_ms = int((end - start) * 1000)

                data = json.loads(raw.decode("utf-8", errors="ignore"))
                usage = data.get("usage") or {}
                result.prompt_tokens = usage.get("prompt_tokens")
                result.completion_tokens = usage.get("completion_tokens")
                result.total_tokens = usage.get("total_tokens")
                perf = data.get("perf")
                if isinstance(perf, dict):
                    result.perf = perf

                result.ok = True
                return result

            # Stream mode
            first_token_at: Optional[float] = None
            usage: Optional[dict[str, Any]] = None
            perf: Optional[dict[str, Any]] = None

            for obj in _sse_iter_json_lines(response):
                if isinstance(obj, dict):
                    if perf is None and isinstance(obj.get("perf"), dict):
                        perf = obj["perf"]
                    if usage is None and isinstance(obj.get("usage"), dict):
                        usage = obj["usage"]

                    try:
                        choices = obj.get("choices") or []
                        delta = choices[0].get("delta", {}) if choices else {}
                        content = delta.get("content")
                    except Exception:
                        content = None

                    if first_token_at is None and content:
                        first_token_at = time.perf_counter()

            end = time.perf_counter()
            result.total_ms = int((end - start) * 1000)
            if first_token_at is not None:
                result.ttft_ms = int((first_token_at - start) * 1000)

            if usage:
                result.prompt_tokens = usage.get("prompt_tokens")
                result.completion_tokens = usage.get("completion_tokens")
                result.total_tokens = usage.get("total_tokens")
            if perf:
                result.perf = perf

            result.ok = True
            return result
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception as e:
        result.error = str(e)
        return result


def _print_result(r: BenchResult) -> None:
    if not r.ok:
        err = r.error or "unknown error"
        status = f"HTTP {r.status}" if r.status else "no status"
        print(f"{r.model:7}  FAIL  {status}  {err}")
        return

    tokens = (
        f"{r.prompt_tokens}/{r.completion_tokens}/{r.total_tokens}"
        if r.prompt_tokens is not None and r.completion_tokens is not None and r.total_tokens is not None
        else "—"
    )
    ttft = f"{r.ttft_ms}ms" if r.ttft_ms is not None else "—"
    ttfb = f"{r.ttfb_ms}ms" if r.ttfb_ms is not None else "—"
    total = f"{r.total_ms}ms" if r.total_ms is not None else "—"

    extra = ""
    if r.perf:
        queue_ms = r.perf.get("queue_ms")
        completion_tps = r.perf.get("completion_tps")
        compute_ms = r.perf.get("compute_ms") or r.perf.get("generation_ms")
        extra = f"  queue={queue_ms}ms compute={compute_ms}ms tps={completion_tps}"

    print(f"{r.model:7}  OK    ttfb={ttfb:>7} ttft={ttft:>7} total={total:>7} tokens={tokens}{extra}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="*", default=list(MODEL_ENV_MAP.keys()))
    parser.add_argument("--prompt", default="Write one short sentence about latency.")
    parser.add_argument("--max-tokens", type=int, default=128)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--stream", action="store_true", help="Use SSE streaming and measure TTFT.")
    parser.add_argument("--include-perf", action="store_true", help="Ask server to include perf metrics (if supported).")
    parser.add_argument("--timeout", type=float, default=120.0, help="Socket timeout (seconds).")
    args = parser.parse_args(argv)

    unknown = [m for m in args.models if m not in MODEL_ENV_MAP]
    if unknown:
        print(f"Unknown models: {unknown}. Known: {sorted(MODEL_ENV_MAP.keys())}", file=sys.stderr)
        return 2

    selected: list[tuple[str, str]] = []
    for model in args.models:
        env = MODEL_ENV_MAP[model]
        url = os.getenv(env, "").strip()
        if not url:
            continue
        selected.append((model, url))

    if not selected:
        print("No model endpoints configured. Set env vars like QWEN_API_URL, PHI_API_URL, ...", file=sys.stderr)
        return 2

    for model, url in selected:
        r = bench_endpoint(
            model=model,
            base_url=url,
            prompt=args.prompt,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            stream=args.stream,
            include_perf=args.include_perf,
            timeout_s=args.timeout,
        )
        _print_result(r)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

