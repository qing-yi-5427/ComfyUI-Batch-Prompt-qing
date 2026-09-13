# JSONL Prompt 文件格式

本文档描述 ComfyUI Batch Prompt qing V1.7 接受的 JSONL 文件格式，以及卡片编辑器的读取和保存规则。

## 基本规则

- 文件扩展名必须是 `.jsonl`。
- 文件编码必须是 UTF-8；带 UTF-8 BOM 也可以读取。
- 文件最大 10 MiB。
- 每个有效物理行是一张 Prompt 卡片，并且必须是一个完整的 JSON 对象。
- 空行以及去除前导空格后以 `#` 开头的行会被忽略。
- 文件中至少要有一条有效记录。
- JSON 数组、跨多行的格式化对象以及尾随逗号都不属于有效 JSONL。

## 字段

每条记录只允许以下两个字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `positive` | 字符串 | 是 | 非空正面 Prompt；原始空格和转义后的换行会保留 |
| `name` | 字符串 | 否 | 卡片/输出名称；省略时使用 `prompt-物理行号`，例如 `prompt-003` |

未知字段会使整批任务停止并报告行号。以下设置由节点统一控制，不能写进记录：

- `negative`
- `count`
- `seed`
- `seed_mode`
- `enabled`

`name` 不要求唯一，但如果它会用于保存文件名，建议每张卡片使用不同名称。每张卡片生成多份时，节点会自动在名称后添加 `_001`、`_002` 等编号。

## 有效示例

```jsonl
# 春季主题
{"name":"spring-garden","positive":"a quiet spring garden, morning light"}

{"name":"paper-city","positive":"a miniature paper city on a wooden desk"}
{"positive":"a red fox\nstanding in a misty forest"}
```

第三条省略了 `name`，会根据它所在的物理行生成默认名称。Prompt 中需要换行时，应在 JSON 字符串里写 `\n`，不能直接把一个对象拆成多行。

中文可以直接保存，不需要转换成 Unicode 转义：

```jsonl
{"name":"雨夜","positive":"雨夜街道，霓虹灯倒影，电影感构图"}
```

## 常见错误

### 把整个文件写成 JSON 数组

```json
[
  {"name":"a","positive":"prompt A"},
  {"name":"b","positive":"prompt B"}
]
```

这不是 JSONL。正确写法是每个对象独占一行，并去掉方括号和对象之间的逗号。

### 一个对象跨多行

```json
{
  "name": "a",
  "positive": "prompt A"
}
```

JSONL 解析器会把每个物理行分别解析，因此对象必须压在同一行。

### 使用未支持字段

```jsonl
{"name":"a","positive":"prompt A","count":3}
```

`count` 必须在节点界面设置。同样，负面 Prompt 和 Seed 也由节点统一管理。

## 路径规则

节点的 `JSONL 文件` 支持两种路径：

- `example.jsonl`：相对于插件目录下的 `prompts` 文件夹；
- `D:\prompts\project.jsonl`：本机绝对路径。

读取和保存时，目标必须是已经存在的普通 `.jsonl` 文件。相对路径不会在其他目录中搜索。

## 卡片编辑器与 Queue

文件读取为卡片后，卡片中的当前文本就是运行时数据源：

- 修改卡片但不保存，下一次 Queue 仍会使用修改后的文本；
- 手动模式的 Prompt 不会修改 JSONL 文件；
- 磁盘文件被外部程序修改后，卡片不会自动无提示地覆盖它；请先“重新读取”；
- “重新读取”会用磁盘内容替换当前卡片，未保存修改会在确认后丢弃。

## 保存行为

点击“保存 JSONL”时，插件会：

1. 校验所有卡片；
2. 检查磁盘文件是否被外部修改；
3. 为现有文件创建 `<文件名>.bak.<UTC时间戳>` 备份；
4. 先写临时文件，再原子替换原文件。

卡片保存时会重新序列化为规范的一行一个对象。原文件中的注释、空行、缩进和字段排列不保证保留；备份文件保留保存前的原始内容。仓库的 `.gitignore` 已忽略这些自动备份和临时文件。
