"""
AutoGen-based Multi-Agent Orchestrator (Compatible with AutoGen 0.2.x)
Replaces custom ToolOrchestra with AutoGen framework
"""

import os
import logging
import asyncio
import json
from typing import AsyncGenerator, Dict, Any, List, Optional
import autogen
import requests

from tools.web_search import WebSearchTool
from tools.code_executor import CodeExecutorTool
from constants import DEFAULT_REMOTE_ENDPOINTS

logger = logging.getLogger(__name__)

# Custom Mock Client for Demo Mode
class MockModelClient:
    def __init__(self, config, **kwargs):
        self.model_name = config.get("model", "unknown")
        print(f"Initialized Mock Client for {self.model_name}")

    def create(self, params):
        # Generate a dummy response based on the last message
        messages = params.get("messages", [])
        last_msg = messages[-1]["content"] if messages else ""
        
        response_content = f"[MOCK {self.model_name}] Processing: {last_msg[:50]}..."
        
        if "reasoning" in self.model_name or "qwen" in self.model_name:
            response_content = f"**Step 1:** Analyzing '{last_msg}'\n**Step 2:** Calculating logic...\n**Conclusion:** Valid logic path found."
        elif "knowledge" in self.model_name or "phi" in self.model_name:
            response_content = f"Here is some information about '{last_msg}': It is a fascinating topic with many facets."
        elif "quick" in self.model_name or "llama" in self.model_name:
            response_content = f"Short answer: Yes, regarding {last_msg}."
        elif "orchestrator" in self.model_name:
            # Orchestrator needs to call tools often
            if "search" in last_msg.lower():
                # Simulate tool call format for AutoGen
                # This is tricky without real LLM, so we'll just return text that looks like a plan
                response_content = "I should search for this information. Call function: search_web"
            else:
                response_content = f"I will answer your question about: {last_msg}"

        from types import SimpleNamespace
        choice = SimpleNamespace()
        choice.message = SimpleNamespace()
        choice.message.content = response_content
        choice.message.function_call = None
        
        # Simulate function call if needed (very basic)
        if "orchestrator" in self.model_name and "search" in last_msg.lower():
             # In 0.2, function calling is complex to mock in this simple wrapper without proper structure
             # We will stick to text response for mock to avoid breaking parser
             pass

        response = SimpleNamespace()
        response.choices = [choice]
        response.model = self.model_name
        response.usage = SimpleNamespace(prompt_tokens=10, completion_tokens=10, total_tokens=20)
        return response

    def message_retrieval(self, response):
        return [response.choices[0].message.content]

    def cost(self, response):
        return 0

    @staticmethod
    def get_usage(response):
        return {}


class AutoGenOrchestrator:
    """
    Multi-agent orchestrator using Microsoft AutoGen framework (0.2.x compatible)
    Creates specialist agents for different tasks and routes intelligently
    """

    def __init__(self):
        # Get model endpoints from environment (fallback to remote defaults)
        def _norm(u: str) -> str:
            u = (u or "").strip().rstrip("/")
            if not (u.startswith("http://") or u.startswith("https://")):
                u = f"http://{u}" if u else u
            return u

        self.qwen_url = _norm(os.getenv("QWEN_API_URL") or DEFAULT_REMOTE_ENDPOINTS["QWEN_API_URL"])
        self.phi_url = _norm(os.getenv("PHI_API_URL") or DEFAULT_REMOTE_ENDPOINTS["PHI_API_URL"])
        self.llama_url = _norm(os.getenv("LLAMA_API_URL") or DEFAULT_REMOTE_ENDPOINTS["LLAMA_API_URL"])
        self.gemma_url = _norm(os.getenv("GEMMA_API_URL") or "")
        self.mistral_url = _norm(os.getenv("MISTRAL_API_URL") or "")

        # Initialize tools
        self.web_search_tool = WebSearchTool()
        self.code_executor_tool = CodeExecutorTool()
        
        # Event queue for streaming
        self.event_queue = asyncio.Queue()

    def _check_endpoint(self, url: str) -> bool:
        try:
            requests.get(f"{url}/health", timeout=0.2)
            return True
        except:
            return False

    def _create_llm_config(self, base_url: str, model_name: str, api_key: str = "local", api_type: str = "open_ai") -> dict:
        """Create an AutoGen llm_config"""
        # Simple availability check (only for local endpoints)
        if api_key == "local" and not self._check_endpoint(base_url):
            logger.warning(f"Endpoint {base_url} unreachable. Using MockModelClient.")
            pass

        return {
            "config_list": [
                {
                    "model": model_name,
                    "base_url": f"{base_url}/v1" if api_key == "local" else base_url,
                    "api_key": api_key,
                    "api_type": api_type,
                }
            ],
            "cache_seed": None,  # Disable caching
            "timeout": 60,       # Longer timeout for orchestration
        }

    async def _search_web_wrapper(self, query: str) -> str:
        """Wrapper for web search tool"""
        await self.event_queue.put({
            "event": "tool_call",
            "tool": "search_web",
            "arguments": {"query": query}
        })
        
        result = await self.web_search_tool.search(query, num_results=3)
        formatted = self.web_search_tool.format_results_for_context(result)
        
        await self.event_queue.put({
            "event": "tool_result",
            "tool": "search_web",
            "result": formatted
        })
        return formatted

    async def _execute_python_wrapper(self, code: str) -> str:
        """Wrapper for python execution tool"""
        await self.event_queue.put({
            "event": "tool_call",
            "tool": "execute_python",
            "arguments": {"code": code}
        })

        result = await self.code_executor_tool.execute(code, timeout=10)
        formatted = self.code_executor_tool.format_result_for_context(result)
        
        await self.event_queue.put({
            "event": "tool_result",
            "tool": "execute_python",
            "result": formatted
        })
        return formatted

    async def _ask_expert(self, agent_name: str, config: dict, system_message: str, question: str) -> str:
        """Generic function to ask a specialist agent"""
        await self.event_queue.put({
            "event": "tool_call",
            "tool": f"ask_{agent_name}",
            "arguments": {"question": question}
        })

        # Create temporary agents for this sub-task
        expert = autogen.AssistantAgent(
            name=agent_name,
            system_message=system_message,
            llm_config=config,
        )
        
        # User proxy just for this interaction
        user = autogen.UserProxyAgent(
            name="user",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=0,
            code_execution_config=False,
        )

        # Hook to capture the expert's reply
        async def reply_hook(recipient, messages, sender, config):
            if sender == expert:
                content = messages[-1].get('content')
                if content:
                    await self.event_queue.put({
                        "event": "agent_message",
                        "agent": agent_name,
                        "content": content
                    })
            return False, None  # Let the agent continue normal processing

        expert.register_reply([autogen.Agent, None], reply_hook)

        # Run the sub-chat
        try:
            await user.a_initiate_chat(
                expert,
                message=question,
                max_turns=1
            )
            # Get the last message
            last_msg = user.last_message(expert)["content"]
        except Exception as e:
            logger.error(f"Error in expert {agent_name}: {e}")
            last_msg = f"Error: {str(e)}"
            # If network error, we return a fallback
            if "connect" in str(e).lower():
                last_msg = "[System: Model unreachable. Skipping expert.]"

        await self.event_queue.put({
            "event": "tool_result",
            "tool": f"ask_{agent_name}",
            "result": last_msg
        })
        
        return last_msg

    # Wrappers for specific experts to be registered as functions
    async def _ask_reasoning_expert(self, question: str) -> str:
        config = self._create_llm_config(self.qwen_url, "qwen3-4b")
        return await self._ask_expert(
            "reasoning_expert", 
            config, 
            "You are a math and reasoning expert. Solve problems step-by-step with clear logic.", 
            question
        )

    async def _ask_knowledge_expert(self, question: str) -> str:
        config = self._create_llm_config(self.phi_url, "phi-3-mini")
        return await self._ask_expert(
            "knowledge_expert",
            config,
            "You are a general knowledge expert. Provide comprehensive, well-structured answers.",
            question
        )

    async def _ask_quick_expert(self, question: str) -> str:
        config = self._create_llm_config(self.llama_url, "llama-3.2-3b")
        return await self._ask_expert(
            "quick_expert",
            config,
            "You are a quick response expert. Provide concise, accurate answers.",
            question
        )

    async def run_orchestration(
        self,
        query: str,
        max_turns: int = 10,
        orchestrator_config: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run AutoGen multi-agent orchestration
        """
        try:
            yield {
                "event": "start",
                "query": query,
                "framework": "Microsoft AutoGen (0.2.x)"
            }

            # 1. Setup Orchestrator (Assistant)
            if orchestrator_config:
                # Use user-selected model
                model_name = orchestrator_config.get("model", "custom-orchestrator")
                base_url = orchestrator_config.get("base_url", self.qwen_url)
                api_key = orchestrator_config.get("api_key", "local")
                logger.info(f"Using custom orchestrator: {model_name}")
                llm_config = self._create_llm_config(base_url, model_name, api_key)
            else:
                # Default to Qwen
                llm_config = self._create_llm_config(self.qwen_url, "qwen-orchestrator")

            orchestrator = autogen.AssistantAgent(
                name="orchestrator",
                system_message="""
You are an intelligent orchestrator. Your job is to answer the user's query by calling the appropriate functions/tools.

ROUTING RULES:
1. "latest", "news", "today" -> call search_web
2. Math, logic -> call ask_reasoning_expert
3. Code -> call execute_python
4. General knowledge -> call ask_knowledge_expert
5. Simple questions -> call ask_quick_expert

When you have the answer from the tools, summarize it and reply to the user.
If you know the answer directly (e.g. greeting), just reply.
""",
                llm_config=llm_config,
            )

            # 2. Setup User Proxy (Executor)
            user_proxy = autogen.UserProxyAgent(
                name="user_proxy",
                human_input_mode="NEVER",
                max_consecutive_auto_reply=max_turns,
                is_termination_msg=lambda x: "TERMINATE" in x.get("content", ""),
                code_execution_config=False,  # We use our own tool for code
            )

            # 3. Register Functions
            function_map = {
                "search_web": self._search_web_wrapper,
                "execute_python": self._execute_python_wrapper,
                "ask_reasoning_expert": self._ask_reasoning_expert,
                "ask_knowledge_expert": self._ask_knowledge_expert,
                "ask_quick_expert": self._ask_quick_expert
            }

            for name, func in function_map.items():
                autogen.agentchat.register_function(
                    func,
                    caller=orchestrator,
                    executor=user_proxy,
                    name=name,
                    description=f"Call this function to {name.replace('_', ' ')}"
                )

            # 4. Hook for capturing Orchestrator's messages
            async def orchestrator_reply_hook(recipient, messages, sender, config):
                if sender == orchestrator:
                    content = messages[-1].get('content')
                    if content:
                         await self.event_queue.put({
                            "event": "agent_message",
                            "agent": "orchestrator",
                            "content": content
                        })
                return False, None

            orchestrator.register_reply([autogen.Agent, None], orchestrator_reply_hook)

            # 5. Run Chat in Background Task
            async def run_chat():
                try:
                    await user_proxy.a_initiate_chat(
                        orchestrator,
                        message=query,
                    )
                except Exception as e:
                    logger.error(f"Chat execution error: {e}")
                    # If we have a network error at the top level, let user know
                    if "connect" in str(e).lower():
                        await self.event_queue.put({
                            "event": "error", 
                            "error": "Could not connect to Orchestrator model (Qwen). Please ensure models are running."
                        })
                    else:
                        await self.event_queue.put({"event": "error", "error": str(e)})
                finally:
                    await self.event_queue.put(None) # Sentinel

            asyncio.create_task(run_chat())

            # 6. Yield Events from Queue
            while True:
                event = await self.event_queue.get()
                if event is None:
                    break
                yield event

            yield {
                "event": "complete",
                "summary": {
                    "framework": "Microsoft AutoGen (0.2.x)",
                    "status": "success"
                }
            }

        except Exception as e:
            logger.error(f"AutoGen orchestration error: {e}", exc_info=True)
            yield {
                "event": "error",
                "error": str(e),
                "framework": "Microsoft AutoGen (0.2.x)"
            }
