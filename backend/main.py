from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import csv
from pathlib import Path

app = FastAPI(title="SRD Data Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/api/files")
def list_files():
    if not DATA_DIR.exists():
        return {"files": []}
    return {"files": sorted(f.name for f in DATA_DIR.glob("*.csv"))}


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
        raise HTTPException(
            status_code=400,
            detail="Expected Qualtrics CSV with at least 3 header rows",
        )

    q_ids = all_rows[0]
    labels = all_rows[1]
    import_ids = all_rows[2]
    data_rows = all_rows[3:]

    columns, question_groups = _build_columns(q_ids, labels, import_ids)

    return {
        "columns": columns,
        "rows": data_rows,
        "questionGroups": question_groups,
        "totalRows": len(data_rows),
    }


def _build_columns(q_ids, labels, import_ids):
    # Count how many times each Q ID appears to detect repeating scenario blocks
    total_counts: dict[str, int] = {}
    for qid in q_ids:
        total_counts[qid] = total_counts.get(qid, 0) + 1

    occurrence: dict[str, int] = {}
    columns = []
    groups_ordered: dict[str, dict] = {}

    for i, (qid, label, iid) in enumerate(zip(q_ids, labels, import_ids)):
        occurrence[qid] = occurrence.get(qid, 0) + 1
        n = occurrence[qid]

        if qid in QUALTRICS_METADATA:
            group_id = "Metadata"
            group_label = "Metadata"
        elif qid.startswith("Q_") or qid == "id":
            group_id = "Quality"
            group_label = "Quality Metrics"
        elif total_counts[qid] > 1:
            group_id = f"Scenario_{n}"
            group_label = f"Scenario {n}"
        else:
            group_id = "Pre-Survey"
            group_label = "Pre-Survey"

        col = {
            "colId": f"col_{i}",
            "index": i,
            "qId": qid,
            "label": label,
            "importId": iid,
            "groupId": group_id,
        }
        columns.append(col)

        if group_id not in groups_ordered:
            groups_ordered[group_id] = {
                "id": group_id,
                "label": group_label,
                "colIds": [],
            }
        groups_ordered[group_id]["colIds"].append(col["colId"])

    return columns, list(groups_ordered.values())
