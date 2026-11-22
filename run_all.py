"""One-command reproduction of the simulation study.

    python run_all.py --zip path/to/archive.zip            # full (200 runs, ~3-5 min)
    python run_all.py --zip path/to/archive.zip --quick    # smoke test
"""
import argparse
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).parent / "src"

ap = argparse.ArgumentParser()
ap.add_argument("--zip", required=True, help="AIID mongodump archive (Kaggle konradb/ai-incident-database)")
ap.add_argument("--quick", action="store_true")
a = ap.parse_args()

steps = [["prepare_aiid.py", str(Path(a.zip).resolve())],
         ["simulate.py"] + (["--runs", "6", "--quick"] if a.quick else []),
         ["figures.py"],
         ["architecture.py"]]
for s in steps:
    print(f"\n=== {' '.join(s)} ===", flush=True)
    subprocess.run([sys.executable, s[0], *s[1:]], cwd=SRC, check=True)
print("\nAll results in ./results  (share the whole folder)")
