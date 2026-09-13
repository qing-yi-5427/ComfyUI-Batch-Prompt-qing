# -*- coding: utf-8 -*-
"""Local HTTP routes used by the Batch Prompt qing node UI."""

from __future__ import annotations

import hashlib

from aiohttp import web
from server import PromptServer

try:
    from .nodes import (
        _parse_jsonl_text,
        _resolve_prompt_path,
        atomic_save_prompt_file,
        build_prompt_file_preview,
    )
except ImportError:  # Allows the lightweight route helpers to be unit-tested directly.
    from nodes import (
        _parse_jsonl_text,
        _resolve_prompt_path,
        atomic_save_prompt_file,
        build_prompt_file_preview,
    )


@PromptServer.instance.routes.post("/batch_prompt_qing/preview")
async def preview_prompt_file(request):
    try:
        payload = await request.json()
        prompt_file = payload.get("prompt_file", "") if isinstance(payload, dict) else ""
        if not isinstance(prompt_file, str):
            raise ValueError("prompt_file 必须是字符串。")
        return web.json_response(build_prompt_file_preview(prompt_file))
    except (OSError, ValueError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.post("/batch_prompt_qing/save")
async def save_prompt_file(request):
    try:
        payload = await request.json()
        prompt_file = payload.get("prompt_file", "")
        content = payload.get("content", "")
        expected_sha256 = payload.get("expected_sha256", "")
        if not isinstance(prompt_file, str) or not isinstance(content, str):
            raise ValueError("prompt_file 和 content 必须是字符串。")
        if not isinstance(expected_sha256, str):
            raise ValueError("expected_sha256 必须是字符串。")
        path = _resolve_prompt_path(prompt_file)
        if len(content.encode("utf-8")) > 10 * 1024 * 1024:
            raise ValueError("JSONL 文件超过 10 MiB 限制。")
        _parse_jsonl_text(content, "卡片编辑器内容")
        current_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        if expected_sha256 and current_sha256 != expected_sha256:
            return web.json_response(
                {
                    "ok": False,
                    "error": "磁盘上的 JSONL 已被其它程序修改。请先重新读取，再决定是否保存。",
                    "current_sha256": current_sha256,
                },
                status=409,
            )
        backup_path = atomic_save_prompt_file(path, content)
        return web.json_response({
            "ok": True,
            "file_name": path.name,
            "backup_file": backup_path,
            "file_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        })
    except (OSError, ValueError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


__all__ = []
