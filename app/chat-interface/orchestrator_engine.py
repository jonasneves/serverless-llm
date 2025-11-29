"""
Orchestrator Engine - ToolOrchestra-style multi-turn orchestration
Uses Qwen 2.5-7B as orchestrator with function calling
"""

import os
import json
import logging
import aiohttp
from typing import List, Dict, Any, Optional, AsyncGenerator

from tools.model_router import ModelRouter
from tools.web_search import WebSearchTool
from tools.code_executor import CodeExecutorTool

logger = logging.getLogger(__name__)


class OrchestratorEngine:
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
        self.orchestrator_url = os.getenv("QWEN_API_URL", "http://localhost:8001")

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

            # Ask orchestrator to choose a tool
            messages = [
                {
                    "role": "system",
                    "content": "You are an intelligent orchestrator. Choose the most appropriate tool to help answer the user's question efficiently."
                },
                {
                    "role": "user",
                    "content": f"Question: {query}\n\n{context_str}\n\nChoose an appropriate tool to help answer this question."
                }
            ]

            # Call orchestrator with function calling
            try:
                tool_call_response = await self._call_orchestrator(
                    messages=messages,
                    tools=self.tools,
                    temperature=temperature
                )

                # Check if orchestrator wants to use a tool
                tool_calls = tool_call_response.get("tool_calls", [])

                if not tool_calls:
                    # No tool call - orchestrator might be providing final answer
                    content = tool_call_response.get("content", "")
                    if content:
                        yield {
                            "event": "orchestrator_thinking",
                            "content": content
                        }
                        final_answer = content
                        break
                    else:
                        # No tool call and no content - continue
                        continue

                # Process tool call
                for tool_call in tool_calls:
                    tool_name = tool_call.get("name")
                    tool_args = tool_call.get("arguments", {})

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

                    # If this was an "answer" tool, we're done
                    if tool_name == "answer":
                        final_answer = tool_result.get("content", "")
                        break

                if final_answer:
                    break

            except Exception as e:
                logger.error(f"Orchestration error in round {round_num + 1}: {e}")
                yield {
                    "event": "error",
                    "round": round_num + 1,
                    "error": str(e)
                }
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
        async with aiohttp.ClientSession() as session:
            payload = {
                "messages": messages,
                "tools": tools,
                "max_tokens": 1024,
                "temperature": temperature
            }

            async with session.post(
                f"{self.orchestrator_url}/v1/chat/completions",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if not response.ok:
                    error_text = await response.text()
                    raise Exception(f"Orchestrator API error: {response.status} - {error_text}")

                data = await response.json()
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

        async with aiohttp.ClientSession() as session:
            payload = {
                "messages": messages,
                "max_tokens": 2048,
                "temperature": 0.7
            }

            async with session.post(
                f"{self.orchestrator_url}/v1/chat/completions",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if not response.ok:
                    return "Unable to generate final answer."

                data = await response.json()
                return data["choices"][0]["message"]["content"]
