import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_NAME = "TE_BatchPromptSource";
const PREVIEW_ROUTE = "/batch_prompt_qing/preview";
const FILE_LIST_ROUTE = "/batch_prompt_qing/files";
const SAVE_ROUTE = "/batch_prompt_qing/save";
const HIDDEN_TYPE = "batch-prompt-te-hidden";
const STYLE_ID = "batch-prompt-te-card-editor-style";

const LABELS = {
    source_mode: "输入模式",
    positive: "正面 Prompt",
    negative: "负面 Prompt（可留空）",
    name: "任务名称",
    prompt_file: "JSONL 文件",
    count: "生成数量 · 1 为单图",
    seed_mode: "Seed 模式",
    seed: "基础 Seed",
    max_images: "安全上限",
    use_negative: "使用负面 Prompt",
};

const SEED_HELP = {
    fixed: "全程固定 · 每张相同",
    increment_per_image: "全局递增 · 所有图片依次 +1",
    shared_increment_per_copy: "按轮递增 · 同轮所有卡片共用",
    shared_random_per_copy: "按轮随机 · 同轮所有卡片共用",
    random_per_prompt: "每组随机 · 同一卡片共用",
    random_per_image: "每张随机 · 全部独立",
};

const SEED_MODE_KEYS = Object.keys(SEED_HELP);

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .bpte-editor { position:relative; box-sizing:border-box; width:100%; height:100%; min-height:320px; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--border-color,#484d55); border-radius:9px; background:var(--comfy-menu-bg,#202328); color:var(--input-text,#e8ebef); font:12px/1.45 Arial,"Microsoft YaHei",sans-serif; }
        .bpte-editor * { box-sizing:border-box; }
        .bpte-toolbar { flex:0 0 auto; display:flex; align-items:center; gap:7px; min-height:44px; padding:7px 9px; border-bottom:1px solid #41464e; background:#272b31; }
        .bpte-title { min-width:0; margin-right:auto; }
        .bpte-title strong { display:block; color:#f3f5f7; font-size:13px; letter-spacing:.01em; }
        .bpte-status { display:block; max-width:420px; color:#9da8b4; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bpte-status[data-tone="dirty"] { color:#f4c982; }
        .bpte-status[data-tone="ok"] { color:#72d89a; }
        .bpte-status[data-tone="error"] { color:#ff8f8f; }
        .bpte-btn { appearance:none; flex:0 0 auto; height:28px; padding:0 10px; border:1px solid #505760; border-radius:6px; background:#333840; color:#e8ebef; font:600 11px Arial,"Microsoft YaHei",sans-serif; cursor:pointer; }
        .bpte-btn:hover { background:#3d444d; border-color:#66707b; }
        .bpte-btn:focus-visible, .bpte-field:focus-visible { outline:2px solid #74a7ff; outline-offset:1px; }
        .bpte-btn-primary { border-color:#287d55; background:#236846; color:#f3fff8; }
        .bpte-btn-primary:hover { background:#2a7952; }
        .bpte-btn-danger { color:#ffb6b6; }
        .bpte-btn:disabled { cursor:default; opacity:.45; }
        .bpte-grid { flex:1 1 auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); align-content:start; gap:9px; padding:9px; overflow:auto; scrollbar-width:thin; }
        .bpte-card { min-width:0; overflow:hidden; border:1px solid #454b54; border-radius:8px; background:#25292f; box-shadow:0 1px 2px rgba(0,0,0,.25); }
        .bpte-card-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:7px; min-height:39px; padding:6px 8px; border-bottom:1px solid #3c424a; background:#2b3037; }
        .bpte-index { display:grid; place-items:center; width:25px; height:25px; border-radius:6px; background:#1f5d40; color:#dff9e9; font-weight:800; font-size:10px; }
        .bpte-name { width:100%; height:27px; padding:4px 7px; }
        .bpte-card-actions { display:flex; gap:3px; }
        .bpte-icon { appearance:none; width:25px; height:25px; padding:0; border:0; border-radius:5px; background:transparent; color:#abb4be; font-size:13px; cursor:pointer; }
        .bpte-icon:hover { background:#3a4149; color:#fff; }
        .bpte-icon:disabled { opacity:.3; cursor:default; }
        .bpte-card-body { padding:8px; }
        .bpte-label { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 1px 5px; color:#aeb7c1; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.055em; }
        .bpte-label span:last-child { color:#7f8a96; font-weight:400; text-transform:none; letter-spacing:0; }
        .bpte-field { border:1px solid #444b54; border-radius:6px; background:var(--comfy-input-bg,#171b20); color:var(--input-text,#eef1f4); font:12px/1.5 Arial,"Microsoft YaHei",sans-serif; }
        .bpte-prompt { display:block; width:100%; min-height:126px; resize:vertical; padding:8px 9px; overflow-wrap:anywhere; }
        .bpte-field[data-invalid="true"] { border-color:#d76464; box-shadow:inset 3px 0 #d76464; }
        .bpte-empty { grid-column:1/-1; display:grid; place-items:center; min-height:210px; padding:30px; border:1px dashed #4a515a; border-radius:8px; color:#8f99a5; text-align:center; }
        .bpte-footer { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-top:1px solid #3d4249; color:#8e99a5; background:#23272c; font-size:10px; }
        .bpte-dirty-dot { display:inline-block; width:7px; height:7px; margin-right:5px; border-radius:50%; background:#68727d; }
        .bpte-dirty-dot[data-dirty="true"] { background:#f0b65e; box-shadow:0 0 0 2px rgba(240,182,94,.14); }
        .bpte-file-picker { position:absolute; inset:8px; z-index:50; display:none; flex-direction:column; overflow:hidden; border:1px solid #555e69; border-radius:9px; background:#20242a; box-shadow:0 12px 36px rgba(0,0,0,.55); }
        .bpte-file-picker[data-open="true"] { display:flex; }
        .bpte-picker-head { display:flex; align-items:center; gap:8px; min-height:46px; padding:8px 10px; border-bottom:1px solid #414850; background:#292e35; }
        .bpte-picker-title { min-width:0; margin-right:auto; }
        .bpte-picker-title strong { display:block; color:#f2f5f7; font-size:13px; }
        .bpte-picker-title span { display:block; color:#929da8; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bpte-file-list { flex:1 1 auto; display:flex; flex-direction:column; gap:7px; min-height:0; padding:10px; overflow:auto; }
        .bpte-file-item { appearance:none; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; width:100%; padding:9px 11px; border:1px solid #454c55; border-radius:7px; background:#282d33; color:#e9edf1; text-align:left; cursor:pointer; }
        .bpte-file-item:hover { border-color:#397e5c; background:#2c3532; }
        .bpte-file-item[data-current="true"] { border-color:#368760; box-shadow:inset 3px 0 #42a874; }
        .bpte-file-name { min-width:0; overflow:hidden; font-weight:700; white-space:nowrap; text-overflow:ellipsis; }
        .bpte-file-source { color:#83cda3; font-size:10px; }
        .bpte-file-path { grid-column:1/-1; min-width:0; overflow:hidden; color:#89949f; font-size:10px; white-space:nowrap; text-overflow:ellipsis; }
        .bpte-picker-empty { display:grid; place-items:center; min-height:170px; padding:24px; border:1px dashed #4b535d; border-radius:8px; color:#909ba6; text-align:center; }
    `;
    document.head.append(style);
}

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget.__bpteOriginal) {
        widget.__bpteOriginal = {
            type: widget.type,
            computeSize: widget.computeSize,
            hidden: widget.hidden,
            optionsHidden: widget.options?.hidden,
            inputDisplay: widget.inputEl?.style?.display ?? "",
            elementDisplay: widget.element?.style?.display ?? "",
        };
    }
    const original = widget.__bpteOriginal;
    widget.type = visible ? original.type : HIDDEN_TYPE;
    widget.computeSize = visible ? original.computeSize : () => [0, -4];
    widget.hidden = visible ? original.hidden : true;
    if (widget.options) widget.options.hidden = visible ? original.optionsHidden : true;
    if (widget.inputEl) widget.inputEl.style.display = visible ? original.inputDisplay : "none";
    if (widget.element) widget.element.style.display = visible ? original.elementDisplay : "none";
}

function textControl(widget) {
    for (const candidate of [widget?.element, widget?.inputEl]) {
        if (!candidate) continue;
        if (candidate.matches?.("textarea, input")) return candidate;
        const nested = candidate.querySelector?.("textarea, input");
        if (nested) return nested;
    }
    return null;
}

function wrapCallback(widget, handler) {
    if (!widget || widget.__bpteCallbackWrapped) return;
    const original = widget.callback;
    widget.callback = function (...args) {
        const result = original?.apply(this, args);
        handler(...args);
        return result;
    };
    widget.__bpteCallbackWrapped = true;
}

function normalizeRecord(record, index) {
    return {
        name: typeof record?.name === "string" && record.name.trim()
            ? record.name.trim()
            : `prompt-${String(index + 1).padStart(3, "0")}`,
        positive: typeof record?.positive === "string" ? record.positive : "",
    };
}

function parseJsonl(content) {
    const records = [];
    String(content || "").split(/\r?\n/).forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) return;
        let value;
        try {
            value = JSON.parse(line);
        } catch (error) {
            throw new Error(`第 ${index + 1} 行不是有效 JSON`);
        }
        if (!value || Array.isArray(value) || typeof value !== "object") {
            throw new Error(`第 ${index + 1} 行必须是 JSON 对象`);
        }
        const unknown = Object.keys(value).filter((key) => !["name", "positive"].includes(key));
        if (unknown.length) throw new Error(`第 ${index + 1} 行包含未知字段：${unknown.join("、")}`);
        records.push(normalizeRecord(value, records.length));
    });
    if (!records.length) throw new Error("没有可用的 Prompt 记录");
    return records;
}

function recordsToJsonl(records) {
    return records.map((record, index) => JSON.stringify(normalizeRecord(record, index))).join("\n") + "\n";
}

function setStatus(node, text, tone = "") {
    if (!node.__bpteStatus) return;
    node.__bpteStatus.textContent = text;
    node.__bpteStatus.dataset.tone = tone;
}

function currentCount(node) {
    const value = Number(findWidget(node, "count")?.value ?? 1);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function updateSummary(node) {
    const total = (node.__bpteRecords?.length || 0) * currentCount(node);
    if (node.__bpteSummary) node.__bpteSummary.textContent = `${node.__bpteRecords?.length || 0} 组 · 预计 ${total} 张`;
    if (node.__bpteDirtyDot) node.__bpteDirtyDot.dataset.dirty = node.__bpteDirty ? "true" : "false";
    if (node.__bpteSaveButton) node.__bpteSaveButton.disabled = !node.__bpteDirty || !node.__bpteRecords?.length;
}

function syncEditor(node, { dirty = true } = {}) {
    const widget = findWidget(node, "jsonl_editor");
    if (!widget) return;
    const content = recordsToJsonl(node.__bpteRecords || []);
    widget.value = content;
    widget.callback?.(content);
    if (dirty) {
        node.__bpteDirty = true;
        node.properties ??= {};
        node.properties.bpte_editor_dirty = true;
        node.properties.bpte_editor_path = String(findWidget(node, "prompt_file")?.value || "");
        setStatus(node, "有未保存修改 · Queue 将使用当前卡片内容", "dirty");
    }
    updateSummary(node);
    node.graph?.setDirtyCanvas?.(true, true);
}

function makeButton(label, className, action, title = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", action);
    return button;
}

function renderCards(node) {
    const grid = node.__bpteGrid;
    if (!grid) return;
    grid.replaceChildren();
    const records = node.__bpteRecords || [];
    if (!records.length) {
        const empty = document.createElement("div");
        empty.className = "bpte-empty";
        empty.innerHTML = "<div><strong>还没有 Prompt 卡片</strong><br>点击右上角“添加卡片”，或重新读取 JSONL 文件。</div>";
        grid.append(empty);
        updateSummary(node);
        return;
    }

    records.forEach((record, index) => {
        const card = document.createElement("section");
        card.className = "bpte-card";

        const head = document.createElement("div");
        head.className = "bpte-card-head";
        const badge = document.createElement("div");
        badge.className = "bpte-index";
        badge.textContent = String(index + 1).padStart(2, "0");

        const name = document.createElement("input");
        name.className = "bpte-field bpte-name";
        name.type = "text";
        name.value = record.name;
        name.placeholder = `prompt-${String(index + 1).padStart(3, "0")}`;
        name.setAttribute("aria-label", `第 ${index + 1} 张卡片名称`);
        name.addEventListener("input", () => {
            record.name = name.value;
            name.dataset.invalid = name.value.trim() ? "false" : "true";
            syncEditor(node);
        });

        const actions = document.createElement("div");
        actions.className = "bpte-card-actions";
        const up = makeButton("↑", "bpte-icon", () => moveRecord(node, index, -1), "上移");
        const down = makeButton("↓", "bpte-icon", () => moveRecord(node, index, 1), "下移");
        const duplicate = makeButton("⧉", "bpte-icon", () => duplicateRecord(node, index), "复制卡片");
        const remove = makeButton("×", "bpte-icon", () => removeRecord(node, index), "删除卡片");
        up.disabled = index === 0;
        down.disabled = index === records.length - 1;
        actions.append(up, down, duplicate, remove);
        head.append(badge, name, actions);

        const body = document.createElement("div");
        body.className = "bpte-card-body";
        const label = document.createElement("label");
        label.className = "bpte-label";
        const labelText = document.createElement("span");
        labelText.textContent = "Positive Prompt";
        const countText = document.createElement("span");
        countText.textContent = `本组 ${currentCount(node)} 张`;
        label.append(labelText, countText);
        const textarea = document.createElement("textarea");
        textarea.className = "bpte-field bpte-prompt";
        textarea.value = record.positive;
        textarea.placeholder = "输入这一组的正面 Prompt…";
        textarea.spellcheck = false;
        textarea.setAttribute("aria-label", `第 ${index + 1} 张卡片的正面 Prompt`);
        textarea.addEventListener("input", () => {
            record.positive = textarea.value;
            textarea.dataset.invalid = textarea.value.trim() ? "false" : "true";
            syncEditor(node);
        });
        body.append(label, textarea);
        card.append(head, body);
        grid.append(card);
    });
    updateSummary(node);
}

function moveRecord(node, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= node.__bpteRecords.length) return;
    [node.__bpteRecords[index], node.__bpteRecords[target]] = [node.__bpteRecords[target], node.__bpteRecords[index]];
    syncEditor(node);
    renderCards(node);
}

function duplicateRecord(node, index) {
    const source = node.__bpteRecords[index];
    node.__bpteRecords.splice(index + 1, 0, { name: `${source.name}-copy`, positive: source.positive });
    syncEditor(node);
    renderCards(node);
}

function removeRecord(node, index) {
    node.__bpteRecords.splice(index, 1);
    syncEditor(node);
    renderCards(node);
}

function addRecord(node) {
    const index = node.__bpteRecords.length;
    node.__bpteRecords.push({ name: `prompt-${String(index + 1).padStart(3, "0")}`, positive: "" });
    syncEditor(node);
    renderCards(node);
    requestAnimationFrame(() => {
        const cards = node.__bpteGrid?.querySelectorAll(".bpte-card");
        const last = cards?.[cards.length - 1];
        last?.scrollIntoView?.({ block: "nearest" });
        last?.querySelector?.("textarea")?.focus();
    });
}

function validateRecords(node) {
    const records = node.__bpteRecords || [];
    if (!records.length) throw new Error("至少需要一张 Prompt 卡片");
    records.forEach((record, index) => {
        if (!String(record.name || "").trim()) throw new Error(`第 ${index + 1} 张卡片的名称不能为空`);
        if (!String(record.positive || "").trim()) throw new Error(`第 ${index + 1} 张卡片的 Prompt 不能为空`);
    });
    return recordsToJsonl(records);
}

function closeFilePicker(node) {
    const picker = node.__bpteFilePicker;
    if (!picker) return;
    picker.dataset.open = "false";
}

function formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 1024) return `${Math.max(0, Math.round(size || 0))} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

function renderFilePicker(node, files = []) {
    const list = node.__bpteFileList;
    if (!list) return;
    list.replaceChildren();
    const current = String(findWidget(node, "prompt_file")?.value || "").trim().toLowerCase();
    if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "bpte-picker-empty";
        empty.innerHTML = "<div><strong>没有找到 JSONL 文件</strong><br>请把文件放进插件 prompts 目录，或手动填写绝对路径。</div>";
        list.append(empty);
        return;
    }
    files.forEach((file) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bpte-file-item";
        const value = String(file.value || "");
        button.dataset.current = value.toLowerCase() === current ? "true" : "false";
        const name = document.createElement("span");
        name.className = "bpte-file-name";
        name.textContent = String(file.name || value);
        const source = document.createElement("span");
        source.className = "bpte-file-source";
        source.textContent = `${String(file.source || "JSONL")} · ${formatFileSize(file.size)}`;
        const path = document.createElement("span");
        path.className = "bpte-file-path";
        path.textContent = value;
        button.append(name, source, path);
        button.addEventListener("click", () => selectPromptFile(node, value));
        list.append(button);
    });
}

async function openFilePicker(node) {
    const picker = node.__bpteFilePicker;
    if (!picker) return;
    picker.dataset.open = "true";
    const list = node.__bpteFileList;
    if (list) list.innerHTML = "<div class=\"bpte-picker-empty\">正在读取可选文件…</div>";
    const current = String(findWidget(node, "prompt_file")?.value || "").trim();
    try {
        const query = current ? `?current=${encodeURIComponent(current)}` : "";
        const response = await api.fetchApi(`${FILE_LIST_ROUTE}${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
        renderFilePicker(node, Array.isArray(data.files) ? data.files : []);
    } catch (error) {
        if (!list) return;
        list.innerHTML = `<div class="bpte-picker-empty">读取文件列表失败：${String(error?.message || error)}</div>`;
    }
}

function selectPromptFile(node, value) {
    if (node.__bpteDirty && !window.confirm("当前卡片有未保存修改。切换文件会丢弃这些修改，是否继续？")) return;
    const widget = findWidget(node, "prompt_file");
    if (!widget) return;
    node.__bpteDirty = false;
    node.properties ??= {};
    node.properties.bpte_editor_dirty = false;
    widget.value = value;
    widget.callback?.(value);
    closeFilePicker(node);
    setStatus(node, "正在读取所选 JSONL…");
    loadFile(node);
}

async function loadFile(node, { force = false } = {}) {
    if (findWidget(node, "source_mode")?.value !== "jsonl_file") return;
    if (force && node.__bpteDirty && !window.confirm("当前卡片有未保存修改。确定丢弃修改并重新读取磁盘文件吗？")) return;
    const promptFile = String(findWidget(node, "prompt_file")?.value || "").trim();
    if (!promptFile) {
        setStatus(node, "请先填写 JSONL 文件路径", "error");
        return;
    }
    const requestId = (node.__bpteRequestId || 0) + 1;
    node.__bpteRequestId = requestId;
    setStatus(node, "正在读取 JSONL…");
    try {
        const response = await api.fetchApi(PREVIEW_ROUTE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt_file: promptFile }),
            cache: "no-store",
        });
        const data = await response.json();
        if (requestId !== node.__bpteRequestId) return;
        if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
        node.__bpteRecords = data.records.map(normalizeRecord);
        node.__bpteFileSha = data.file_sha256 || "";
        node.__bpteDirty = false;
        node.properties ??= {};
        node.properties.bpte_editor_dirty = false;
        node.properties.bpte_editor_path = promptFile;
        syncEditor(node, { dirty: false });
        renderCards(node);
        setStatus(node, `已读取 ${data.record_count} 组 · ${data.file_name}`, "ok");
    } catch (error) {
        if (requestId !== node.__bpteRequestId) return;
        setStatus(node, `读取失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
}

async function saveFile(node) {
    const promptFile = String(findWidget(node, "prompt_file")?.value || "").trim();
    try {
        const content = validateRecords(node);
        setStatus(node, "正在保存 JSONL…");
        const response = await api.fetchApi(SAVE_ROUTE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt_file: promptFile,
                content,
                expected_sha256: node.__bpteFileSha || "",
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
        node.__bpteFileSha = data.file_sha256 || "";
        node.__bpteDirty = false;
        node.properties ??= {};
        node.properties.bpte_editor_dirty = false;
        syncEditor(node, { dirty: false });
        setStatus(node, `已保存 ${node.__bpteRecords.length} 组 · Queue 使用当前卡片`, "ok");
        updateSummary(node);
    } catch (error) {
        setStatus(node, `保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
}

function createEditor(node) {
    injectStyle();
    const root = document.createElement("div");
    root.className = "bpte-editor";

    const toolbar = document.createElement("div");
    toolbar.className = "bpte-toolbar";
    const title = document.createElement("div");
    title.className = "bpte-title";
    const heading = document.createElement("strong");
    heading.textContent = "JSONL Prompt 卡片";
    const status = document.createElement("span");
    status.className = "bpte-status";
    status.textContent = "等待读取";
    title.append(heading, status);
    const choose = makeButton("选择文件", "bpte-btn", () => openFilePicker(node), "列出插件 prompts 目录和当前文件夹中的 JSONL 文件");
    const reload = makeButton("重新读取", "bpte-btn", () => loadFile(node, { force: true }), "从磁盘重新载入，会替换未保存修改");
    const add = makeButton("添加卡片", "bpte-btn", () => addRecord(node));
    const negativeToggle = makeButton("负面 Prompt · 关", "bpte-btn", () => {
        const widget = findWidget(node, "use_negative");
        if (!widget) return;
        widget.value = !Boolean(widget.value);
        widget.callback?.(widget.value);
    });
    negativeToggle.setAttribute("aria-pressed", "false");
    const save = makeButton("保存 JSONL", "bpte-btn bpte-btn-primary", () => saveFile(node));
    toolbar.append(title, choose, reload, add, negativeToggle, save);

    const picker = document.createElement("section");
    picker.className = "bpte-file-picker";
    picker.dataset.open = "false";
    const pickerHead = document.createElement("div");
    pickerHead.className = "bpte-picker-head";
    const pickerTitle = document.createElement("div");
    pickerTitle.className = "bpte-picker-title";
    const pickerHeading = document.createElement("strong");
    pickerHeading.textContent = "选择 JSONL 文件";
    const pickerHint = document.createElement("span");
    pickerHint.textContent = "插件 prompts 目录；当前绝对路径所在文件夹也会列出";
    pickerTitle.append(pickerHeading, pickerHint);
    const refreshFiles = makeButton("刷新", "bpte-btn", () => openFilePicker(node), "重新读取文件列表");
    const closePicker = makeButton("关闭", "bpte-btn", () => closeFilePicker(node));
    pickerHead.append(pickerTitle, refreshFiles, closePicker);
    const fileList = document.createElement("div");
    fileList.className = "bpte-file-list";
    picker.append(pickerHead, fileList);

    const grid = document.createElement("div");
    grid.className = "bpte-grid";
    const footer = document.createElement("div");
    footer.className = "bpte-footer";
    const state = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = "bpte-dirty-dot";
    state.append(dot, document.createTextNode("黄点表示尚未写入文件"));
    const summary = document.createElement("span");
    footer.append(state, summary);
    root.append(toolbar, grid, footer, picker);

    node.__bpteRoot = root;
    node.__bpteGrid = grid;
    node.__bpteStatus = status;
    node.__bpteSummary = summary;
    node.__bpteDirtyDot = dot;
    node.__bpteSaveButton = save;
    node.__bpteNegativeButton = negativeToggle;
    node.__bpteFilePicker = picker;
    node.__bpteFileList = fileList;

    node.__bpteEditorHeight ??= 430;
    const widget = node.addDOMWidget("bpte_card_editor", "customwidget", root, {
        getMinHeight: () => 320,
        getMaxHeight: () => 1400,
        getHeight: () => node.__bpteEditorHeight,
        hideOnZoom: false,
        serialize: false,
    });
    widget.serialize = false;
    widget.computeSize = (width) => [Math.max(420, width || node.size?.[0] || 680), node.__bpteEditorHeight];
    widget.afterResize = () => { root.style.height = `${node.__bpteEditorHeight}px`; };
    node.__bpteEditorWidget = widget;
    setWidgetVisible(widget, false);
}

function setEditorHeight(node, value) {
    node.__bpteEditorHeight = Math.max(320, Math.min(1400, Math.round(value)));
    if (node.__bpteRoot) node.__bpteRoot.style.height = `${node.__bpteEditorHeight}px`;
}

function fitJsonNodeToContent(node) {
    if (findWidget(node, "source_mode")?.value !== "jsonl_file") return;
    const computed = node.computeSize?.();
    const contentHeight = Number(computed?.[1]);
    if (!Number.isFinite(contentHeight)) return;
    const width = Math.max(700, Number(node.size?.[0] || computed?.[0] || 700));
    node.__bpteProgrammaticResize = true;
    try {
        node.setSize?.([width, contentHeight]);
        node.__bpteLastNodeHeight = contentHeight;
    } finally {
        node.__bpteProgrammaticResize = false;
    }
}

function installResizeHandler(node) {
    if (node.__bpteResizeInstalled) return;
    node.__bpteResizeInstalled = true;
    node.__bpteLastNodeHeight = Number(node.size?.[1] || 0);
    const original = node.onResize;
    node.onResize = function (size) {
        const before = this.__bpteLastNodeHeight;
        const result = original?.apply(this, arguments);
        const after = Number(size?.[1] ?? this.size?.[1] ?? before);
        let fitted = false;
        if (
            !this.__bpteProgrammaticResize &&
            findWidget(this, "source_mode")?.value === "jsonl_file" &&
            Number.isFinite(before) && Number.isFinite(after)
        ) {
            const delta = after - before;
            if (Math.abs(delta) >= 1) {
                setEditorHeight(this, this.__bpteEditorHeight + delta);
                fitJsonNodeToContent(this);
                fitted = true;
            }
        }
        if (!fitted) this.__bpteLastNodeHeight = after;
        return result;
    };
}

function updateSeedUi(node) {
    const widget = findWidget(node, "seed_mode");
    let value = String(widget?.value || "fixed");
    if (value === "random_per_batch" || value.startsWith("random_per_batch｜")) {
        value = "shared_random_per_copy｜按轮随机：同轮卡片共用";
        if (widget) widget.value = value;
    }
    const mode = SEED_MODE_KEYS.find((key) => value === key || value.startsWith(`${key}｜`)) || "fixed";
    if (widget) widget.label = `Seed 模式 · ${SEED_HELP[mode] || mode}`;
    setWidgetVisible(
        findWidget(node, "seed"),
        ["fixed", "increment_per_image", "shared_increment_per_copy"].includes(mode),
    );
}

function updateNegativeUi(node) {
    const enabled = Boolean(findWidget(node, "use_negative")?.value);
    const isJson = findWidget(node, "source_mode")?.value === "jsonl_file";
    const negative = findWidget(node, "negative");
    const previous = node.__bpteNegativeEnabled;
    node.__bpteNegativeEnabled = enabled;

    setWidgetVisible(negative, enabled);
    if (negative && enabled) {
        negative.label = isJson ? "所有卡片共用的负面 Prompt" : LABELS.negative;
        negative.computeSize = (width) => [Math.max(120, width || node.size?.[0] || 520), 96];
        const control = textControl(negative);
        if (control) {
            control.style.height = "82px";
            control.style.minHeight = "82px";
            control.style.maxHeight = "82px";
            control.style.resize = "none";
        }
    }

    const toggle = findWidget(node, "use_negative");
    if (toggle) toggle.label = enabled ? "使用负面 Prompt · 已开启" : "使用负面 Prompt · 已关闭";
    if (node.__bpteNegativeButton) {
        node.__bpteNegativeButton.textContent = enabled ? "负面 Prompt · 开" : "负面 Prompt · 关";
        node.__bpteNegativeButton.setAttribute("aria-pressed", enabled ? "true" : "false");
        node.__bpteNegativeButton.classList.toggle("bpte-btn-primary", enabled);
    }

    if (isJson && previous !== undefined && previous !== enabled) {
        setEditorHeight(node, node.__bpteEditorHeight + (enabled ? -96 : 96));
        requestAnimationFrame(() => fitJsonNodeToContent(node));
    }
    node.graph?.setDirtyCanvas?.(true, true);
}

function applyMode(node, { initial = false } = {}) {
    const isJson = findWidget(node, "source_mode")?.value === "jsonl_file";
    const source = findWidget(node, "source_mode");
    if (source) source.label = isJson ? "输入模式 · JSONL 卡片" : "输入模式 · 手动";

    setWidgetVisible(findWidget(node, "positive"), !isJson);
    setWidgetVisible(findWidget(node, "name"), !isJson);
    setWidgetVisible(findWidget(node, "prompt_file"), isJson);
    setWidgetVisible(findWidget(node, "use_negative"), !isJson);
    setWidgetVisible(findWidget(node, "count"), true);
    setWidgetVisible(findWidget(node, "jsonl_editor"), false);
    setWidgetVisible(node.__bpteEditorWidget, isJson);

    const count = findWidget(node, "count");
    if (count) count.label = isJson ? "每张卡片生成数量 · 1 为单图" : LABELS.count;
    updateSeedUi(node);
    updateNegativeUi(node);

    if (isJson) {
        const editor = String(findWidget(node, "jsonl_editor")?.value || "");
        const path = String(findWidget(node, "prompt_file")?.value || "");
        const keepUnsaved = Boolean(node.properties?.bpte_editor_dirty) &&
            node.properties?.bpte_editor_path === path && editor.trim();
        if (keepUnsaved) {
            try {
                if (!node.__bpteRecords?.length) node.__bpteRecords = parseJsonl(editor);
                node.__bpteDirty = true;
                renderCards(node);
                setStatus(node, "已恢复未保存卡片 · Queue 使用当前内容", "dirty");
            } catch (error) {
                setStatus(node, `工作流内卡片无效：${error instanceof Error ? error.message : String(error)}`, "error");
            }
        } else if (!node.__bpteRecords?.length || node.properties?.bpte_editor_path !== path) {
            loadFile(node);
        } else {
            renderCards(node);
        }
    }

    requestAnimationFrame(() => {
        if (isJson) {
            fitJsonNodeToContent(node);
        } else {
            const width = Math.max(520, node.size?.[0] || 0);
            node.setSize?.([width, Math.max(620, node.size?.[1] || 0)]);
        }
        node.graph?.setDirtyCanvas?.(true, true);
    });
}

function setupNode(node) {
    if (node.__bpteReady) return;
    node.__bpteReady = true;
    for (const [name, label] of Object.entries(LABELS)) {
        const widget = findWidget(node, name);
        if (widget) widget.label = label;
    }
    const positive = textControl(findWidget(node, "positive"));
    const negative = textControl(findWidget(node, "negative"));
    if (positive) positive.placeholder = "输入正面 Prompt…";
    if (negative) negative.placeholder = "可选：输入负面 Prompt…";

    createEditor(node);
    installResizeHandler(node);
    wrapCallback(findWidget(node, "source_mode"), () => applyMode(node));
    wrapCallback(findWidget(node, "seed_mode"), () => updateSeedUi(node));
    wrapCallback(findWidget(node, "use_negative"), () => updateNegativeUi(node));
    wrapCallback(findWidget(node, "count"), () => {
        updateSummary(node);
        if (findWidget(node, "source_mode")?.value === "jsonl_file") renderCards(node);
    });
    let debounceTimer;
    wrapCallback(findWidget(node, "prompt_file"), () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (node.__bpteDirty) {
                setStatus(node, "文件路径已改变 · 点击“重新读取”载入新文件", "dirty");
            } else {
                loadFile(node);
            }
        }, 300);
    });
    applyMode(node, { initial: true });
}

app.registerExtension({
    name: "TE.BatchPrompt.CardEditor.V18",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;
        const originalAfterConfigured = nodeType.prototype.onAfterGraphConfigured;
        nodeType.prototype.onAfterGraphConfigured = function () {
            const result = originalAfterConfigured?.apply(this, arguments);
            setTimeout(() => setupNode(this), 0);
            return result;
        };
    },
    async nodeCreated(node) {
        if (node.comfyClass !== NODE_NAME && node.type !== NODE_NAME) return;
        if (!app.configuringGraph) setupNode(node);
    },
});
