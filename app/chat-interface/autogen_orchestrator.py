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
            "timeout": 120,      # Adequate timeout for orchestration
        }

    async def _search_web_wrapper(self, query: str) -> str:
        """Wrapper for web search tool"""
        await self.event_queue.put({
            "event": "tool_call",
            "tool": "search_web",
            "arguments": {"query": query}
        })
        
        try:
            result = await self.web_search_tool.search(query, num_results=3)
            formatted = self.web_search_tool.format_results_for_context(result)
        except Exception as e:
            formatted = f"Error searching web: {str(e)}"
        
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

        try:
            result = await self.code_executor_tool.execute(code, timeout=10)
            formatted = self.code_executor_tool.format_result_for_context(result)
        except Exception as e:
            formatted = f"Error executing code: {str(e)}"
        
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
            last_msg = f"Error invoking expert: {str(e)}"
            if "connect" in str(e).lower():
                last_msg = "[System: Expert Model unreachable. Please check model status.]"

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
            "You are a math and reasoning expert. Solve problems step-by-step with clear logic. Provide the final answer clearly.", 
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
                system_message="""You are an intelligent Orchestrator. 
Your goal is to answer the user's request efficiently using the available tools.

AVAILABLE TOOLS:
- search_web(query): Search the internet for latest news, facts, or current events.
- execute_python(code): Execute Python code for calculations, data processing, or algorithms.
- ask_reasoning_expert(question): Delegate complex logic or math problems to a reasoning expert.
- ask_knowledge_expert(question): Delegate general knowledge questions.
- ask_quick_expert(question): Delegate simple questions for a quick specific answer.

GUIDELINES:
1. If the user asks for latest news or current information (e.g. "latest news on AI"), you MUST use 'search_web'.
2. After receiving tool results, analyze them and provide a FINAL ANSWER to the user.
3. Do not just say you will do something; USE the tool function.
4. If you have enough information, answer directly and terminate.
""",
                llm_config=llm_config,
            )

            # 2. Setup User Proxy (Executor)
            user_proxy = autogen.UserProxyAgent(
                name="user_proxy",
                human_input_mode="NEVER",
                max_consecutive_auto_reply=max_turns,
                is_termination_msg=lambda x: "TERMINATE" in x.get("content", "") or (x.get("content", "").strip().endswith("TERMINATE")),
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
                    if "connect" in str(e).lower():
                        await self.event_queue.put({
                            "event": "error", 
                            "error": "Could not connect to Orchestrator model. Please ensure the model server is running."
                        })
                    else:
                        await self.event_queue.put({"event": "error", "error": str(e)})
                finally:
                    await self.event_queue.put(None) # Sentinel

            asyncio.create_task(run_chat())

            # 6. Yield Events from Queue
            final_answer_acc = []
            
            while True:
                event = await self.event_queue.get()
                if event is None:
                    break
                
                # Capture possible final answer from the last agent message
                if event.get("event") == "agent_message" and event.get("agent") == "orchestrator":
                     final_answer_acc.append(event.get("content", ""))

                yield event

            # Determine final answer from history
            final_text = ""
            if final_answer_acc:
                final_text = final_answer_acc[-1] # The last message is usually the answer

            yield {
                "event": "complete",
                "summary": {
                    "framework": "Microsoft AutoGen (0.2.x)",
                    "status": "success",
                    "final_answer": final_text
                }
            }

        except Exception as e:
            logger.error(f"AutoGen orchestration error: {e}", exc_info=True)
            yield {
                "event": "error",
                "error": str(e),
                "framework": "Microsoft AutoGen (0.2.x)"
            }
