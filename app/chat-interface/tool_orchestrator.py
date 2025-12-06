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

        # Orchestrator model endpoint (use Qwen)
        self.orchestrator_url = os.getenv("QWEN_API_URL", "https://qwen.neevs.io")

        # Prefer DeepSeek R1 Distill Qwen 1.5B for reasoning if available
        self.default_reasoner = "reasoner-4" if os.getenv("R1QWEN_API_URL") else "reasoner-1"

        # Load tools configuration
        tools_config_path = os.path.join(os.path.dirname(__file__), "tools_config.json")
        with open(tools_config_path) as f:
            self.tools = json.load(f)

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

        context = []
        all_tool_calls = []
        final_answer = None

        yield {
            "event": "start",
            "query": query,
            "max_rounds": self.max_rounds
        }

        for round_num in range(self.max_rounds):
            yield {
                "event": "round_start",
                "round": round_num + 1
            }

            # Build context from previous rounds
            context_str = self._build_context(context)

            # Determine which tool to call based on query and context
            # Use a simpler approach: directly infer the tool from the query
            if round_num == 0:
                # First round - analyze what we need
                if any(word in query.lower() for word in ["search", "online", "current", "latest", "recent", "find information"]):
                    # Web search needed - clean up the query
                    search_query = query.lower()
                    # Remove common instruction phrases
                    for phrase in ["search web for", "search for", "find information about", "look up", "search online for", "find online"]:
                        search_query = search_query.replace(phrase, "")
                    search_query = search_query.strip()

                    tool_name = "search"
                    tool_args = {"query": search_query, "num_results": 3}
                elif any(word in query.lower() for word in ["code", "python", "calculate", "compute", "program"]):
                    # Might need code execution or reasoning
                    tool_name = "enhance_reasoning"
                    tool_args = {"model": self.default_reasoner, "problem": query, "context": context_str}
                else:
                    # General reasoning
                    tool_name = "enhance_reasoning"
                    tool_args = {"model": self.default_reasoner, "problem": query, "context": context_str}

                yield {
                    "event": "tool_call",
                    "tool": tool_name,
                    "arguments": tool_args
                }

                # Execute tool
                tool_result = await self._execute_tool(tool_name, tool_args)

                yield {
                    "event": "tool_result",
                    "tool": tool_name,
                    "result": tool_result
                }

                # Add to context
                context.append({
                    "round": round_num + 1,
                    "tool": tool_name,
                    "arguments": tool_args,
                    "result": tool_result
                })

                all_tool_calls.append({
                    "tool": tool_name,
                    "arguments": tool_args
                })

            # After first round, generate final answer
            if round_num > 0 or len(context) > 0:
                # We have enough info, generate final answer
                tool_name = "answer"
                # If R1 Distill is available, you may prefer its careful answers
                default_answer = "answer-4" if os.getenv("R1QWEN_API_URL") else "answer-1"
                tool_args = {"model": default_answer, "problem": query, "context": context_str}

                yield {
                    "event": "tool_call",
                    "tool": tool_name,
                    "arguments": tool_args
                }

                tool_result = await self._execute_tool(tool_name, tool_args)

                yield {
                    "event": "tool_result",
                    "tool": tool_name,
                    "result": tool_result
                }

                final_answer = tool_result.get("content", "")
                all_tool_calls.append({
                    "tool": tool_name,
                    "arguments": tool_args
                })
                break

        # Provide final answer
        if not final_answer:
            # If we didn't get a final answer, ask orchestrator to synthesize one
            context_str = self._build_context(context)
            final_answer = await self._generate_final_answer(query, context_str)

        yield {
            "event": "final_answer",
            "content": final_answer
        }

        yield {
            "event": "complete",
            "summary": {
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
                search_tool = WebSearchTool()
                context_parts.append(search_tool.format_results_for_context(result))

            elif tool == "code_interpreter":
                code_exec = CodeExecutorTool()
                context_parts.append(code_exec.format_result_for_context(result))

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
            "max_tokens": 1024,
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
            return data["choices"][0]["message"]["content"]
        except httpx.HTTPError:
            return "Unable to generate final answer (network error)."
