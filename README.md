# Affirmative AI Insurance: Blockchain-Assured Provenance — reproducibility package

## Layout
```
src/            Python simulation (data prep, reference ledger, Monte Carlo, figures)
fabric/         Hyperledger Fabric chaincode (JavaScript), unit tests, Caliper benchmark
results/        all outputs (created on run)
```

## A. Simulation study (any OS with Python 3.10+)
```bash
pip install -r requirements.txt
python run_all.py --zip /path/to/archive.zip          # AIID snapshot from Kaggle
```
Outputs: `dataset_stats.json`, `peril_summary.csv`, `severity_validation.csv`,
`summary_main.csv`, `mc_by_fraud_type.csv`, `sensitivity.csv`,
`ledger_benchmark.json`, `figures/*.png`.

Manual validation (recommended): open `results/peril_manual_check_sample.csv`,
fill `manual_peril` for each row with the class you judge correct, then report accuracy.

All modelling assumptions are in `src/config.py`.

## B. Fabric deployment + Caliper benchmark (Linux / macOS / WSL2)
Requires Docker, Docker Compose, Node.js 18+, git, curl, jq.
```bash
cd fabric
./run_fabric.sh
```
Outputs: `fabric/caliper/report.html`, `results/caliper_summary.csv`.
Then run `python src/figures.py` again to add the throughput figure.

Chaincode unit tests only (no Docker): `cd fabric/chaincode && npm install && npm test`.

## Data licence
AIID content is shared under CC BY-SA 4.0 (report contents keep their own rights).

## C. Revision (IJITCS, November 2026)
`revision/` contains the material added in response to the reviewers:

- `revision/chaincode/` – chaincode with both claim paths: `FileClaim` (range reads, Algorithm 1) and
  `FileFNOLAndClaim` + `AttestV2` (day-bucketed deterministic keys, Algorithm 2). Run `npm install && npm test`.
- `revision/caliper/` – Hyperledger Caliper 0.6.0 benchmark on a native Fabric v2.5.12 network with three peer
  organisations (Tables 9 and 10), including `results.json` and the HTML report.
- `revision/figures/` – script and data for Figs. 1–7 at 300 dpi.

Random seed: `SEED = 20260916` in `src/config.py`; run r of each scenario uses `SEED + r`, sensitivity runs use `10000 + r`.
