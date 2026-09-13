# -*- coding: utf-8 -*-
"""ComfyUI Batch Prompt qing custom nodes."""

from .nodes import BatchPromptSource, Qing_ImageGallery, Qing_FaceDetailerProgress
from . import routes as _routes  # noqa: F401 -- registers local preview route


NODE_CLASS_MAPPINGS = {
    "Qing_BatchPromptSource": BatchPromptSource,
    "Qing_ImageGallery": Qing_ImageGallery,
    "Qing_FaceDetailerProgress": Qing_FaceDetailerProgress,
    # Legacy aliases keep existing TE-named workflows loadable.
    "TE_BatchPromptSource": BatchPromptSource,
    "TE_ImageGallery": Qing_ImageGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Qing_BatchPromptSource": "批量 Prompt 源（qing）",
    "Qing_ImageGallery": "结果画廊（qing）",
    "Qing_FaceDetailerProgress": "FaceDetailer（逐张进度·qing）",
    "TE_BatchPromptSource": "批量 Prompt 源（qing）",
    "TE_ImageGallery": "结果画廊（qing）",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
