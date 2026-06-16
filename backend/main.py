from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import csv
import re
from pathlib import Path
from typing import Optional

app = FastAPI(title="SRD Data Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent.parent / "data"

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
) -> dict:
    if sub_key:
        canonical_id = f"{unit_id}_{sub_group}_{sub_key}" if unit_id else f"{group_id}_{qid}"
    else:
        canonical_id = f"{unit_id}_{sub_group}" if unit_id and sub_group else f"{group_id}_{qid}"

    if unit_id and sub_group:
        filter_key = f"{unit_id}:{sub_group}"
    elif group_id == "Quality":
        filter_key = "Quality"
    else:
        filter_key = f"{group_id}:col_{i}"

    return {
        "colId": f"col_{i}",
        "index": i,
        "qId": qid,
        "label": label,
        "canonicalLabel": _strip_label(label),
        "importId": iid,
        "groupId": group_id,
        "groupLabel": group_label,
        "unitId": unit_id,
        "subGroup": sub_group,
        "subKey": sub_key,
        "canonicalId": canonical_id,
        "filterKey": filter_key,
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
                }
            sg_map[sg]["colIds"].append(col["colId"])

    ordered = []
    for gid in GROUP_ORDER:
        if gid in groups_map:
            gdata = groups_map.pop(gid)
            sg_list = sorted(
                gdata["subGroups"].values(),
                key=lambda s: SUBGROUP_ORDER.index(s["id"]) if s["id"] in SUBGROUP_ORDER else 99,
            )
            ordered.append({**gdata, "subGroups": sg_list})
    # Append any groups not in GROUP_ORDER
    for gdata in groups_map.values():
        sg_list = list(gdata["subGroups"].values())
        ordered.append({**gdata, "subGroups": sg_list})
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
                col = _make_col(i, qid, label, iid, "Pre-Survey", "Pre-Survey", None, None, None)
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
            col = _make_col(i, qid, label, iid, "Pre-Survey", "Pre-Survey", None, None, None)
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

    # Build unified column set: first occurrence of each canonicalId wins for metadata
    seen_canonical: dict[str, dict] = {}
    for fd in file_data:
        for col in fd["columns"]:
            cid = col["canonicalId"]
            if cid not in seen_canonical:
                seen_canonical[cid] = col

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
