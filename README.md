# ComfyUI Batch Prompt qing

一个面向 ComfyUI 的批量提示词源节点。它同时提供原生单 Prompt 输入和可编辑的 JSONL 卡片界面，并为批量生成提供 6 种明确的 Seed 策略。

插件只负责输出严格对齐的 Prompt、Seed、名称和序号列表；它不加载模型、不执行采样，也不创建包含全部图片的大 latent batch。

## 主要功能

- **手动模式**：使用 ComfyUI 原生多行文本框输入正面 Prompt；生成数量设为 `1` 即单图模式。
- **JSONL 模式**：把本地 JSONL 文件读取为卡片，可新增、复制、排序、删除、改名和编辑 Prompt。
- **实时内容**：每次 Queue 都以卡片中当前显示的文本为准，不要求先保存文件。
- **显式保存**：只有点击“保存 JSONL”才会写回磁盘，并为原文件创建时间戳备份。
- **可选负面 Prompt**：默认关闭；开启后才显示文本框，并应用于全部卡片。
- **6 种 Seed 模式**：固定、全局递增、按轮共享、逐组随机和逐图随机。
- **安全上限**：默认最多输出 100 张，避免数量设置错误时提交超大任务。
- **无需额外 Python 依赖**：使用 ComfyUI 已有运行环境即可。

## 安装

进入 ComfyUI 的 `custom_nodes` 目录并克隆仓库：

```powershell
Set-Location "你的 ComfyUI 路径\custom_nodes"
git clone https://github.com/qing-yi-5427/ComfyUI-Batch-Prompt-qing.git
```

重启 ComfyUI，然后在节点菜单的 `qing/Prompt` 分类中添加 **批量 Prompt 源（qing）**。

更新插件：

```powershell
git -C "你的 ComfyUI 路径\custom_nodes\ComfyUI-Batch-Prompt-qing" pull --ff-only
```

## 连接方法

| 输出 | 建议连接 |
|---|---|
| `positive` | 正面 `CLIP Text Encode.text` |
| `negative` | 负面 `CLIP Text Encode.text` |
| `seed` | `KSampler.seed` 或 `KSamplerAdvanced.noise_seed` |
| `name` | 支持字符串输入的保存/命名节点 |
| `index` | 需要全局序号的下游节点 |

五个输出都是等长列表，ComfyUI 会按列表顺序执行下游节点。建议让 latent 节点的 `batch_size` 保持为 `1`：图片数量增加时总耗时和 GPU 总工作量会增加，但本插件不会把所有图片合成一个大 tensor batch。

## 输入模式

### 手动模式

直接在原生“正面 Prompt”文本框中输入内容。`生成数量` 控制这个 Prompt 生成几张图片，`1` 就是普通单图。手动文本框不会写入或修改 JSONL 文件。

### JSONL 模式

`JSONL 文件` 可以填写相对于插件 `prompts` 目录的文件名，例如 `example.jsonl`，也可以填写本机 `.jsonl` 文件的绝对路径。

文件载入后会显示为卡片。卡片编辑、新增、复制、排序和删除会立即成为下一次 Queue 的输入；黄色状态表示修改尚未写回文件。

- **保存 JSONL**：校验卡片并写回当前文件。
- **重新读取**：放弃未保存修改，重新载入磁盘内容。
- 如果文件被外部程序修改，插件会阻止旧卡片直接覆盖它。

完整格式与保存规则见 [JSONL 格式说明](docs/JSONL_FORMAT.md)。

## 生成数量与 Seed

JSONL 模式下，“每张卡片生成数量”会应用到每一张卡片。例如 4 张卡片、数量 `3`，总共输出 12 张图。latent 的 `batch_size` 仍建议设为 `1`，两者不冲突。

以下以两张卡片 A/B、每张生成 3 张、基础 Seed 为 100 为例：

| Seed 模式 | A 的 Seed | B 的 Seed | 用途 |
|---|---|---|---|
| `fixed` | 100, 100, 100 | 100, 100, 100 | 全部固定 |
| `increment_per_image` | 100, 101, 102 | 103, 104, 105 | 按最终输出顺序连续递增 |
| `shared_increment_per_copy` | 100, 101, 102 | 100, 101, 102 | 同一副本轮次跨卡片共用 Seed |
| `shared_random_per_copy` | R1, R2, R3 | R1, R2, R3 | 每轮随机，同轮跨卡片共用 Seed |
| `random_per_prompt` | R1, R1, R1 | R2, R2, R2 | 每张卡片随机一次 |
| `random_per_image` | R1, R2, R3 | R4, R5, R6 | 每张图片独立随机 |

如果要让多张卡片各生成 3 张，并让同一轮的各卡片使用相同 Seed、三轮之间不同，选择 `shared_increment_per_copy` 或 `shared_random_per_copy`。

## 示例

- `prompts/example.jsonl`：单条 Prompt 格式示例。
- `examples/minimal_workflow.json`：只使用本插件和 ComfyUI 原生节点的精简文生图工作流。载入后请先选择你本机已有的 checkpoint。

## 许可

[MIT License](LICENSE)
