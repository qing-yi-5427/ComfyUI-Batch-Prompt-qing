# -*- coding: utf-8 -*-
"""ComfyUI Batch Prompt qing custom nodes."""

from .nodes import BatchPromptSource
from . import routes as _routes  # noqa: F401 -- registers local preview route


NODE_CLASS_MAPPINGS = {
    "TE_BatchPromptSource": BatchPromptSource,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TE_BatchPromptSource": "批量 Prompt 源（qing）",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
