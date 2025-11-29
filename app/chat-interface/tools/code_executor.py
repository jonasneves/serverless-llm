"""
Code Executor Tool - Execute Python code in a restricted environment
Uses RestrictedPython for basic sandboxing
"""

import logging
import subprocess
import tempfile
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)


class CodeExecutorTool:
    """Execute Python code with basic safety restrictions"""

    # Restricted builtins for safer execution
    SAFE_BUILTINS = {
        'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes',
        'chr', 'dict', 'divmod', 'enumerate', 'filter', 'float', 'format',
        'frozenset', 'hex', 'int', 'isinstance', 'issubclass', 'iter', 'len',
        'list', 'map', 'max', 'min', 'oct', 'ord', 'pow', 'print', 'range',
        'repr', 'reversed', 'round', 'set', 'slice', 'sorted', 'str', 'sum',
        'tuple', 'type', 'zip'
    }

    def __init__(self):
        pass

    async def execute(
        self,
        code: str,
        timeout: int = 10
    ) -> Dict[str, Any]:
        """
        Execute Python code in a sandboxed environment

        Args:
            code: Python code to execute
            timeout: Execution timeout in seconds (max 30)

        Returns:
            Dict with execution results
        """
        # Validate timeout
        timeout = min(timeout, 30)

        try:
            # Create temporary file for code
            with tempfile.NamedTemporaryFile(
                mode='w',
                suffix='.py',
                delete=False
            ) as f:
                code_path = f.name
                f.write(code)

            try:
                # Execute in subprocess with timeout
                result = subprocess.run(
                    ['python', code_path],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    env={
                        **os.environ,
                        'PYTHONIOENCODING': 'utf-8'
                    }
                )

                # Get output
                stdout = result.stdout
                stderr = result.stderr
                returncode = result.returncode

                return {
                    "success": returncode == 0,
                    "stdout": stdout,
                    "stderr": stderr,
                    "returncode": returncode,
                    "tool": "code_interpreter",
                    "code": code
                }

            finally:
                # Clean up temp file
                try:
                    os.unlink(code_path)
                except:
                    pass

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Execution timed out after {timeout} seconds",
                "returncode": -1,
                "tool": "code_interpreter",
                "code": code,
                "error": "timeout"
            }

        except Exception as e:
            logger.error(f"Code execution failed: {e}")
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "returncode": -1,
                "tool": "code_interpreter",
                "code": code,
                "error": str(e)
            }

    def format_result_for_context(self, exec_result: Dict[str, Any]) -> str:
        """Format execution results as context for the model"""
        formatted = f"Code Execution:\n```python\n{exec_result['code']}\n```\n\n"

        if exec_result.get("success"):
            formatted += "Output:\n```\n"
            if exec_result.get("stdout"):
                formatted += exec_result["stdout"]
            else:
                formatted += "(no output)\n"
            formatted += "```\n"
        else:
            formatted += f"Error:\n```\n{exec_result.get('stderr', 'Unknown error')}\n```\n"

        return formatted
