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
from constants import DEFAULT_REMOTE_ENDPOINTS

logger = logging.getLogger(__name__)


class AutoGenOrchestrator:
    """
    Multi-agent orchestrator using Microsoft AutoGen framework
    Creates specialist agents for different tasks and routes intelligently
    """

    def __init__(self):
        # Get model endpoints from environment (fallback to remote defaults)
        self.qwen_url = os.getenv("QWEN_API_URL", DEFAULT_REMOTE_ENDPOINTS["QWEN_API_URL"]) 
        self.phi_url = os.getenv("PHI_API_URL", DEFAULT_REMOTE_ENDPOINTS["PHI_API_URL"]) 
        self.llama_url = os.getenv("LLAMA_API_URL", DEFAULT_REMOTE_ENDPOINTS["LLAMA_API_URL"]) 

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
            api_key="local",  # Our endpoints don't need real keys
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
        qwen_client = None
        phi_client = None
        llama_client = None
        orchestrator_client = None

        try:
            yield {
                "event": "start",
                "query": query,
                "framework": "Microsoft AutoGen"
            }

            # Create specialist agents
            logger.info("Creating AutoGen specialist agents...")
            logger.info(f"Model endpoints - Qwen: {self.qwen_url}, Phi: {self.phi_url}, Llama: {self.llama_url}")

            # Math/Reasoning Expert (Qwen)
            qwen_client = self._create_model_client(self.qwen_url, "qwen3-4b")
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
                else:
                    # Surface non-text messages so we can inspect tool call metadata in the UI/logs
                    details = {
                        "type": type(message).__name__,
                    }
                    # Try to capture useful attributes for debugging/tool handling
                    for attr in ["content", "tool_name", "name", "arguments", "kwargs", "data"]:
                        if hasattr(message, attr):
                            details[attr] = getattr(message, attr)

                    yield {
                        "event": "message",
                        "content": str(details)
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
            if qwen_client:
                await qwen_client.close()
            if phi_client:
                await phi_client.close()
            if llama_client:
                await llama_client.close()
            if orchestrator_client:
                await orchestrator_client.close()

        except Exception as e:
            logger.error(f"AutoGen orchestration error: {e}", exc_info=True)

            # Provide more specific error messages
            error_msg = str(e)
            if "connect" in error_msg.lower() or "connection" in error_msg.lower():
                error_msg = f"Cannot connect to model endpoints. Please ensure the model services are running. Error: {error_msg}"
            elif "timeout" in error_msg.lower():
                error_msg = f"Request timed out connecting to models. Error: {error_msg}"

            yield {
                "event": "error",
                "error": error_msg,
                "framework": "Microsoft AutoGen",
                "endpoints": {
                    "qwen": self.qwen_url,
                    "phi": self.phi_url,
                    "llama": self.llama_url
                }
            }
