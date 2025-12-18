#!/usr/bin/env python3

import json
import os
import signal
import struct
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


HOST_NAME = "io.neevs.serverless_llm"
LOG_FILE = Path.home() / ".native-host-debug.log"


def _log(msg: str) -> None:
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def _read_message() -> Optional[Dict[str, Any]]:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    if message_length <= 0:
        return None
    data = sys.stdin.buffer.read(message_length)
    if not data:
        return None
    return json.loads(data.decode("utf-8"))


def _write_message(message: Dict[str, Any]) -> None:
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _find_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        if (parent / "Makefile").exists() and (parent / "app" / "chat-interface" / "chat_server.py").exists():
            return parent
    raise RuntimeError("Could not locate repo root (expected Makefile and app/chat-interface/chat_server.py)")


def _state_paths(repo_root: Path) -> Tuple[Path, Path]:
    state_dir = repo_root / ".native-host"
    state_dir.mkdir(exist_ok=True)
    return state_dir / "state.json", state_dir / "backend.log"


def _is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _read_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text("utf-8"))
    except Exception:
        return {}


def _write_state(state_path: Path, state: Dict[str, Any]) -> None:
    state_path.write_text(json.dumps(state, indent=2), "utf-8")


def _health_check(url: str, timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def _tail_file(path: Path, max_lines: int = 50) -> str:
    if not path.exists():
        return ""
    try:
        lines = path.read_text("utf-8", errors="replace").splitlines()
        return "\n".join(lines[-max_lines:])
    except Exception:
        return ""


def _stop_process_tree(pid: int) -> bool:
    try:
        os.killpg(pid, signal.SIGTERM)
    except Exception:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            return False

    deadline = time.time() + 3.0
    while time.time() < deadline:
        if not _is_pid_alive(pid):
            return True
        time.sleep(0.1)

    try:
        os.killpg(pid, signal.SIGKILL)
    except Exception:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            return False
    return True


def _start_backend(repo_root: Path, state_path: Path, log_path: Path, mode: str) -> dict:
    state = _read_state(state_path)
    pid = state.get("pid")
    if isinstance(pid, int) and _is_pid_alive(pid):
        return {"ok": True, "status": "running", "pid": pid}

    command = ["make", "dev-remote"] if mode == "dev-remote" else ["make", "dev-interface-local"]

    log_path.parent.mkdir(exist_ok=True)
    log_f = open(log_path, "a", buffering=1)
    log_f.write(f"\n--- start {time.strftime('%Y-%m-%d %H:%M:%S')} mode={mode} ---\n")
    log_f.flush()

    try:
        proc = subprocess.Popen(
            command,
            cwd=str(repo_root),
            stdout=log_f,
            stderr=log_f,
            start_new_session=True,
            env=os.environ.copy(),
        )
    except Exception as e:
        return {"ok": False, "error": f"Failed to start backend: {e}"}

    time.sleep(0.8)
    if proc.poll() is not None:
        tail = _tail_file(log_path, max_lines=60)
        return {"ok": False, "error": "Backend failed to start", "logTail": tail}

    state = {"pid": proc.pid, "mode": mode, "startedAt": int(time.time())}
    _write_state(state_path, state)
    return {"ok": True, "status": "running", "pid": proc.pid}


def _status(repo_root: Path, state_path: Path, chat_base_url: Optional[str]) -> dict:
    state = _read_state(state_path)
    pid = state.get("pid")
    alive = isinstance(pid, int) and _is_pid_alive(pid)
    health_url = None
    healthy = None

    if chat_base_url:
        base = chat_base_url.strip().rstrip("/")
        if base:
            health_url = f"{base}/health"
            healthy = _health_check(health_url)

    return {
        "ok": True,
        "status": "running" if alive else "stopped",
        "pid": pid if alive else None,
        "healthUrl": health_url,
        "healthy": healthy,
        "mode": state.get("mode"),
        "startedAt": state.get("startedAt"),
    }


def _stop(state_path: Path) -> dict:
    state = _read_state(state_path)
    pid = state.get("pid")
    if not isinstance(pid, int):
        return {"ok": True, "status": "stopped"}
    if not _is_pid_alive(pid):
        _write_state(state_path, {})
        return {"ok": True, "status": "stopped"}

    ok = _stop_process_tree(pid)
    _write_state(state_path, {})
    return {"ok": ok, "status": "stopped" if ok else "error", "pid": pid}


def main() -> None:
    _log("Native host started")
    try:
        repo_root = _find_repo_root()
        state_path, log_path = _state_paths(repo_root)
        _log(f"Repo root: {repo_root}")
    except Exception as e:
        _log(f"Error finding repo root: {e}")
        _write_message({"ok": False, "error": str(e)})
        return

    try:
        message = _read_message()
        _log(f"Received message: {message}")
    except Exception as e:
        _log(f"Error reading message: {e}")
        return

    if message is None:
        _log("Message is None, exiting")
        return

    action = message.get("action")
    _log(f"Action: {action}")

    try:
        if action == "start":
            mode = message.get("mode") or "dev-remote"
            if mode not in ("dev-remote", "dev-interface-local"):
                _write_message({"ok": False, "error": f"Unknown mode: {mode}"})
                return
            response = _start_backend(repo_root, state_path, log_path, mode)
            _log(f"Start response: {response}")
            _write_message(response)
            return

        if action == "stop":
            response = _stop(state_path)
            _log(f"Stop response: {response}")
            _write_message(response)
            return

        if action == "status":
            response = _status(repo_root, state_path, message.get("chatApiBaseUrl"))
            _log(f"Status response: {response}")
            _write_message(response)
            return

        if action == "logs":
            response = {"ok": True, "logTail": _tail_file(log_path, max_lines=120)}
            _log(f"Logs response length: {len(str(response))}")
            _write_message(response)
            return

        _log(f"Unknown action: {action}")
        _write_message({"ok": False, "error": f"Unknown action: {action}"})
    except Exception as e:
        _log(f"Error handling action {action}: {e}")
        _write_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    try:
        main()
        _log("Native host completed successfully")
    except Exception as e:
        _log(f"Fatal error: {e}")
        import traceback
        _log(traceback.format_exc())
