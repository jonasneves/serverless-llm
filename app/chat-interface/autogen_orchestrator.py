"""
AutoGen-based Multi-Agent Orchestrator
Replaces custom ToolOrchestra with AutoGen framework
"""

import os
import logging
from typing import AsyncGenerator, Dict, Any, List, Annotated
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.tools import AgentTool
from autogen_agentchat.messages import ChatMessage, TextMessage
from autogen_ext.models.openai import OpenAIChatCompletionClient

from tools.web_search import WebSearchTool
from tools.code_executor import CodeExecutorTool

logger = logging.getLogger(__name__)


class AutoGenOrchestrator:
    """
    Multi-agent orchestrator using Microsoft AutoGen framework
    Creates specialist agents for different tasks and routes intelligently
    """

    def __init__(self):
        # Get model endpoints from environment
        self.qwen_url = os.getenv("QWEN_API_URL", "https://qwen.neevs.io")
        self.phi_url = os.getenv("PHI_API_URL", "https://phi.neevs.io")
        self.llama_url = os.getenv("LLAMA_API_URL", "https://llama.neevs.io")

        # Initialize tools
        self.web_search = WebSearchTool()
        self.code_executor = CodeExecutorTool()

    def _create_model_client(self, base_url: str, model_name: str = "model") -> OpenAIChatCompletionClient:
        """Create an OpenAI-compatible client for our model endpoints"""
        # Provide complete model_info for non-OpenAI models
        # Required fields enforced starting v0.4.7
        model_info = {
            "family": "unknown",  # Required field
            "vision": False,
            "function_calling": True,
            "json_output": True,
            "context_window": 32768,  # Reasonable default
        }
        
        return OpenAIChatCompletionClient(
            model=model_name,
            api_key="dummy",  # Our endpoints don't need real keys
            base_url=f"{base_url}/v1",
            model_info=model_info,
        )

    async def search_web(self, query: Annotated[str, "The search query"]) -> str:
        """Search the web for information using DuckDuckGo"""
        result = await self.web_search.search(query, num_results=3)
        if "error" in result:
            return f"Search failed: {result['error']}"

        # Format results as text
        formatted = f"Search results for '{query}':\n\n"
        for i, res in enumerate(result["results"], 1):
            formatted += f"{i}. {res['title']}\n"
            formatted += f"   {res['snippet']}\n"
            if res.get('url'):
                formatted += f"   URL: {res['url']}\n"
            formatted += "\n"
        return formatted

    async def execute_python(self, code: Annotated[str, "Python code to execute"]) -> str:
        """Execute Python code and return the output"""
        result = await self.code_executor.execute(code, timeout=10)
        if "error" in result:
            return f"Execution failed: {result['error']}"

        output = result.get("stdout", "")
        stderr = result.get("stderr", "")
        return_code = result.get("return_code", 0)

        response = ""
        if output:
            response += f"Output:\n{output}\n"
        if stderr:
            response += f"Errors:\n{stderr}\n"
        if return_code != 0:
            response += f"Exit code: {return_code}"

        return response or "Code executed successfully with no output"

    async def run_orchestration(
        self,
        query: str,
        max_turns: int = 10
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run AutoGen multi-agent orchestration

        Yields events compatible with the existing UI:
        - {"event": "start", "query": "..."}
        - {"event": "agent_message", "agent": "...", "content": "..."}
        - {"event": "tool_call", "tool": "...", "arguments": {...}}
        - {"event": "tool_result", "result": {...}}
        - {"event": "complete", "summary": {...}}
        """

        last_orchestrator_message = None

        try:
            yield {
                "event": "start",
                "query": query,
                "framework": "Microsoft AutoGen"
            }

            # Create specialist agents
            logger.info("Creating AutoGen specialist agents...")

            # Math/Reasoning Expert (Qwen)
            qwen_client = self._create_model_client(self.qwen_url, "qwen-2.5-7b")
            reasoning_agent = AssistantAgent(
                "reasoning_expert",
                model_client=qwen_client,
                system_message="You are a math and reasoning expert. Solve problems step-by-step with clear logic.",
                description="Expert in mathematics, logic, and step-by-step reasoning",
            )

            # General Knowledge Expert (Phi)
            phi_client = self._create_model_client(self.phi_url, "phi-3-mini")
            knowledge_agent = AssistantAgent(
                "knowledge_expert",
                model_client=phi_client,
                system_message="You are a general knowledge expert. Provide comprehensive, well-structured answers.",
                description="Expert in general knowledge and comprehensive explanations",
            )

            # Fast Response Expert (Llama)
            llama_client = self._create_model_client(self.llama_url, "llama-3.2-3b")
            quick_agent = AssistantAgent(
                "quick_expert",
                model_client=llama_client,
                system_message="You are a quick response expert. Provide concise, accurate answers.",
                description="Expert for quick, concise responses",
            )

            # Wrap specialist agents as tools for the orchestrator
            reasoning_tool = AgentTool(reasoning_agent, return_value_as_last_message=True)
            knowledge_tool = AgentTool(knowledge_agent, return_value_as_last_message=True)
            quick_tool = AgentTool(quick_agent, return_value_as_last_message=True)

            # Main orchestrator agent
            orchestrator_client = self._create_model_client(self.qwen_url, "qwen-orchestrator")
            orchestrator = AssistantAgent(
                "orchestrator",
                model_client=orchestrator_client,
                system_message="""You are an intelligent orchestrator managing specialist agents and tools.

Available specialists:
- reasoning_expert: For math, logic, step-by-step problem solving
- knowledge_expert: For comprehensive explanations and general knowledge
- quick_expert: For quick, concise answers

Available tools:
- search_web: Search the internet for current information
- execute_python: Run Python code for calculations or data processing

Choose the most appropriate specialist or tool for each task. You can use multiple agents/tools if needed.""",
                tools=[reasoning_tool, knowledge_tool, quick_tool, self.search_web, self.execute_python],
                max_tool_iterations=max_turns,
                max_consecutive_auto_reply=max_turns,
            )

            yield {
                "event": "agents_ready",
                "agents": ["orchestrator", "reasoning_expert", "knowledge_expert", "quick_expert"],
                "tools": ["search_web", "execute_python"]
            }

            # Run the orchestration
            logger.info(f"Starting orchestration for query: {query}")

            # Stream results from AutoGen
            async for message in orchestrator.run_stream(task=query):
                # Convert AutoGen messages to our event format
                if isinstance(message, TextMessage):
                    agent_name = message.source if hasattr(message, 'source') else "orchestrator"
                    content = message.content

                    yield {
                        "event": "agent_message",
                        "agent": agent_name,
                        "content": content
                    }

                    if agent_name == "orchestrator":
                        last_orchestrator_message = content
                elif hasattr(message, 'content'):
                    # Handle other message types
                    yield {
                        "event": "message",
                        "content": str(message.content)
                    }

            if last_orchestrator_message:
                yield {
                    "event": "final_answer",
                    "content": last_orchestrator_message
                }

            yield {
                "event": "complete",
                "summary": {
                    "framework": "Microsoft AutoGen",
                    "agents_used": ["orchestrator", "reasoning_expert", "knowledge_expert", "quick_expert"],
                    "status": "success"
                }
            }

            # Close model clients
            await qwen_client.close()
            await phi_client.close()
            await llama_client.close()
            await orchestrator_client.close()

        except Exception as e:
            logger.error(f"AutoGen orchestration error: {e}", exc_info=True)
            yield {
                "event": "error",
                "error": str(e),
                "framework": "Microsoft AutoGen"
            }
