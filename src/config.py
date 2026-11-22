"""
Central configuration for the Affirmative AI Insurance provenance study.

Every modelling assumption lives here so that it can be reported in the
manuscript (Table: Simulation parameters) and varied in sensitivity analysis.
Values marked ASSUMPTION are not estimated from data; they are stated,
justified in the paper, and stress-tested.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_ZIP = DATA_DIR / "archive.zip"          # AIID mongodump snapshot (Kaggle: konradb/ai-incident-database)
WORK_DIR = DATA_DIR / "extracted"
RESULTS_DIR = ROOT / "results"
FIG_DIR = RESULTS_DIR / "figures"

SEED = 20260916

# ---------------------------------------------------------------- data scope
DATE_MIN = "2015-01-01"   # modern ML deployment era; earlier AIID entries are sparse
DATE_MAX = "2026-09-14"   # AIID weekly snapshot date used in the paper (14 September 2026)

# ------------------------------------------------ insurance portfolio model
# ASSUMPTION: loss severity per harm tier ~ LogNormal(median, sigma).
# No public AI-claims loss data exist; medians are order-of-magnitude
# placeholders chosen to span typical SME tech E&O retentions up to large
# bodily-injury losses. They are varied x0.5 / x2 in the sensitivity run.
SEVERITY_MEDIAN_USD = {
    "Negligible": 10_000,
    "Minor": 50_000,
    "Moderate": 250_000,
    "Severe": 2_000_000,
    "Critical": 10_000_000,
}
SEVERITY_SIGMA = 1.0
POLICY_LIMIT_USD = 10_000_000
DEDUCTIBLE_USD = 5_000

# ASSUMPTION: policy inception precedes the incident by U(30, 365) days.
INCEPTION_LAG_DAYS = (30, 365)
# ASSUMPTION: each insured AI system has 1..4 registered model versions.
MAX_MODEL_VERSIONS = 4
# ASSUMPTION: share of systems whose pre-inception evaluation flagged a known issue.
P_KNOWN_ISSUE = 0.15

# ------------------------------------------------------------- fraud model
FRAUD_RATE = 0.10           # ASSUMPTION; insurance-fraud literature often cites ~10% of claims
FRAUD_TYPES = {             # relative mix of injected fraud types (ASSUMPTION)
    "version_misattribution": 0.25,
    "evidence_backdating": 0.25,
    "known_defect_concealment": 0.20,
    "duplicate_claim": 0.15,
    "loss_inflation": 0.15,     # control: provenance should NOT help here
}
LOSS_INFLATION_FACTOR = (1.5, 4.0)

# ------------------------------------------ baseline (centralised) insurer
# ASSUMPTION: probabilities that conventional claims handling catches fraud.
P_FORENSIC_AUDIT = 0.10     # share of claims that receive a forensic audit
P_AUDIT_FINDS_TAMPER = 0.70 # audit success given tampering
P_DUP_FUZZY_MATCH = 0.60    # fuzzy duplicate detection in a claims DB
P_ADJUSTER_INFLATION = 0.30 # loss adjuster catches inflated quantum (both systems)
P_FALSE_FLAG_BASELINE = 0.02  # honest claims wrongly flagged by manual review

# ------------------------------------------------ provenance ledger design
ENDORSERS = ("insurer", "insured", "auditor")
ENDORSEMENT_THRESHOLD = 2   # 2-of-3 signatures required to commit a record

# -------------------------------------------- claim-handling time (days)
# ASSUMPTION: triangular(min, mode, max) investigation effort.
BASELINE_INVESTIGATION_DAYS = (5, 15, 45)
LEDGER_INVESTIGATION_DAYS = (1, 3, 10)     # only for items the ledger cannot settle
LEDGER_FLAGGED_REVIEW_DAYS = (2, 5, 15)

# --------------------------------------------------------- Monte Carlo
N_RUNS = 200
SENS_FRAUD_RATES = [0.05, 0.10, 0.20]
SENS_AUDIT_RATES = [0.05, 0.10, 0.25, 0.50]
SENS_SEVERITY_SCALE = [0.5, 1.0, 2.0]
