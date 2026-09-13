# -*- coding: utf-8 -*-
"""Prompt-list source nodes for ComfyUI.

The node intentionally emits ComfyUI list outputs instead of creating a tensor
batch. Standard downstream nodes are therefore executed item by item, keeping
peak VRAM close to a single-image workflow.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import secrets
import shutil
import tempfile
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import nodes as _comfy_core_nodes
    _PreviewImageBase = _comfy_core_nodes.PreviewImage
except (ImportError, AttributeError):
    _PreviewImageBase = object


MAX_SEED = 0xFFFFFFFFFFFFFFFF
HARD_MAX_IMAGES = 10_000
MAX_PROMPT_FILE_BYTES = 10 * 1024 * 1024
PLUGIN_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = PLUGIN_DIR / "prompts"

SOURCE_MODES = ("manual", "jsonl_file")
SEED_MODES = (
    "fixed",
    "increment_per_image",
    "shared_increment_per_copy",
    "shared_random_per_copy",
    "random_per_prompt",
    "random_per_image",
)
SEED_MODE_LABELS = {
    "fixed": "fixed｜固定：所有图片使用同一 Seed",
    "increment_per_image": "increment_per_image｜递增：所有图片依次 +1",
    "shared_increment_per_copy": "shared_increment_per_copy｜按轮递增：同轮卡片共用",
    "shared_random_per_copy": "shared_random_per_copy｜按轮随机：同轮卡片共用",
    "random_per_prompt": "random_per_prompt｜每组随机：同一卡片共用",
    "random_per_image": "random_per_image｜每张随机：全部独立",
}
SEED_MODE_OPTIONS = tuple(SEED_MODE_LABELS[mode] for mode in SEED_MODES)
SEED_MODE_ALIASES = {label: mode for mode, label in SEED_MODE_LABELS.items()}
SEED_MODE_ALIASES.update({
    "random_per_batch": "shared_random_per_copy",
    "random_per_batch｜每批随机：本次 Queue 共用": "shared_random_per_copy",
})
ALLOWED_RECORD_FIELDS = {
    "name",
    "positive",
}


def atomic_save_prompt_file(path: Path, content: str) -> str:
    """Back up an existing JSONL file, then replace it atomically."""
    backup_path = ""
    if path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = path.with_name(f"{path.name}.bak.{stamp}")
        counter = 1
        while backup.exists():
            backup = path.with_name(f"{path.name}.bak.{stamp}.{counter}")
            counter += 1
        shutil.copy2(path, backup)
        backup_path = str(backup)

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temporary_path = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except Exception:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except OSError:
                pass
        raise
    return backup_path


@dataclass(frozen=True)
class PromptRecord:
    name: str
    positive: str
    negative: str
    count: int
    seed: int | None
    source_line: int | None = None


def _is_plain_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _resolve_prompt_path(prompt_file: str) -> Path:
    raw_path = prompt_file.strip()
    if not raw_path:
        raise ValueError("prompt_file 不能为空。")

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = PROMPTS_DIR / path
    path = path.resolve()

    if path.suffix.lower() != ".jsonl":
        raise ValueError(f"Prompt 文件必须使用 .jsonl 扩展名：{path}")
    if not path.exists():
        raise FileNotFoundError(f"找不到 Prompt 文件：{path}")
    if not path.is_file():
        raise ValueError(f"Prompt 路径不是文件：{path}")
    if path.stat().st_size > MAX_PROMPT_FILE_BYTES:
        raise ValueError(
            f"Prompt 文件超过 {MAX_PROMPT_FILE_BYTES // (1024 * 1024)} MiB 限制：{path}"
        )
    return path


def _validate_seed(seed: Any, *, context: str) -> int:
    if not _is_plain_int(seed):
        raise ValueError(f"{context} seed 必须是整数。")
    if not 0 <= seed <= MAX_SEED:
        raise ValueError(f"{context} seed 必须在 0 到 {MAX_SEED} 之间。")
    return seed


def _normalize_seed_mode(seed_mode: str) -> str:
    canonical = SEED_MODE_ALIASES.get(seed_mode, seed_mode)
    if canonical not in SEED_MODES:
        raise ValueError(f"未知 seed_mode：{seed_mode}")
    return canonical


def _parse_record(data: Any, *, line_number: int, default_name: str) -> PromptRecord | None:
    context = f"第 {line_number} 行"
    if not isinstance(data, dict):
        raise ValueError(f"{context}必须是一个 JSON 对象。")

    unknown_fields = sorted(set(data) - ALLOWED_RECORD_FIELDS)
    if unknown_fields:
        raise ValueError(f"{context}包含未知字段：{', '.join(unknown_fields)}。")

    if "positive" not in data:
        raise ValueError(f"{context}缺少必填字段 positive。")
    positive = data["positive"]
    if not isinstance(positive, str) or not positive.strip():
        raise ValueError(f"{context} positive 必须是非空字符串。")

    name = data.get("name", default_name)
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{context} name 必须是非空字符串。")

    return PromptRecord(
        name=name.strip(),
        positive=positive,
        negative="",
        count=1,
        seed=None,
        source_line=line_number,
    )


def _load_jsonl_records(prompt_file: str) -> tuple[Path, list[PromptRecord]]:
    path = _resolve_prompt_path(prompt_file)
    return path, _parse_jsonl_text(path.read_text(encoding="utf-8-sig"), str(path))


def _parse_jsonl_text(content: str, source_name: str = "JSONL 文本") -> list[PromptRecord]:
    records: list[PromptRecord] = []

    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"第 {line_number} 行不是有效 JSON：{error.msg}（第 {error.colno} 列）。"
            ) from error
        record = _parse_record(data, line_number=line_number, default_name=f"prompt-{line_number:03d}")
        if record is not None:
            records.append(record)

    if not records:
        raise ValueError(f"{source_name}中没有有效记录")
    return records


def build_prompt_file_preview(prompt_file: str) -> dict[str, Any]:
    """Return the same enabled records used by execution for the web preview."""
    path = _resolve_prompt_path(prompt_file)
    raw_content = path.read_bytes()
    content = raw_content.decode("utf-8-sig")
    records = _parse_jsonl_text(content, str(path))
    return {
        "ok": True,
        "file_name": path.name,
        "resolved_path": str(path),
        "file_sha256": hashlib.sha256(raw_content).hexdigest(),
        "content": content,
        "record_count": len(records),
        "image_count": _expanded_count(records),
        "records": [
            {
                "name": record.name,
                "positive": record.positive,
                "negative": record.negative,
                "count": record.count,
                "seed": record.seed,
                "source_line": record.source_line,
            }
            for record in records
        ],
    }


def _manual_record(positive: str, negative: str, name: str, count: int) -> PromptRecord:
    if not isinstance(positive, str) or not positive.strip():
        raise ValueError("manual 模式下 positive 必须是非空字符串。")
    if not isinstance(negative, str):
        raise ValueError("manual 模式下 negative 必须是字符串。")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("manual 模式下 name 必须是非空字符串。")
    if not _is_plain_int(count) or not 1 <= count <= HARD_MAX_IMAGES:
        raise ValueError(f"count 必须是 1 到 {HARD_MAX_IMAGES} 之间的整数。")
    return PromptRecord(name.strip(), positive, negative, count, None)


def _expanded_count(records: list[PromptRecord]) -> int:
    return sum(record.count for record in records)


def _assign_seeds(
    records: list[PromptRecord], *, seed_mode: str, base_seed: int
) -> list[list[int]]:
    """Return one seed list per prompt record.

    An explicit record seed always wins and is repeated for every copy, matching
    fixed-mode semantics.
    """
    base_seed = _validate_seed(base_seed, context="全局")
    seed_mode = _normalize_seed_mode(seed_mode)

    seeds_by_record: list[list[int]] = []
    global_index = 0
    copy_count = max((record.count for record in records), default=0)
    shared_random_seeds = (
        [secrets.randbits(64) for _ in range(copy_count)]
        if seed_mode == "shared_random_per_copy"
        else None
    )

    for record in records:
        if record.seed is not None:
            record_seeds = [record.seed] * record.count
        elif seed_mode == "fixed":
            record_seeds = [base_seed] * record.count
        elif seed_mode == "increment_per_image":
            record_seeds = [
                (base_seed + global_index + copy_index) & MAX_SEED
                for copy_index in range(record.count)
            ]
        elif seed_mode == "shared_increment_per_copy":
            record_seeds = [
                (base_seed + copy_index) & MAX_SEED
                for copy_index in range(record.count)
            ]
        elif seed_mode == "shared_random_per_copy":
            record_seeds = shared_random_seeds[:record.count]
        elif seed_mode == "random_per_prompt":
            prompt_seed = secrets.randbits(64)
            record_seeds = [prompt_seed] * record.count
        else:
            record_seeds = [secrets.randbits(64) for _ in range(record.count)]

        seeds_by_record.append(record_seeds)
        global_index += record.count

    return seeds_by_record


class BatchPromptSource:
    """Read manual or JSONL prompts and emit aligned ComfyUI list outputs."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source_mode": (
                    SOURCE_MODES,
                    {
                        "default": "manual",
                        "tooltip": "manual：原生文本框输入；jsonl_file：载入可编辑卡片，Queue 使用卡片实时内容。",
                    },
                ),
                "positive": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": "manual 模式的正面提示词。",
                    },
                ),
                "negative": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": "manual 模式的负面提示词，可留空。",
                    },
                ),
                "name": (
                    "STRING",
                    {
                        "default": "manual",
                        "tooltip": "manual 模式的名称；count 大于 1 时自动添加编号。",
                    },
                ),
                "prompt_file": (
                    "STRING",
                    {
                        "default": "example.jsonl",
                        "tooltip": "JSONL 文件。相对路径从插件 prompts 目录解析，也支持绝对路径。",
                    },
                ),
                "count": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": HARD_MAX_IMAGES,
                        "step": 1,
                        "tooltip": "manual 模式生成的图片数量；设为 1 即单图模式。",
                    },
                ),
                "seed_mode": (
                    SEED_MODE_OPTIONS,
                    {
                        "default": SEED_MODE_LABELS["fixed"],
                        "tooltip": (
                            "fixed：全部固定；increment_per_image：逐张递增；"
                            "shared_increment_per_copy：按副本序号跨卡片复用递增 Seed；"
                            "shared_random_per_copy：按副本序号跨卡片复用随机 Seed；"
                            "random_per_prompt：每条 prompt 随机一次；"
                            "random_per_image：每张独立随机。"
                        ),
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": MAX_SEED,
                        "step": 1,
                        "control_after_generate": False,
                        "tooltip": "fixed 和 increment_per_image 使用的基础 seed。",
                    },
                ),
                "max_images": (
                    "INT",
                    {
                        "default": 100,
                        "min": 1,
                        "max": HARD_MAX_IMAGES,
                        "step": 1,
                        "tooltip": "本次允许输出的最大图片数；超出时整批停止。",
                    },
                ),
            },
            "optional": {
                "jsonl_editor": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": (
                            "JSONL 卡片编辑器的实时内容。由前端自动维护；"
                            "非空时优先于磁盘文件，用于保证 Queue 使用当前卡片文本。"
                        ),
                    },
                ),
                "use_negative": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "开启",
                        "label_off": "关闭",
                        "tooltip": "开启后才显示并使用负面 Prompt。",
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "INT", "STRING", "INT")
    RETURN_NAMES = ("positive", "negative", "seed", "name", "index")
    OUTPUT_IS_LIST = (True, True, True, True, True)
    OUTPUT_TOOLTIPS = (
        "正面提示词列表",
        "负面提示词列表",
        "与提示词严格对齐的 seed 列表",
        "唯一条目名称列表",
        "从 1 开始的全局条目序号",
    )
    FUNCTION = "load_prompts"
    CATEGORY = "qing/Prompt"
    DESCRIPTION = (
        "从原生文本框或 JSONL 卡片编辑器读取多组提示词，输出等长列表，"
        "让 ComfyUI 下游节点逐张执行而不是建立显存占用更高的大 batch。"
    )

    @staticmethod
    def IS_CHANGED(
        source_mode: str,
        positive: str,
        negative: str,
        name: str,
        prompt_file: str,
        count: int,
        seed_mode: str,
        seed: int,
        max_images: int,
        jsonl_editor: str = "",
        use_negative: bool = False,
    ):
        try:
            seed_mode = _normalize_seed_mode(seed_mode)
        except ValueError:
            return float("NaN")
        if seed_mode in {
            "shared_random_per_copy",
            "random_per_prompt",
            "random_per_image",
        }:
            return float("NaN")

        state: dict[str, Any] = {
            "source_mode": source_mode,
            "seed_mode": seed_mode,
            "seed": seed,
            "max_images": max_images,
            "use_negative": bool(use_negative),
        }
        if use_negative:
            state["negative"] = negative
        if source_mode == "manual":
            state.update(
                positive=positive,
                negative=negative,
                name=name,
                count=count,
            )
        elif source_mode == "jsonl_file":
            if isinstance(jsonl_editor, str) and jsonl_editor.strip():
                state.update(
                    prompt_file=prompt_file,
                    editor_sha256=hashlib.sha256(
                        jsonl_editor.encode("utf-8")
                    ).hexdigest(),
                )
            else:
                try:
                    path = _resolve_prompt_path(prompt_file)
                    state.update(
                        prompt_file=str(path),
                        file_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    )
                except (OSError, ValueError):
                    return float("NaN")
        else:
            return float("NaN")

        serialized = json.dumps(state, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return hashlib.sha256(serialized).hexdigest()

    @staticmethod
    def load_prompts(
        source_mode: str,
        positive: str,
        negative: str,
        name: str,
        prompt_file: str,
        count: int,
        seed_mode: str,
        seed: int,
        max_images: int,
        jsonl_editor: str = "",
        use_negative: bool = False,
    ):
        effective_negative = negative if use_negative else ""
        if source_mode == "manual":
            records = [_manual_record(positive, effective_negative, name, count)]
        elif source_mode == "jsonl_file":
            if isinstance(jsonl_editor, str) and jsonl_editor.strip():
                records = _parse_jsonl_text(jsonl_editor, "卡片编辑器内容")
            else:
                _, records = _load_jsonl_records(prompt_file)
            records = [
                replace(record, negative=effective_negative, count=count)
                for record in records
            ]
        else:
            raise ValueError(f"未知 source_mode：{source_mode}")

        if not _is_plain_int(max_images) or not 1 <= max_images <= HARD_MAX_IMAGES:
            raise ValueError(f"max_images 必须是 1 到 {HARD_MAX_IMAGES} 之间的整数。")

        total = _expanded_count(records)
        if total > max_images:
            raise ValueError(
                f"本次共请求 {total} 张图片，超过 max_images={max_images}。"
                "请检查 JSONL 中的 count，或明确提高 max_images。"
            )

        seeds_by_record = _assign_seeds(records, seed_mode=seed_mode, base_seed=seed)
        positives: list[str] = []
        negatives: list[str] = []
        seeds: list[int] = []
        names: list[str] = []
        indexes: list[int] = []

        global_index = 0
        for record, record_seeds in zip(records, seeds_by_record, strict=True):
            for copy_index in range(record.count):
                global_index += 1
                item_name = (
                    record.name
                    if record.count == 1
                    else f"{record.name}_{copy_index + 1:03d}"
                )
                positives.append(record.positive)
                negatives.append(record.negative)
                seeds.append(record_seeds[copy_index])
                names.append(item_name)
                indexes.append(global_index)

        lengths = {len(positives), len(negatives), len(seeds), len(names), len(indexes)}
        if lengths != {total}:
            raise RuntimeError("内部错误：Prompt 输出列表长度不一致。")

        return positives, negatives, seeds, names, indexes


class Qing_ImageGallery(_PreviewImageBase):
    """Preview a complete image batch with a small previous/next gallery UI."""

    CATEGORY = "qing/Output"
    DESCRIPTION = (
        "显示一组最终图片，并提供上一张、下一张和当前序号。"
        "它只负责预览，不改变输入图片或保存逻辑。"
    )
    SEARCH_ALIASES = ["image gallery", "gallery", "image carousel", "图片画廊", "上一张", "下一张"]


__all__ = [
    "BatchPromptSource",
    "Qing_ImageGallery",
    "HARD_MAX_IMAGES",
    "MAX_SEED",
    "PROMPTS_DIR",
    "SEED_MODES",
    "SOURCE_MODES",
    "build_prompt_file_preview",
]
