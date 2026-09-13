# -*- coding: utf-8 -*-
"""Local HTTP routes used by the Batch Prompt qing node UI."""

from __future__ import annotations

import asyncio
import hashlib
import time
from pathlib import Path

import aiohttp
from aiohttp import web
from server import PromptServer

try:
    from .nodes import (
        _parse_jsonl_text,
        _resolve_prompt_path,
        atomic_save_prompt_file,
        build_prompt_file_preview,
        PROMPTS_DIR,
    )
except ImportError:  # Allows the lightweight route helpers to be unit-tested directly.
    from nodes import (
        _parse_jsonl_text,
        _resolve_prompt_path,
        atomic_save_prompt_file,
        build_prompt_file_preview,
        PROMPTS_DIR,
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


@PromptServer.instance.routes.get("/batch_prompt_qing/files")
async def list_prompt_files(request):
    """List bundled JSONL files and siblings of the current absolute file."""
    try:
        root = PROMPTS_DIR.resolve()
        files = []
        seen = set()

        def append_file(path: Path, *, source: str, relative_to: Path | None = None):
            resolved = path.resolve()
            if not resolved.is_file() or resolved.suffix.lower() != ".jsonl":
                return
            key = str(resolved).lower()
            if key in seen:
                return
            seen.add(key)
            stat = resolved.stat()
            files.append({
                "name": resolved.name,
                "value": (
                    resolved.relative_to(relative_to).as_posix()
                    if relative_to is not None
                    else str(resolved)
                ),
                "source": source,
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })

        for path in sorted(root.rglob("*.jsonl"), key=lambda item: str(item).lower()):
            if root in path.resolve().parents:
                append_file(path, source="插件 prompts", relative_to=root)

        user_prompt_dir = root.parents[2] / "user" / "default" / "batch_prompt_qing"
        if user_prompt_dir.is_dir() and user_prompt_dir != root:
            for path in sorted(user_prompt_dir.glob("*.jsonl"), key=lambda item: str(item).lower()):
                append_file(path, source="用户 Prompt 目录")

        current = request.query.get("current", "").strip()
        current_path = Path(current).expanduser() if current else None
        if current_path is not None and current_path.is_absolute():
            current_dir = current_path.resolve().parent
            if current_dir.is_dir() and current_dir != root:
                for path in sorted(current_dir.glob("*.jsonl"), key=lambda item: str(item).lower()):
                    append_file(path, source="当前文件夹")

        return web.json_response({"ok": True, "files": files})
    except OSError as error:
        return web.json_response({"ok": False, "error": str(error)}, status=500)


async def _translate_text(session: aiohttp.ClientSession, text: str) -> str:
    """Translate one text through Tencent TranSmart's mainland endpoint."""
    if not text.strip():
        return ""
    payload = {
        "header": {
            "fn": "auto_translation",
            "client_key": "ComfyUI-Batch-Prompt-qing",
            "user": "",
            "domain": "general",
            "timestamp": int(time.time() * 1000),
        },
        "type": "plain",
        "model_category": "normal",
        "source": {"lang": "en", "text_list": [text]},
        "target": {"lang": "zh"},
    }
    async with session.post(
        "https://transmart.qq.com/api/imt",
        json=payload,
        headers={
            "User-Agent": "Mozilla/5.0 ComfyUI-Batch-Prompt-qing/1.7",
            "Referer": "https://transmart.qq.com/zh-CN/index",
        },
    ) as response:
        if response.status != 200:
            raise ValueError(f"翻译服务返回 HTTP {response.status}")
        payload = await response.json(content_type=None)

    if not isinstance(payload, dict):
        raise ValueError("翻译服务返回了无效结果")
    header = payload.get("header")
    if not isinstance(header, dict) or header.get("ret_code") != "succ":
        raise ValueError("腾讯翻译服务返回失败状态")
    translations = payload.get("auto_translation")
    if isinstance(translations, list) and translations:
        result = "".join(str(item) for item in translations if item is not None)
        if result:
            return result
    raise ValueError("翻译服务没有返回译文")


@PromptServer.instance.routes.post("/batch_prompt_qing/translate")
async def translate_prompt_records(request):
    """Translate card display text without changing the JSONL source."""
    try:
        payload = await request.json()
        records = payload.get("records", []) if isinstance(payload, dict) else []
        if not isinstance(records, list) or not 1 <= len(records) <= 100:
            raise ValueError("records 必须是 1 到 100 条的数组。")

        timeout = aiohttp.ClientTimeout(total=90)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            translated = []
            for record in records:
                if not isinstance(record, dict):
                    raise ValueError("records 中包含无效对象。")
                name = record.get("name", "")
                positive = record.get("positive", "")
                if not isinstance(name, str) or not isinstance(positive, str):
                    raise ValueError("每条记录的 name 和 positive 必须是字符串。")
                values = await asyncio.gather(
                    _translate_text(session, name),
                    _translate_text(session, positive),
                )
                translated.append({"name": values[0], "positive": values[1]})
        return web.json_response({"ok": True, "records": translated})
    except (OSError, ValueError, aiohttp.ClientError, asyncio.TimeoutError) as error:
        return web.json_response({"ok": False, "error": f"翻译失败：{error}"}, status=400)


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
