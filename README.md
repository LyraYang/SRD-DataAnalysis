# SRD Data Analysis

Browser-based viewer for Qualtrics CSV exports from the SRD study. Supports Sona and Prolific formats, Spring 2026 and Summer formats.

---

## Development

```bash
# Terminal 1 — backend
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8001

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. Place CSV files in `data/`.

## Distributable build

```bash
pip install pyinstaller
cd frontend && npm install && cd ..
python build_dist.py
```

Output: `dist/DataAnalysis/`. Zip and share. Recipients double-click `DataAnalysis.exe` — no Python or Node required.

---

## Panels

Use **+ Add Panel** to open panels side-by-side or stacked. Two types available:

| Panel | Purpose |
|-------|---------|
| **CSV Viewer** | Browse, filter, sort, and export raw responses |
| **Summary** | Validity counts, unit distribution, demographics |

---

## CSV Viewer

**Loading data** — select files from the header dropdown (multiple files merge into one unified layout). Drag and drop CSVs onto the window to upload. Use the **+** button beside the dropdown to pick files from disk. The **✕** button beside each file in the dropdown deletes it.

**Columns** — the left sidebar groups columns by Metadata, Pre-Survey, and Units A–G. Quant sub-groups expand into construct categories (Manipulation Check, Performance, Affect, Preference). Use the search box or All/None buttons to filter.

**Filtering & sorting** — click **▾** on any column header to filter by value; click the header label to sort. Clear all value filters with the orange "✕ N filters" button.

**Validity** — every row is flagged 🟢 / 🟡 / 🔴:

| Colour | Condition |
|--------|-----------|
| 🟢 Green | No critical issues; fewer than 5 partial issues |
| 🟡 Yellow | No critical issues; 5 or more partial issues |
| 🔴 Red | Any critical issue |

**Critical issues:**
- Straight-lining all three assertiveness levels (High + Low + Mid) within a unit (all 13 answers identical)
- Any open-text field contains only the word "test"
- No quantitative responses filled in any unit
- Audio check not answered or wrong — expected `8803`; spaces and separators (` - _ . ,`) are stripped before comparing, so `88 03` and `88-03` both pass

**Partial issues:**
- Straight-lining only some (not all) assertiveness levels within a unit
- Attention check answered incorrectly (blank is ignored). Correct answers per unit:

  | Unit | A | B | C | D | E | F | G |
  |------|---|---|---|---|---|---|---|
  | Answer | Paris | Apple | Dog | Yellow | Flower | 12 | 4 |

- Duration below 15 minutes (note shows actual time, e.g. `Short duration: 8m 32s`)
- Contradictory scale ratings within a condition. Conflict = item A rated ≤ 2 **and** item B rated ≥ 4 (Likert: 1 Strongly Disagree → 5 Strongly Agree). Checked pairs:

  | Pair | Conflict means… |
  |------|-----------------|
  | Clarity (Q2) ↔ Confidence (Q8) | Didn't understand the instruction but felt confident about the action |
  | Clarity (Q2) ↔ Appropriateness (Q7) | Didn't understand but found the style appropriate |
  | Trust (Q4) ↔ Compliance (Q5) | Wouldn't trust the robot but would follow its instructions |
  | Competence (Q9) ↔ Trust (Q4) | Robot seemed incompetent but they trusted it |
  | Safety (Q10) ↔ Compliance (Q5) | Instruction didn't feel safe but they'd follow it |
  | Safety (Q10) ↔ Trust (Q4) | Instruction didn't feel safe but they trusted the robot |

  Cross-checks run independently for each assertiveness level (High / Low / Mid) within every unit. Notes include question text and ratings, e.g. `Unit A High: Clarity↔Confidence (2↔4)`.

  *Likert normalisation:* text responses are mapped to numbers (the label "Disagree" is treated as 2 / Somewhat Disagree due to a known survey mislabelling).

Toggle **Hide invalid** to remove red rows. Toggle **Notes** to show/hide the per-row issue column.

**Display** — **Wrap** toggle for text wrapping. Duration shown as H:MM:SS. Assertiveness Rank cells highlighted green/red vs expected answer. Summary sub-columns order: Most Appropriate → Best → Least Appropriate → Worst → Difference.

**Export** — downloads visible, filtered, sorted data as Excel.

---

## Summary Panel

Select files the same way as CSV Viewer. Four sections:

1. **Response Validity** — counts and % of valid / partial valid / invalid responses.
2. **Unit Distribution** — how many responses (all) contain data for each unit A–G.
3. **Demographics** (valid + partial only) — gender, age groups (<20, 20–29, 30–39, 40–49, 50+), English proficiency, perceptual ability. Each bar shows its own n; missing responses shown as "Not answered." Columns auto-detected by keyword from Pre-Survey group.
4. **Valid Responses Per Unit** — same as section 2 but restricted to valid + partial valid rows.

---

## 中文说明

### 构建与运行

**开发模式：**
```bash
# 后端
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8001

# 前端（另开终端）
cd frontend && npm install && npm run dev
```
打开 `http://localhost:5173`，将 CSV 文件放入项目根目录下的 `data/` 文件夹。

**打包分发（供他人直接使用）：**
```bash
pip install pyinstaller
cd frontend && npm install && cd ..
python build_dist.py
```
生成 `dist/DataAnalysis/` 文件夹，压缩后发给他人。对方双击 `DataAnalysis.exe` 即可使用，无需安装 Python 或 Node。

### 主要功能

- **多文件合并查看**：从下拉框选择一或多个 CSV 文件，数据自动合并为统一列布局；支持拖拽上传，也可点击 **+** 按钮从本地选择文件添加；点击文件旁的 **✕** 可删除。

- **灵活筛选与排序**：左侧侧边栏按组（元数据、前测、各评估单元 A–G）管理列的显示与隐藏；点击列头可排序；点击 **▾** 按钮可按值筛选。

- **数据有效性标注**：每行自动标注 🟢 有效 / 🟡 部分有效 / 🔴 无效。
  - **严重问题（红色）**：同一单元三个断言级别（High/Low/Mid）全部 straight-line（13 题答案完全相同）· 开放文本仅填"test" · 所有单元均无定量作答 · 音频检查未作答或答案有误（正确答案 8803，比较前自动去除空格与分隔符）。
  - **部分问题（≥5 条变黄）**：仅部分断言级别 straight-line · 注意力检查答错（空白忽略，各单元正确答案：A=Paris、B=Apple、C=Dog、D=Yellow、E=Flower、F=12、G=4）· 作答时长不足 15 分钟 · 同一条件内量表评分矛盾（某题 ≤ 2 而另一题 ≥ 4，具体检查对如下）：
    - 清晰度（Q2）↔ 信心（Q8）：听不懂指令却很有把握
    - 清晰度（Q2）↔ 适切性（Q7）：听不懂却觉得表达方式恰当
    - 信任（Q4）↔ 服从（Q5）：不信任机器人却会遵从指令
    - 能力（Q9）↔ 信任（Q4）：觉得机器人不称职却信任它
    - 安全感（Q10）↔ 服从（Q5）：觉得不安全却会照做
    - 安全感（Q10）↔ 信任（Q4）：觉得不安全却信任机器人
  - 量表归一化：文字选项映射为数字（1=强烈不同意…5=强烈同意），已知误标"Disagree"统一视为 2。

- **汇总面板**：统计有效/部分有效/无效人数，展示各评估单元的作答分布，以及有效作答者的人口统计信息（性别、年龄段、英语水平、感知能力）。

- **导出**：将当前可见、已筛选、已排序的数据导出为 Excel 文件。
