#!/usr/bin/env python3
"""
Build a distributable DataAnalysis bundle.

Usage:
    python build_dist.py

Requirements (install once):
    pip install pyinstaller
    cd frontend && npm install

Output:
    dist/DataAnalysis/          ← zip this folder to distribute
      DataAnalysis.exe
      data/                     ← recipients put their CSV files here
      Evaluation Unit Assertiveness Ranks.txt
      Evaluation Unit Appropriateness.txt
"""

import subprocess
import sys
import shutil
from pathlib import Path

ROOT    = Path(__file__).parent
FRONTEND = ROOT / "frontend"
DIST_APP = ROOT / "dist" / "DataAnalysis"


def run(cmd: list, cwd: Path | None = None) -> None:
    print("  $", " ".join(str(c) for c in cmd))
    # shell=True is required on Windows so .cmd wrappers (npm, npx) are found
    subprocess.run(cmd, cwd=cwd, check=True, shell=(sys.platform == "win32"))


def check_prereqs() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("ERROR: PyInstaller not found. Run: pip install pyinstaller")
    if not (FRONTEND / "node_modules").exists():
        sys.exit("ERROR: node_modules missing. Run: cd frontend && npm install")


def main() -> None:
    check_prereqs()

    # ── 1. Frontend build ──────────────────────────────────────────────────
    print("\n=== [1/3] Building frontend ===")
    run(["npm", "run", "build"], cwd=FRONTEND)

    # ── 2. PyInstaller ────────────────────────────────────────────────────
    print("\n=== [2/3] Running PyInstaller ===")
    if (ROOT / "build").exists():
        shutil.rmtree(ROOT / "build")
    if DIST_APP.exists():
        shutil.rmtree(DIST_APP)
    run([sys.executable, "-m", "PyInstaller", "--clean", "DataAnalysis.spec"], cwd=ROOT)

    # ── 3. Copy resource files and create data folder ──────────────────────
    print("\n=== [3/3] Finalising bundle ===")

    for txt in ROOT.glob("Evaluation Unit *.txt"):
        shutil.copy2(txt, DIST_APP / txt.name)
        print(f"  Copied {txt.name}")

    (DIST_APP / "data").mkdir(exist_ok=True)
    print("  Created data/ folder")

    size_mb = sum(f.stat().st_size for f in DIST_APP.rglob("*") if f.is_file()) / 1_048_576
    print(f"\n=== Done! ({size_mb:.0f} MB) ===")
    print(f"  Bundle: {DIST_APP}")
    print("  Zip 'dist/DataAnalysis/' to distribute.")
    print("  Recipients double-click DataAnalysis.exe — browser opens automatically.")
    print("  Drop CSV files onto the app window or place them in data/.")


if __name__ == "__main__":
    main()
