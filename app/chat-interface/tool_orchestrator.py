"""
Orchestrator Engine - ToolOrchestra-style multi-turn orchestration
Uses Qwen 2.5-7B as orchestrator with function calling
"""

import os
import json
import logging
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator
from http_client import HTTPClient
from constants import DEFAULT_REMOTE_ENDPOINTS

from tools.model_router import ModelRouter
from tools.web_search import WebSearchTool
from tools.code_executor import CodeExecutorTool

logger = logging.getLogger(__name__)


class ToolOrchestrator:
    """
    Multi-turn orchestration engine
    Uses Qwen as orchestrator to decide which tools/models to call
    """

    def __init__(self, max_rounds: int = 5):
        self.max_rounds = max_rounds
        self.model_router = ModelRouter()
        self.web_search = WebSearchTool()
        self.code_executor = CodeExecutorTool()

        # Orchestrator model endpoint (use Qwen). Treat empty env as unset.
        raw_url = os.getenv("QWEN_API_URL") or DEFAULT_REMOTE_ENDPOINTS["QWEN_API_URL"]
        self.orchestrator_url = raw_url.strip()
        if not (self.orchestrator_url.startswith("http://") or self.orchestrator_url.startswith("https://")):
            # Normalize to http if user provided a bare host:port
            self.orchestrator_url = f"http://{self.orchestrator_url}"

        # Choose defaults based on available endpoints with preference order
        available = set(self.model_router.model_urls.keys())
        def _pick(prefs):
            for m in prefs:
                if m in available:
                    return m
            return None

        reasoner_prefs = [
            "reasoner-4",  # DeepSeek R1 distill
            "reasoner-1",  # Qwen
            "reasoner-2",  # Phi
            "reasoner-3",  # Llama
            "reasoner-7",  # Gemma
            "reasoner-6",  # Mistral
            "reasoner-5",  # RNJ (experimental)
        ]
        answer_prefs = [
            "answer-4",    # DeepSeek R1 distill
            "answer-1",    # Qwen
            "answer-2",    # Phi
            "answer-3",    # Llama
            "answer-7",    # Gemma
            "answer-6",    # Mistral
            "answer-5",    # RNJ (experimental)
        ]

        self.default_reasoner = _pick(reasoner_prefs) or "reasoner-1"
        self.default_answer = _pick(answer_prefs) or "answer-1"

        # Load tools configuration
        tools_config_path = os.path.join(os.path.dirname(__file__), "tools_config.json")
        with open(tools_config_path) as f:
            self.tools = json.load(f)

        # Dynamically prune tool model enums based on configured endpoints
        try:
            available_models = set(self.model_router.model_urls.keys())
            allowed_reasoners = [m for m in sorted(available_models) if m.startswith("reasoner-")]
            allowed_answers = [m for m in sorted(available_models) if m.startswith("answer-")]

            for tool in self.tools:
                fn = tool.get("function", {})
                name = fn.get("name")
                params = fn.get("parameters", {})
                props = params.get("properties", {})
                model_prop = props.get("model", {})
                if name == "enhance_reasoning" and allowed_reasoners:
                    model_prop["enum"] = allowed_reasoners
                elif name == "answer" and allowed_answers:
                    model_prop["enum"] = allowed_answers
        except Exception:
            # Non-fatal: if pruning fails, keep static config
            pass

    async def run_orchestration(
        self,
        query: str,
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run multi-turn orchestration with streaming events

        Yields events:
        - {"event": "round_start", "round": N}
        - {"event": "tool_call", "tool": "...", "arguments": {...}}
        - {"event": "tool_result", "result": {...}}
        - {"event": "orchestrator_thinking", "content": "..."}
        - {"event": "final_answer", "content": "..."}
        - {"event": "complete", "summary": {...}}
        """

        context: List[Dict[str, Any]] = []
        all_tool_calls: List[Dict[str, Any]] = []
        final_answer: Optional[str] = None

        yield {
            "event": "start",
            "query": query,
            "max_rounds": self.max_rounds
        }

        # Prepare initial messages for orchestrator with tools
        messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You are a tool orchestrator. Decide which tools to call and in what order. "
                    "Carefully read the user's query and any provided context. Only call tools you need. "
                    "When you have enough information, do not call any tool and instead provide the final answer."
                ),
            },
            {
                "role": "user",
                "content": query,
            },
        ]

        for round_num in range(self.max_rounds):
            yield {"event": "round_start", "round": round_num + 1}

            # Refresh context summary for the orchestrator
            context_str = self._build_context(context)
            if context_str:
                messages.append({
                    "role": "system",
                    "content": f"Context so far:\n{context_str}",
                })

            # Ask orchestrator what to do next
            decision = await self._call_orchestrator(messages, self.tools, temperature=temperature)

            if decision.get("content"):
                yield {"event": "orchestrator_thinking", "content": decision["content"]}
                # Record the orchestrator message for continuity
                messages.append({"role": "assistant", "content": decision["content"]})

            tool_calls = decision.get("tool_calls", []) or []
            if not tool_calls:
                # No tool calls requested — treat content as final answer if present
                if decision.get("content"):
                    final_answer = decision.get("content")
                    break

                # Fallback: orchestrate a minimal pipeline when function-calling is unsupported
                # Heuristic: search if query implies recency; otherwise reason -> answer
                lowered = query.lower()
                needs_search = any(w in lowered for w in [
                    "search", "online", "current", "latest", "recent", "news", "today"
                ])

                fallback_plan = []
                if needs_search:
                    fallback_plan.append(("search", {"query": query, "num_results": 3}))
                # Always add a reasoning pass for structure
                fallback_plan.append((
                    "enhance_reasoning",
                    {"model": self.default_reasoner, "problem": query, "context": context_str}
                ))
                # And produce a final answer
                default_answer = self.default_answer
                fallback_plan.append((
                    "answer",
                    {"model": default_answer, "problem": query, "context": context_str}
                ))

                for tool_name, tool_args in fallback_plan:
                    yield {"event": "tool_call", "tool": tool_name, "arguments": tool_args}
                    try:
                        tool_result = await self._execute_tool(tool_name, tool_args)
                    except Exception as e:
                        tool_result = {"error": str(e), "tool": tool_name}

                    yield {"event": "tool_result", "tool": tool_name, "result": tool_result}

                    context.append({
                        "round": round_num + 1,
                        "tool": tool_name,
                        "arguments": tool_args,
                        "result": tool_result,
                    })
                    all_tool_calls.append({"tool": tool_name, "arguments": tool_args})

                    # Capture answer content as final
                    if tool_name == "answer" and tool_result.get("content"):
                        final_answer = tool_result.get("content", "")
                        break

                if final_answer:
                    break
                # If still nothing, synthesize from accumulated context
                final_answer = await self._generate_final_answer(query, self._build_context(context))
                break

            # Execute tools sequentially; push results back as context
            for call in tool_calls:
                tool_name = call.get("name")
                tool_args = call.get("arguments", {})

                # Fill in defaults for our tools if missing
                if tool_name == "enhance_reasoning" and "model" not in tool_args:
                    tool_args["model"] = self.default_reasoner
                    tool_args["problem"] = tool_args.get("problem", query)
                    tool_args["context"] = tool_args.get("context", context_str)
                elif tool_name == "answer" and "model" not in tool_args:
                    tool_args["model"] = self.default_answer
                    tool_args["problem"] = tool_args.get("problem", query)
                    tool_args["context"] = tool_args.get("context", context_str)

                yield {"event": "tool_call", "tool": tool_name, "arguments": tool_args}

                try:
                    tool_result = await self._execute_tool(tool_name, tool_args)
                except Exception as e:
                    tool_result = {"error": str(e), "tool": tool_name}

                yield {"event": "tool_result", "tool": tool_name, "result": tool_result}

                context.append({
                    "round": round_num + 1,
                    "tool": tool_name,
                    "arguments": tool_args,
                    "result": tool_result,
                })
                all_tool_calls.append({"tool": tool_name, "arguments": tool_args})

                # Provide tool results back to orchestrator as a compact JSON string
                try:
                    tool_result_str = json.dumps(tool_result)[:4000]
                except Exception:
                    tool_result_str = str(tool_result)[:4000]
                messages.append({
                    "role": "system",
                    "content": f"Tool {tool_name} result:\n{tool_result_str}",
                })

                # If the tool was 'answer', we can treat it as final
                if tool_name == "answer" and tool_result.get("content"):
                    final_answer = tool_result.get("content", "")
                    break

            if final_answer:
                break

        # Provide final answer
        if not final_answer:
            # If we didn't get a final answer, ask orchestrator to synthesize one
            context_str = self._build_context(context)
            final_answer = await self._generate_final_answer(query, context_str)

        yield {"event": "final_answer", "content": final_answer}

        yield {
            "event": "complete",
            "summary": {
                "framework": "ToolOrchestrator",
                "status": "success",
                "total_rounds": len(context),
                "tools_used": [tc["tool"] for tc in all_tool_calls],
                "final_answer": final_answer
            }
        }

    def _build_context(self, context: List[Dict[str, Any]]) -> str:
        """Build context string from previous rounds"""
        if not context:
            return ""

        context_parts = []
        for entry in context:
            tool = entry["tool"]
            result = entry["result"]

            if tool == "enhance_reasoning":
                context_parts.append(f"Reasoning ({result.get('model_name', 'unknown')}):\n{result.get('content', '')}")

            elif tool == "search":
                context_parts.append(self.web_search.format_results_for_context(result))

            elif tool == "code_interpreter":
                context_parts.append(self.code_executor.format_result_for_context(result))

            elif tool == "answer":
                context_parts.append(f"Answer ({result.get('model_name', 'unknown')}):\n{result.get('content', '')}")

        return "\n\n".join(context_parts)

    async def _call_orchestrator(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]],
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Call the orchestrator model with function calling"""
        client = HTTPClient.get_client()
        payload = {
            "messages": messages,
            "tools": tools,
            "max_tokens": 2048,
            "temperature": temperature
        }

        try:
            response = await client.post(
                f"{self.orchestrator_url}/v1/chat/completions",
                json=payload
            )
            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"Orchestrator API error: {response.status_code} - {error_text}")

            data = response.json()
            if "choices" not in data or not data["choices"]:
                raise Exception("No choices in orchestrator response")
            message = data["choices"][0]["message"]

            # Extract tool calls
            tool_calls = []
            if message.get("tool_calls"):
                for tc in message["tool_calls"]:
                    tool_calls.append({
                        "name": tc["function"]["name"],
                        "arguments": json.loads(tc["function"]["arguments"])
                    })

            return {
                "content": message.get("content", ""),
                "tool_calls": tool_calls
            }
        except httpx.HTTPError as e:
            raise Exception(f"Orchestrator network error: {str(e)}")

    async def _execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a tool and return results"""

        if tool_name == "enhance_reasoning":
            return await self.model_router.enhance_reasoning(
                model=arguments.get("model"),
                problem=arguments.get("problem", ""),
                context=arguments.get("context", ""),
                reasoning_focus=arguments.get("reasoning_focus")
            )

        elif tool_name == "answer":
            return await self.model_router.answer(
                model=arguments.get("model"),
                problem=arguments.get("problem", ""),
                context=arguments.get("context", "")
            )

        elif tool_name == "search":
            return await self.web_search.search(
                query=arguments.get("query"),
                num_results=arguments.get("num_results", 3)
            )

        elif tool_name == "code_interpreter":
            return await self.code_executor.execute(
                code=arguments.get("code"),
                timeout=arguments.get("timeout", 10)
            )

        else:
            raise ValueError(f"Unknown tool: {tool_name}")

    async def _generate_final_answer(
        self,
        query: str,
        context: str
    ) -> str:
        """Generate final answer from context"""
        messages = [
            {
                "role": "system",
                "content": "You are a helpful AI assistant. Synthesize the available information to provide a comprehensive answer."
            },
            {
                "role": "user",
                "content": f"Question: {query}\n\nContext:\n{context}\n\nProvide a final answer based on the above information."
            }
        ]

        client = HTTPClient.get_client()
        payload = {
            "messages": messages,
            "max_tokens": 2048,
            "temperature": 0.7
        }

        try:
            response = await client.post(
                f"{self.orchestrator_url}/v1/chat/completions",
                json=payload
            )
            if response.status_code != 200:
                return "Unable to generate final answer."

            data = response.json()
            if "choices" not in data or not data["choices"]:
                return "Unable to generate final answer (empty response)."
            return data["choices"][0]["message"]["content"]
        except httpx.HTTPError:
            return "Unable to generate final answer (network error)."
