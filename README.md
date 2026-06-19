# SRD Data Analysis

A browser-based viewer for Qualtrics CSV exports from the SRD study.
Supports both Sona and Prolific formats, and Spring 2026 / Summer formats.

---

## Building

### Web version (development)

```bash
# Terminal 1 — backend
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Place CSV files in the `data/` folder at the project root.

---

### Local distributable (share with others)

**One-time setup:**
```bash
pip install pyinstaller
cd frontend && npm install && cd ..
```

**Build:**
```bash
python build_dist.py
```

Output is `dist/DataAnalysis/`. Zip that folder and distribute it.

Recipients double-click `DataAnalysis.exe` — a browser window opens automatically at `http://127.0.0.1:8765`.
No Python, Node.js, or other software required on their machine.

---

## Features

### Loading data
- **Select files** from the dropdown in the header bar. Multiple files can be selected simultaneously and their rows are merged into a unified column layout.
- **Drag and drop** one or more CSV files onto the app window to upload them instantly (local version) or add them to the `data/` folder (web version). The file list refreshes automatically.
- The platform (Sona / Prolific) is detected from the filename and shown as a colored badge. A thin stripe on each row indicates which source it came from when multiple files are loaded.

### Column visibility
- The **filter sidebar** on the left organises columns by group (Metadata, Pre-Survey, Unit A–G). Click the arrow next to any group to expand it.
- Quant sub-groups (High / Low / Mid) expand further into four **construct categories**: Manipulation Check, Performance, Affect / Social Perception, Preference. Toggle individual categories on or off.
- Use the **search box** at the top of the sidebar to find columns by label or question ID.
- **All / None** buttons toggle all columns at once.

### Filtering and sorting
- Click the **▾ button** on any column header to filter by specific values. Multiple value filters can be active simultaneously; click the orange "✕ N filters" button in the header bar to clear all.
- Click a **column header** to sort ascending; click again for descending; a third click clears the sort.
- The row count in the header bar updates to reflect active filters.

### Validity indicator
Every row has a **coloured dot** and a **Notes** column that flag data quality issues:

| Colour | Meaning |
|--------|---------|
| 🟢 Green | No critical issues; fewer than 3 partial issues |
| 🟡 Yellow | No critical issues; 3–5 partial issues |
| 🔴 Red | Any critical issue, or more than 5 partial issues |

**Critical issues (always red):**
- All 13 quantitative answers in a condition are identical (straight-lining)
- Any open-text field contains only the word "test"
- No quantitative responses filled in any unit

**Partial issues:**
- Attention check answered incorrectly (blank is ignored)
- Audio check answered but value ≠ 8803
- Contradictory scale responses within a condition, e.g. Clarity ≤ 2 but Decision Confidence ≥ 4

Green rows with 1–2 partial issues still show those notes in muted grey so they are visible without raising alarm.

**Hide invalid** checkbox (header bar) — removes all red rows from the table. The header shows a green count of remaining valid rows, e.g. *142 valid · 200 rows*.

### Display options
- **Wrap** toggle: wraps cell text so long responses are fully readable. When off, virtual scrolling is used for performance on large datasets.
- **Duration** columns (e.g. "Duration (in seconds)") automatically show a converted `H:MM:SS` value next to the raw seconds.
- **Assertiveness Rank** columns are highlighted green (correct) or red (incorrect) based on the expected answer from `Evaluation Unit Assertiveness Ranks.txt`.

### Export
Click **Export** in the header bar to download the currently visible, filtered, and sorted data as an Excel file. Only visible columns and filtered rows are included.
