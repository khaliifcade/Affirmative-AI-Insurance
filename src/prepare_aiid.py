"""
Step 1 - Prepare the AI Incident Database (AIID) snapshot.

* extracts only the files we need from the mongodump zip
* removes AIID-declared duplicate incidents
* maps every incident to an insurance peril class (rule-based, transparent)
* assigns a harm-severity tier (CSET expert label where available, else rule)
* validates the rule-based severity against CSET expert labels (Cohen's kappa)

Outputs (results/):
    incidents_prepared.csv, peril_summary.csv, severity_validation.csv,
    peril_vs_cset_harm.csv, dataset_stats.json
"""
import json
import re
import sys
import zipfile
from collections import Counter

import numpy as np
import pandas as pd

import config as C

NEEDED = {
    "mongodump/incidents.csv": "incidents.csv",
    "mongodump/duplicates.csv": "duplicates.csv",
    "mongodump/license.txt": "license.txt",
    "mongodump/aiidprod/classifications.bson": "classifications.bson",
}

# ------------------------------------------------------------------ perils
# Ordered: first match wins. Patterns are applied to lower-cased title+description.
PERIL_RULES = [
    ("P6_adversarial_security", [
        r"deepfake", r"prompt injection", r"jailbreak", r"hack", r"adversarial",
        r"spoof", r"scam", r"impersonat", r"voice clon", r"evad", r"exploit",
        r"manipulat\w+ by", r"poison", r"\bfake\b", r"malicious", r"malware",
        r"\bgans?\b", r"ai[- ]\w* ?audio", r"ai voices?", r"bypass", r"hijack"]),
    ("P5_autonomous_physical", [
        r"autopilot", r"self-driving", r"driverless", r"autonomous vehicle",
        r"\bfsd\b", r"robot", r"crash", r"collision", r"collid", r"killed",
        r"\bdeath", r"injur", r"drone", r"\btruck\b", r"missile", r"surgical",
        r"factory", r"waymo", r"\bcruise\b", r"tesla", r"\bcars?\b", r"vehicle",
        r"roborace"]),
    ("P4_intellectual_property", [
        r"copyright", r"plagiar", r"trademark", r"intellectual property",
        r"stable diffusion", r"midjourney", r"artists?'? (work|style)",
        r"open[- ]source licens", r"without permission"]),
    ("P3_privacy_data", [
        r"privacy", r"personal data", r"private data", r"data breach", r"leak",
        r"exposed users", r"surveil", r"facial recognition", r"biometric",
        r"track(ed|ing) (users|people)", r"consent", r"gdpr", r"private conversation",
        r"recorded"]),
    ("P1_hallucination_misinfo", [
        r"chatgpt", r"\bgpt", r"chatbot", r"bing chat", r"bard", r"galactica",
        r"hallucinat", r"false information", r"misinformation", r"disinformation",
        r"fabricat",
        r"inaccurate (answer|information)", r"made[- ]up", r"conspirac",
        r"language model", r"\bllm\b"]),
    ("P2_bias_discrimination", [
        r"bias", r"discriminat", r"racis", r"sexis", r"gender", r"black ",
        r"minorit", r"disproportionat", r"stereotyp", r"transgender",
        r"inequalit", r"people of colou?r", r"women", r"female"]),
    ("P7_harmful_content", [
        r"moderation", r"inappropriate", r"toxic", r"offensive", r"hate speech",
        r"porn", r"sexual", r"extremis", r"violent content", r"recommend",
        r"eating disorder", r"disturbing", r"violent", r"n-word"]),
    ("P8_decision_error", [
        r"wrongful", r"misidentif", r"misclassif", r"error", r"fail",
        r"incorrect", r"accus", r"flagged", r"denied", r"algorithm",
        r"predict", r"score", r"automated", r"malfunction", r"glitch",
        r"false positive", r"mistake", r"directed"]),
]

PERIL_LABELS = {
    "P1_hallucination_misinfo": "Hallucination / misinformation",
    "P2_bias_discrimination": "Bias / discrimination",
    "P3_privacy_data": "Privacy / data exposure",
    "P4_intellectual_property": "Intellectual property",
    "P5_autonomous_physical": "Autonomous / physical harm",
    "P6_adversarial_security": "Adversarial / security misuse",
    "P7_harmful_content": "Harmful content",
    "P8_decision_error": "Automated decision error",
    "P0_unclassified": "Unclassified",
}

SEVERITY_ORDER = ["Negligible", "Minor", "Moderate", "Severe", "Critical"]

SEVERITY_RULES = [  # first match wins, applied top-down
    ("Critical", [r"\bkill", r"\bdeath", r"\bdied\b", r"fatal", r"suicide", r"lives lost"]),
    ("Severe", [r"injur", r"crash", r"collision", r"collid", r"arrest", r"hospital",
                r"million", r"billion", r"tax fraud", r"lost (their )?jobs?"]),
    ("Moderate", [r"wrongful", r"accus", r"denied", r"fired", r"discriminat",
                  r"exposed", r"leak", r"fraud", r"stolen", r"lawsuit", r"banned"]),
    ("Minor", [r"bias", r"offensive", r"toxic", r"false", r"inaccura", r"misidentif",
               r"misclassif", r"inappropriate", r"error", r"fail"]),
]


def extract(zip_path):
    C.WORK_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        names = set(z.namelist())
        for src, dst in NEEDED.items():
            if src not in names:
                print(f"[warn] {src} not in archive")
                continue
            (C.WORK_DIR / dst).write_bytes(z.read(src))


def match_first(text, rules, default):
    for label, pats in rules:
        for p in pats:
            if re.search(p, text):
                return label
    return default


def load_cset():
    """Return DataFrame(incident_id, cset_severity, cset_harm_type) from CSET v0 labels."""
    path = C.WORK_DIR / "classifications.bson"
    try:
        import bson  # provided by `pymongo`
    except ImportError:
        print("[warn] pymongo not installed -> CSET validation skipped")
        return pd.DataFrame(columns=["incident_id", "cset_severity", "cset_harm_type"])
    rows = []
    for d in bson.decode_all(path.read_bytes()):
        if d.get("namespace") != "CSET":
            continue
        attrs = {}
        for a in d.get("attributes", []):
            v = a.get("value_json")
            try:
                v = json.loads(v) if v is not None else None
            except (TypeError, ValueError):
                pass
            attrs[a["short_name"]] = v
        sev = attrs.get("Severity")
        harm = attrs.get("Harm Type") or []
        rows.append({
            "incident_id": int(d["incident_id"]),
            "cset_severity": sev if sev in SEVERITY_ORDER else None,
            "cset_harm_type": "|".join(harm) if isinstance(harm, list) else harm,
        })
    return pd.DataFrame(rows)


def cohen_kappa(a, b, labels):
    idx = {l: i for i, l in enumerate(labels)}
    m = np.zeros((len(labels), len(labels)))
    for x, y in zip(a, b):
        m[idx[x], idx[y]] += 1
    n = m.sum()
    po = np.trace(m) / n
    pe = (m.sum(0) * m.sum(1)).sum() / n ** 2
    kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0
    # linearly weighted kappa (ordinal severity)
    k = len(labels)
    w = 1 - np.abs(np.subtract.outer(np.arange(k), np.arange(k))) / (k - 1)
    exp = np.outer(m.sum(1), m.sum(0)) / n
    wk = ((w * m).sum() / n - (w * exp).sum() / n) / (1 - (w * exp).sum() / n)
    return po, kappa, wk, m


def main(zip_path):
    C.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    extract(zip_path)

    inc = pd.read_csv(C.WORK_DIR / "incidents.csv")
    dups = pd.read_csv(C.WORK_DIR / "duplicates.csv")
    n_raw = len(inc)
    inc = inc[~inc.incident_id.isin(dups.duplicate_incident_number)].copy()
    n_dedup = len(inc)

    inc["date"] = pd.to_datetime(inc["date"], errors="coerce")
    inc = inc[(inc.date >= C.DATE_MIN) & (inc.date <= C.DATE_MAX)].copy()
    n_window = len(inc)

    text = (inc.title.fillna("") + " " + inc.description.fillna("")).str.lower()
    inc["peril"] = [match_first(t, PERIL_RULES, "P0_unclassified") for t in text]
    inc["peril_label"] = inc.peril.map(PERIL_LABELS)
    inc["severity_rule"] = [match_first(t, SEVERITY_RULES, "Negligible") for t in text]
    inc["n_reports"] = inc.reports.fillna("[]").map(lambda s: len(json.loads(s)))
    inc["deployer"] = inc["Alleged deployer of AI system"].fillna("[]").map(
        lambda s: (json.loads(s) or ["unknown"])[0])

    cset = load_cset()
    inc = inc.merge(cset, on="incident_id", how="left")
    inc["severity"] = inc.cset_severity.fillna(inc.severity_rule)
    inc["severity_source"] = np.where(inc.cset_severity.notna(), "CSET expert", "rule")

    # --- validation of rule-based severity against CSET expert labels
    val = inc.dropna(subset=["cset_severity"])
    stats_val = {}
    if len(val):
        po, kappa, wk, m = cohen_kappa(val.severity_rule, val.cset_severity, SEVERITY_ORDER)
        pd.DataFrame(m.astype(int), index=[f"rule_{l}" for l in SEVERITY_ORDER],
                     columns=[f"cset_{l}" for l in SEVERITY_ORDER]
                     ).to_csv(C.RESULTS_DIR / "severity_validation.csv")
        within1 = np.mean(np.abs(val.severity_rule.map(SEVERITY_ORDER.index)
                                 - val.cset_severity.map(SEVERITY_ORDER.index)) <= 1)
        stats_val = {"n_cset_labelled": int(len(val)), "exact_agreement": round(po, 3),
                     "cohen_kappa": round(kappa, 3), "linear_weighted_kappa": round(wk, 3),
                     "within_one_tier": round(float(within1), 3)}
        # peril vs CSET harm type crosswalk (face validity)
        rows = []
        for _, r in val.iterrows():
            for h in str(r.cset_harm_type or "").split("|"):
                if h:
                    rows.append((r.peril_label, h))
        ct = pd.crosstab(pd.Series([a for a, _ in rows], name="peril"),
                         pd.Series([b for _, b in rows], name="cset_harm_type"))
        ct.to_csv(C.RESULTS_DIR / "peril_vs_cset_harm.csv")

    eligible = inc[inc.peril != "P0_unclassified"].copy()
    summary = (eligible.groupby("peril_label")
               .agg(incidents=("incident_id", "count"),
                    median_reports=("n_reports", "median"),
                    share_severe_or_critical=("severity",
                                              lambda s: round(s.isin(["Severe", "Critical"]).mean(), 3)))
               .sort_values("incidents", ascending=False))
    summary.to_csv(C.RESULTS_DIR / "peril_summary.csv")

    cols = ["incident_id", "date", "title", "deployer", "peril", "peril_label",
            "severity", "severity_source", "severity_rule", "cset_severity", "n_reports"]
    eligible[cols].to_csv(C.RESULTS_DIR / "incidents_prepared.csv", index=False)

    # stratified sample for MANUAL checking of the peril mapping (fill column `manual_peril`)
    chk = (inc.groupby("peril", group_keys=False)
           .apply(lambda g: g.sample(min(len(g), 10), random_state=C.SEED)))
    chk = chk[["incident_id", "title", "peril_label"]].assign(manual_peril="")
    chk.to_csv(C.RESULTS_DIR / "peril_manual_check_sample.csv", index=False)

    stats = {
        "snapshot_license": (C.WORK_DIR / "license.txt").read_text().strip()
        if (C.WORK_DIR / "license.txt").exists() else None,
        "incidents_raw": n_raw, "incidents_after_dedup": n_dedup,
        "incidents_in_window": n_window,
        "incidents_unclassified": int((inc.peril == "P0_unclassified").sum()),
        "incidents_eligible": int(len(eligible)),
        "date_min": str(eligible.date.min().date()), "date_max": str(eligible.date.max().date()),
        "incidents_by_year": {int(k): int(v) for k, v in
                              eligible.date.dt.year.value_counts().sort_index().items()},
        "severity_distribution": dict(Counter(eligible.severity)),
        "severity_source": dict(Counter(eligible.severity_source)),
        "severity_validation": stats_val,
    }
    (C.RESULTS_DIR / "dataset_stats.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))
    print(summary)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else C.RAW_ZIP)
