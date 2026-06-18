from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import csv
import re
import sys
import shutil
import threading
import webbrowser
from pathlib import Path
from typing import Optional

app = FastAPI(title="SRD Data Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Path resolution — works both in development and in a PyInstaller bundle
# ---------------------------------------------------------------------------
_FROZEN = getattr(sys, 'frozen', False)

if _FROZEN:
    # Running as a PyInstaller .exe; keep data next to the executable
    BASE_DIR = Path(sys.executable).parent
    _BUNDLE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
else:
    BASE_DIR = Path(__file__).parent.parent
    _BUNDLE_DIR = None

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Static files: bundled under _MEIPASS/static, or the Vite build output in dev
_STATIC_DIR = (_BUNDLE_DIR / "static") if _BUNDLE_DIR else (BASE_DIR / "frontend" / "dist")

QUALTRICS_METADATA = {
    "StartDate", "EndDate", "Status", "IPAddress", "Progress",
    "Duration (in seconds)", "Finished", "RecordedDate", "ResponseId",
    "RecipientLastName", "RecipientFirstName", "RecipientEmail",
    "ExternalReference", "LocationLatitude", "LocationLongitude",
    "DistributionChannel", "UserLanguage",
}

UNIT_LETTERS = list("ABCDEFG")

# Order in which sub-groups appear within each unit block
SUBGROUP_ORDER = [
    "High-Quant", "High-Impression",
    "Low-Quant", "Low-Impression",
    "Mid-Quant", "Mid-Impression",
    "Assertiveness-Rank", "Summary", "Attention-Check", "Other",
]

SUBGROUP_LABELS = {
    "High-Quant": "High – Quantitative",
    "High-Impression": "High – Impression",
    "Low-Quant": "Low – Quantitative",
    "Low-Impression": "Low – Impression",
    "Mid-Quant": "Mid – Quantitative",
    "Mid-Impression": "Mid – Impression",
    "Assertiveness-Rank": "Assertiveness Rank",
    "Summary": "Summary / Comparison",
    "Attention-Check": "Attention Check",
    "Other": "Other",
}

GROUP_ORDER = ["Metadata", "Pre-Survey", "Quality"] + [f"Unit_{u}" for u in UNIT_LETTERS]

# Desired display order for Summary sub-keys within each unit
SUMMARY_KEY_ORDER = ["most-appropriate", "least-appropriate", "best", "worst", "difference"]

# The three sub-groups whose 13 questions are split into construct categories
QUANT_SUBGROUPS = {"High-Quant", "Low-Quant", "Mid-Quant"}

# Maps sub_key position (1–13) within a Quant sub-group to one of 4 construct categories.
# Derived by matching question text against the Likert-item table in the study materials.
QUANT_CATEGORY: dict[str, str] = {
    "1":  "ManipulationCheck",   # The robot sounded assertive
    "2":  "Performance",         # I clearly understood what the robot wanted me to do
    "3":  "Preference",          # I like the way the robot communicated
    "4":  "Affect",              # I would trust the robot's guidance
    "5":  "Performance",         # I would follow the robot's instructions
    "6":  "ManipulationCheck",   # The robot sounded polite
    "7":  "Preference",          # Communication style was appropriate for this situation
    "8":  "Performance",         # I felt confident about what action to take
    "9":  "Affect",              # The robot seemed competent
    "10": "Affect",              # This instruction would make me feel safer
    "11": "ManipulationCheck",   # The robot sounded controlling or pushy
    "12": "Performance",         # Understanding this instruction required mental effort
    "13": "ManipulationCheck",   # The robot sounded confident
}

CATEGORY_LABELS: dict[str, str] = {
    "ManipulationCheck": "Manipulation Check",
    "Performance":       "Performance",
    "Affect":            "Affect / Social Perception",
    "Preference":        "Preference",
}

CATEGORY_ORDER = ["ManipulationCheck", "Performance", "Affect", "Preference"]

# User response scale: 1=Low, 2=Mid, 3=High
_LEVEL_TO_NUM: dict[str, int] = {"H": 3, "M": 2, "L": 1}
_NUM_TO_LEVEL: dict[int, str] = {v: k for k, v in _LEVEL_TO_NUM.items()}


def _load_assertiveness_ranks() -> dict[str, dict[str, tuple[str, int]]]:
    """Parse 'Evaluation Unit Assertiveness Ranks.txt'.
    Returns {unit: {clip_index_str: (level, expected_numeric_response)}}
    e.g. {"F": {"1": ("H", 3), "2": ("L", 1), "3": ("M", 2)}}
    """
    txt = DATA_DIR.parent / "Evaluation Unit Assertiveness Ranks.txt"
    result: dict[str, dict[str, tuple[str, int]]] = {}
    if not txt.exists():
        return result
    with open(txt, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^([A-G])\s*[：:]\s*(.+)$", line)
            if not m:
                continue
            unit = m.group(1).upper()
            ranks: dict[str, tuple[str, int]] = {}
            for item in re.finditer(r"(\d)([HML])", m.group(2)):
                idx, level = item.group(1), item.group(2).upper()
                ranks[idx] = (level, _LEVEL_TO_NUM[level])
            result[unit] = ranks
    return result


_ASSERTIVENESS_RANKS = _load_assertiveness_ranks()

# Maps Spring2026 Q IDs to the canonical column names used in Summer/Prolific CSVs
_SPRING_PRESURVEY_CANONICAL: dict[str, str] = {
    "Q1": "English Proficiency",
    "Q2": "Age",
    "Q3": "Gender",
    "Q4": "Perceptual Ability",
    "Q68": "Audio check",
    "Q70": "Open feedback",
}

# Spring2026 format: each scenario block has 50 questions in a fixed order.
# Maps position_in_block → (sub_group, sub_key)
_SPRING_BLOCK_MAP: list[tuple[str, Optional[str]]] = []
for _n in range(13):
    _SPRING_BLOCK_MAP.append(("High-Quant", str(_n + 1)))
_SPRING_BLOCK_MAP.append(("High-Impression", None))
for _n in range(13):
    _SPRING_BLOCK_MAP.append(("Low-Quant", str(_n + 1)))
_SPRING_BLOCK_MAP.append(("Low-Impression", None))
for _n in range(13):
    _SPRING_BLOCK_MAP.append(("Mid-Quant", str(_n + 1)))
_SPRING_BLOCK_MAP.append(("Mid-Impression", None))
for _n in range(3):
    _SPRING_BLOCK_MAP.append(("Assertiveness-Rank", str(_n + 1)))
_SPRING_BLOCK_MAP.append(("Summary", "most-appropriate"))
_SPRING_BLOCK_MAP.append(("Summary", "best"))
_SPRING_BLOCK_MAP.append(("Summary", "least-appropriate"))
_SPRING_BLOCK_MAP.append(("Summary", "worst"))
_SPRING_BLOCK_MAP.append(("Summary", "difference"))
# Total: 50 entries


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _platform_from_filename(filename: str) -> str:
    return "Prolific" if "prolific" in filename.lower() else "Sona"


def _detect_format(q_ids: list[str]) -> str:
    """Return 'new' (A-prefix) or 'spring' (repeated Q IDs)."""
    for qid in q_ids:
        if re.match(r"^[A-G][\s-]", qid, re.IGNORECASE):
            return "new"
    return "spring"


def _parse_new_format_qid(qid: str) -> Optional[tuple[str, str, Optional[str]]]:
    """
    Parse a new-format Q ID into (unit, sub_group, sub_key).
    Returns None if the column is not a unit column.
    """
    qid = qid.strip()

    # Attention check: "A - Attention Check" or "C- Attention Check"
    m = re.match(r"^([A-G])\s*-\s*Attention\s+Check$", qid, re.IGNORECASE)
    if m:
        return m.group(1).upper(), "Attention-Check", None

    # Standard unit prefix: "{Unit}-{rest}"
    m = re.match(r"^([A-G])-(.+)$", qid, re.IGNORECASE)
    if not m:
        return None
    unit = m.group(1).upper()
    rest = m.group(2).strip()

    m2 = re.match(r"^(High|Low|Mid)-Quant_(\d+)$", rest, re.IGNORECASE)
    if m2:
        return unit, f"{m2.group(1).capitalize()}-Quant", m2.group(2)

    m2 = re.match(r"^(High|Low|Mid)-Impression$", rest, re.IGNORECASE)
    if m2:
        return unit, f"{m2.group(1).capitalize()}-Impression", None

    m2 = re.match(r"^(?:Assertiveness-Rank|rank-assertiveness)_(\d+)$", rest, re.IGNORECASE)
    if m2:
        return unit, "Assertiveness-Rank", m2.group(1)

    if re.match(r"^most-appropriate$", rest, re.IGNORECASE):
        return unit, "Summary", "most-appropriate"
    if re.match(r"^best\b", rest, re.IGNORECASE):
        return unit, "Summary", "best"
    if re.match(r"^least-appropriate$", rest, re.IGNORECASE):
        return unit, "Summary", "least-appropriate"
    if re.match(r"^worst\b", rest, re.IGNORECASE):
        return unit, "Summary", "worst"
    if re.match(r"^difference\b", rest, re.IGNORECASE):
        return unit, "Summary", "difference"

    return unit, "Other", rest


def _strip_label(label: str) -> str:
    """Remove unit/format prefixes and embedded HTML from question labels."""
    # Remove "A-High-Quant - " style prefixes
    cleaned = re.sub(r"^[A-G]-[\w-]+\s*-\s*", "", label, flags=re.IGNORECASE)
    # Remove "Click to write the question text - " from Spring format
    cleaned = re.sub(r"^Click to write the question text\s*-\s*", "", cleaned, flags=re.IGNORECASE)
    # Remove embedded HTML (audio player tags in Spring ranking labels)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    return cleaned.strip() or label


def _make_col(
    i: int,
    qid: str,
    label: str,
    iid: str,
    group_id: str,
    group_label: str,
    unit_id: Optional[str],
    sub_group: Optional[str],
    sub_key: Optional[str],
    canonical_name: Optional[str] = None,
) -> dict:
    name = canonical_name if canonical_name else qid
    if sub_key:
        canonical_id = f"{unit_id}_{sub_group}_{sub_key}" if unit_id else f"{group_id}_{name}"
    else:
        canonical_id = f"{unit_id}_{sub_group}" if unit_id and sub_group else f"{group_id}_{name}"

    # Construct category — only applies to the 13 Quant questions per condition
    category: Optional[str] = None
    if unit_id and sub_group in QUANT_SUBGROUPS and sub_key and sub_key.isdigit():
        category = QUANT_CATEGORY.get(sub_key)

    if unit_id and sub_group:
        filter_key = f"{unit_id}:{sub_group}:{category}" if category else f"{unit_id}:{sub_group}"
    elif group_id == "Quality":
        filter_key = "Quality"
    elif canonical_name:
        filter_key = f"{group_id}:{canonical_name}"
    else:
        filter_key = f"{group_id}:col_{i}"

    # Short display label for column headers (question label, not full question text).
    # New-format files use descriptive Q IDs (e.g. "A-best(1H2L3M)") — preserve as-is.
    # Spring-format unit columns get a reconstructed canonical label.
    # Pre-survey/metadata/quality use canonical_name or qid.
    if unit_id and sub_group:
        if re.match(r"^[A-G][\s-]", qid, re.IGNORECASE):
            display_label = qid  # new format: keeps parenthetical info like (1H2L3M)
        elif sub_group == "Summary" and sub_key:
            display_label = f"{unit_id}-{sub_key}"
        elif sub_key:
            display_label = f"{unit_id}-{sub_group}_{sub_key}"
        else:
            display_label = f"{unit_id}-{sub_group}"
    elif canonical_name:
        display_label = canonical_name
    else:
        display_label = qid

    # Assertiveness-Rank expected answer (from the lookup file)
    expected_level: Optional[str] = None
    expected_value: Optional[int] = None
    if unit_id and sub_group == "Assertiveness-Rank" and sub_key:
        rank_info = _ASSERTIVENESS_RANKS.get(unit_id, {}).get(sub_key)
        if rank_info:
            expected_level, expected_value = rank_info

    return {
        "colId": f"col_{i}",
        "index": i,
        "qId": qid,
        "label": label,
        "canonicalLabel": _strip_label(label),
        "displayLabel": display_label,
        "importId": iid,
        "groupId": group_id,
        "groupLabel": group_label,
        "unitId": unit_id,
        "subGroup": sub_group,
        "subKey": sub_key,
        "category": category,
        "canonicalId": canonical_id,
        "filterKey": filter_key,
        "expectedLevel": expected_level,
        "expectedValue": expected_value,
    }


def _groups_from_columns(columns: list[dict]) -> list[dict]:
    """Build the questionGroups structure from a flat column list."""
    groups_map: dict[str, dict] = {}
    for col in columns:
        gid = col["groupId"]
        if gid not in groups_map:
            groups_map[gid] = {
                "id": gid,
                "label": col["groupLabel"],
                "colIds": [],
                "unitId": col.get("unitId"),
                "subGroups": {},
            }
        groups_map[gid]["colIds"].append(col["colId"])
        sg = col.get("subGroup")
        if sg:
            sg_map = groups_map[gid]["subGroups"]
            if sg not in sg_map:
                sg_map[sg] = {
                    "id": sg,
                    "label": SUBGROUP_LABELS.get(sg, sg),
                    "colIds": [],
                    "_categories": {},
                }
            sg_map[sg]["colIds"].append(col["colId"])
            # Collect construct categories within Quant sub-groups
            cat = col.get("category")
            if cat:
                cat_map = sg_map[sg]["_categories"]
                if cat not in cat_map:
                    cat_map[cat] = {
                        "id": cat,
                        "label": CATEGORY_LABELS.get(cat, cat),
                        "colIds": [],
                    }
                cat_map[cat]["colIds"].append(col["colId"])

    def _finalize_sg_list(sg_raw_map: dict) -> list[dict]:
        sg_list = sorted(
            sg_raw_map.values(),
            key=lambda s: SUBGROUP_ORDER.index(s["id"]) if s["id"] in SUBGROUP_ORDER else 99,
        )
        result = []
        for sg in sg_list:
            cats = sg.pop("_categories", {})
            entry = dict(sg)
            if cats:
                entry["categories"] = [cats[c] for c in CATEGORY_ORDER if c in cats]
            result.append(entry)
        return result

    ordered = []
    for gid in GROUP_ORDER:
        if gid in groups_map:
            gdata = groups_map.pop(gid)
            ordered.append({**gdata, "subGroups": _finalize_sg_list(gdata["subGroups"])})
    for gdata in groups_map.values():
        ordered.append({**gdata, "subGroups": _finalize_sg_list(gdata["subGroups"])})
    return ordered


# ---------------------------------------------------------------------------
# Column building per format
# ---------------------------------------------------------------------------

def _build_columns_new(q_ids, labels, import_ids) -> list[dict]:
    columns = []
    for i, (qid, label, iid) in enumerate(zip(q_ids, labels, import_ids)):
        if qid in QUALTRICS_METADATA:
            col = _make_col(i, qid, label, iid, "Metadata", "Metadata", None, None, None)
        elif qid.startswith("Q_") or qid == "id":
            col = _make_col(i, qid, label, iid, "Quality", "Quality Metrics", None, None, None)
        else:
            parsed = _parse_new_format_qid(qid)
            if parsed:
                unit_id, sub_group, sub_key = parsed
                col = _make_col(
                    i, qid, label, iid,
                    f"Unit_{unit_id}", f"Evaluation Unit {unit_id}",
                    unit_id, sub_group, sub_key,
                )
            else:
                # qid is already a descriptive name in the new format (e.g. "Gender")
                col = _make_col(i, qid, label, iid, "Pre-Survey", "Pre-Survey", None, None, None, canonical_name=qid)
        columns.append(col)
    return columns


def _build_columns_spring(q_ids, labels, import_ids) -> list[dict]:
    total_counts: dict[str, int] = {}
    for qid in q_ids:
        total_counts[qid] = total_counts.get(qid, 0) + 1

    occurrence: dict[str, int] = {}
    block_pos: dict[int, int] = {}
    columns = []

    for i, (qid, label, iid) in enumerate(zip(q_ids, labels, import_ids)):
        occurrence[qid] = occurrence.get(qid, 0) + 1
        n = occurrence[qid]

        if qid in QUALTRICS_METADATA:
            col = _make_col(i, qid, label, iid, "Metadata", "Metadata", None, None, None)
        elif qid.startswith("Q_") or qid == "id":
            col = _make_col(i, qid, label, iid, "Quality", "Quality Metrics", None, None, None)
        elif total_counts[qid] > 1:
            unit_id = UNIT_LETTERS[n - 1] if n <= len(UNIT_LETTERS) else f"U{n}"
            block_pos.setdefault(n, 0)
            pos = block_pos[n]
            block_pos[n] += 1
            if pos < len(_SPRING_BLOCK_MAP):
                sub_group, sub_key = _SPRING_BLOCK_MAP[pos]
            else:
                sub_group, sub_key = "Other", str(pos)
            col = _make_col(
                i, qid, label, iid,
                f"Unit_{unit_id}", f"Evaluation Unit {unit_id}",
                unit_id, sub_group, sub_key,
            )
        else:
            canonical_name = _SPRING_PRESURVEY_CANONICAL.get(qid)
            col = _make_col(i, qid, label, iid, "Pre-Survey", "Pre-Survey", None, None, None, canonical_name=canonical_name)
        columns.append(col)
    return columns


def _build_columns(q_ids, labels, import_ids):
    fmt = _detect_format(q_ids)
    columns = _build_columns_new(q_ids, labels, import_ids) if fmt == "new" else _build_columns_spring(q_ids, labels, import_ids)
    return columns, _groups_from_columns(columns)


# ---------------------------------------------------------------------------
# Sort key for unified column ordering
# ---------------------------------------------------------------------------

def _col_sort_key(col: dict) -> tuple:
    gid = col["groupId"]
    try:
        g_rank = GROUP_ORDER.index(gid)
    except ValueError:
        g_rank = len(GROUP_ORDER)

    if gid.startswith("Unit_"):
        sg = col.get("subGroup") or ""
        sk = col.get("subKey") or ""
        try:
            sg_rank = SUBGROUP_ORDER.index(sg)
        except ValueError:
            sg_rank = len(SUBGROUP_ORDER)
        if sg == "Summary":
            try:
                sk_rank = SUMMARY_KEY_ORDER.index(sk)
            except ValueError:
                sk_rank = len(SUMMARY_KEY_ORDER)
            return (g_rank, sg_rank, sk_rank, sk)
        key_num = int(sk) if sk.isdigit() else 0
        return (g_rank, sg_rank, key_num, sk)

    return (g_rank, 0, 0, col.get("qId", ""))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/files")
def list_files():
    if not DATA_DIR.exists():
        return {"files": []}
    return {"files": sorted(f.name for f in DATA_DIR.glob("*.csv"))}


@app.get("/api/data/combined")
def get_combined_data(files: str = ""):
    filenames = [f.strip() for f in files.split(",") if f.strip()]
    if not filenames:
        raise HTTPException(status_code=400, detail="No files specified")

    file_data = []
    for filename in filenames:
        safe_name = Path(filename).name
        filepath = DATA_DIR / safe_name
        if not filepath.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        try:
            with open(filepath, encoding="utf-8-sig", newline="") as f:
                all_rows = list(csv.reader(f))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read {filename}: {e}")
        if len(all_rows) < 3:
            raise HTTPException(status_code=400, detail=f"{filename} is not a valid Qualtrics CSV")

        cols, _ = _build_columns(all_rows[0], all_rows[1], all_rows[2])
        file_data.append({
            "filename": filename,
            "platform": _platform_from_filename(filename),
            "columns": cols,
            "rows": all_rows[3:],
        })

    # Build unified column set: first occurrence wins, but prefer new-format displayLabels
    # for unit columns (they carry parenthetical study info like "(1H2L3M)" that Spring lacks).
    seen_canonical: dict[str, dict] = {}
    for fd in file_data:
        for col in fd["columns"]:
            cid = col["canonicalId"]
            if cid not in seen_canonical:
                seen_canonical[cid] = col
            elif col.get("unitId") and re.match(r"^[A-G][\s-]", col.get("qId", ""), re.IGNORECASE):
                existing = seen_canonical[cid]
                if not re.match(r"^[A-G][\s-]", existing.get("qId", ""), re.IGNORECASE):
                    seen_canonical[cid] = {**existing, "displayLabel": col["displayLabel"]}

    unified_cols = sorted(seen_canonical.values(), key=_col_sort_key)

    # Reassign stable colId/index for the unified list
    for idx, col in enumerate(unified_cols):
        col = dict(col)
        col["colId"] = f"col_{idx}"
        col["index"] = idx
        unified_cols[idx] = col

    cid_to_idx = {col["canonicalId"]: col["index"] for col in unified_cols}
    n_unified = len(unified_cols)

    combined_rows: list[list[str]] = []
    row_meta: list[dict] = []
    sources: list[dict] = []

    for fd in file_data:
        mapping = {col["index"]: cid_to_idx[col["canonicalId"]] for col in fd["columns"] if col["canonicalId"] in cid_to_idx}
        for row in fd["rows"]:
            unified_row = [""] * n_unified
            for orig_idx, val in enumerate(row):
                dest = mapping.get(orig_idx)
                if dest is not None:
                    unified_row[dest] = val
            combined_rows.append(unified_row)
            row_meta.append({"source": fd["filename"], "platform": fd["platform"]})
        sources.append({"filename": fd["filename"], "platform": fd["platform"], "rowCount": len(fd["rows"])})

    return {
        "columns": unified_cols,
        "rows": combined_rows,
        "rowMeta": row_meta,
        "questionGroups": _groups_from_columns(unified_cols),
        "totalRows": len(combined_rows),
        "sources": sources,
    }


@app.get("/api/data/{filename}")
def get_csv_data(filename: str):
    safe_name = Path(filename).name
    filepath = DATA_DIR / safe_name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(filepath, encoding="utf-8-sig", newline="") as f:
            all_rows = list(csv.reader(f))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")
    if len(all_rows) < 3:
        raise HTTPException(status_code=400, detail="Expected Qualtrics CSV with at least 3 header rows")

    columns, question_groups = _build_columns(all_rows[0], all_rows[1], all_rows[2])
    platform = _platform_from_filename(filename)
    data_rows = all_rows[3:]

    return {
        "columns": columns,
        "rows": data_rows,
        "rowMeta": [{"source": filename, "platform": platform}] * len(data_rows),
        "questionGroups": question_groups,
        "totalRows": len(data_rows),
        "sources": [{"filename": filename, "platform": platform, "rowCount": len(data_rows)}],
    }


@app.post("/api/upload")
async def upload_csv(request: Request, filename: str = "upload.csv"):
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    safe_name = Path(filename).name
    (DATA_DIR / safe_name).write_bytes(await request.body())
    return {"filename": safe_name}


# ---------------------------------------------------------------------------
# Static file serving (Vite build / bundled mode)
# ---------------------------------------------------------------------------
if _STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="static")


# ---------------------------------------------------------------------------
# Entry point — used when running as a PyInstaller bundle or directly
# ---------------------------------------------------------------------------
_PORT = 8765


if __name__ == "__main__":
    import socket
    import uvicorn

    # If another instance is already running, just open the browser and exit
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as _sock:
        if _sock.connect_ex(("127.0.0.1", _PORT)) == 0:
            webbrowser.open(f"http://127.0.0.1:{_PORT}")
            sys.exit(0)

    if _FROZEN:
        # CSV files dragged onto the .exe are passed as command-line arguments
        for arg in sys.argv[1:]:
            p = Path(arg)
            if p.exists() and p.suffix.lower() == ".csv":
                shutil.copy2(p, DATA_DIR / p.name)

        # Open the browser once the server is up
        def _open_browser() -> None:
            import time
            time.sleep(1.5)
            webbrowser.open(f"http://127.0.0.1:{_PORT}")

        threading.Thread(target=_open_browser, daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=_PORT, log_level="warning")
