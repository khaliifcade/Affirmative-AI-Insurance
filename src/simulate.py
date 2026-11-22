"""
Step 2 - Monte Carlo claims simulation on the AIID-derived portfolio.

For every eligible AIID incident we create one insured AI system, its model
version history, an affirmative-AI policy and a first-notice-of-loss (FNOL).
A share of claims is converted into one of five fraud types. Each claim is
then adjudicated twice:

  BASELINE : evidence comes from an insured-controlled mutable database;
             fraud is caught only by (probabilistic) manual controls.
  LEDGER   : evidence is checked against the provenance ledger
             (ledger.ProvenanceLedger) by recomputing hashes and reading
             orderer timestamps; manual controls still apply on top.

Scenarios: 'honest_consortium' and 'collusion' (insured + auditor collude,
which meets the 2-of-3 endorsement threshold at registration time).

Outputs (results/): mc_runs.csv, mc_by_fraud_type.csv, summary_main.csv,
sensitivity.csv, ledger_benchmark.json
"""
import argparse
import json
import time

import numpy as np
import pandas as pd

import config as C
from ledger import CentralisedLog, Party, ProvenanceLedger, micro_benchmark, sha256_hex

# ASSUMPTION: share of incident-time model hashes covered by runtime attestation
P_ATTESTATION_COVERAGE = 0.95
DUPLICATE_WINDOW_DAYS = 7          # ledger fuzzy-duplicate rule
DUPLICATE_SHIFT_DAYS = (0, 10)     # fraudster shifts the reported date by U(0,10) days


def tri(rng, t):
    return rng.triangular(*t)


def build_portfolio(inc, rng, severity_scale=1.0):
    """Deterministic-given-rng synthetic insurance layer on top of real incidents."""
    rows = []
    for r in inc.itertuples(index=False):
        t_inc = float((r.date - pd.Timestamp(C.DATE_MIN)).days) + 400.0  # day index
        lag = rng.uniform(*C.INCEPTION_LAG_DAYS)
        t_incept = t_inc - lag
        n_ver = int(rng.integers(1, C.MAX_MODEL_VERSIONS + 1))
        # version registration times, all before the incident
        reg_times = np.sort(rng.uniform(t_incept - 300, t_inc - 1, n_ver))
        versions = []
        for v in range(n_ver):
            known_issue = bool(rng.random() < C.P_KNOWN_ISSUE) and reg_times[v] < t_incept
            versions.append({
                "version": f"v{v + 1}",
                "t_reg": float(reg_times[v]),
                "artifact_hash": sha256_hex(f"{r.incident_id}-{v}-{rng.random()}"),
                "data_hash": sha256_hex(f"data-{r.incident_id}-{v}-{rng.random()}"),
                "eval_report": {"known_issue": known_issue,
                                "notes": f"eval of v{v + 1} for peril {r.peril}"},
            })
        active = versions[-1]   # version live at incident time
        med = C.SEVERITY_MEDIAN_USD[r.severity] * severity_scale
        loss = float(rng.lognormal(np.log(med), C.SEVERITY_SIGMA))
        rows.append({
            "incident_id": int(r.incident_id), "system_id": f"sys-{r.incident_id}",
            "peril": r.peril, "severity": r.severity,
            "t_inc": t_inc, "t_incept": t_incept, "versions": versions,
            "active": active, "loss": loss,
            "excluded": active["eval_report"]["known_issue"],   # prior-knowledge exclusion
        })
    return rows


def _apply_fraud_ground_truth(port, ftypes, rng):
    """Make the true state of each system consistent with its fraud type
    *before* anything is registered on either log."""
    for s, ft in zip(port, ftypes):
        if ft in ("known_defect_concealment", "evidence_backdating"):
            # the version live at the incident carried a known, pre-inception defect
            act = s["active"]
            act["t_reg"] = min(act["t_reg"], s["t_incept"] - 10)
            act["eval_report"]["known_issue"] = True
            s["excluded"] = True
        if ft == "evidence_backdating" and len(s["versions"]) == 1:
            v0 = {"version": "v0", "t_reg": s["active"]["t_reg"] - 60,
                  "artifact_hash": sha256_hex(f"v0-{s['system_id']}-{rng.random()}"),
                  "data_hash": sha256_hex(f"d0-{s['system_id']}-{rng.random()}"),
                  "eval_report": {"known_issue": False, "notes": "clean earlier version"}}
            s["versions"].insert(0, v0)


def payout(loss):
    return max(0.0, min(C.POLICY_LIMIT_USD, loss - C.DEDUCTIBLE_USD))


def assign_fraud(n, rng, fraud_rate):
    types = list(C.FRAUD_TYPES)
    probs = np.array(list(C.FRAUD_TYPES.values()))
    probs = probs / probs.sum()
    is_fraud = rng.random(n) < fraud_rate
    ftype = np.where(is_fraud, rng.choice(types, size=n, p=probs), "honest")
    return ftype


def run_once(inc, seed, fraud_rate=C.FRAUD_RATE, p_audit=C.P_FORENSIC_AUDIT,
             severity_scale=1.0, collusion=False, sign=True):
    rng = np.random.default_rng(seed)
    port = build_portfolio(inc, rng, severity_scale)
    ftypes = assign_fraud(len(port), rng, fraud_rate)

    _apply_fraud_ground_truth(port, ftypes, rng)

    parties = [Party(p) for p in C.ENDORSERS]
    led = ProvenanceLedger(parties, C.ENDORSEMENT_THRESHOLD, sign=sign)
    db = CentralisedLog()

    # ------------------------------------------------ register history
    events = []
    for i, s in enumerate(port):
        for v in s["versions"]:
            events.append((v["t_reg"], "version", i, v))
        events.append((s["t_incept"], "policy", i, None))
        events.append((s["t_inc"], "attest", i, None))
    events.sort(key=lambda e: e[0])

    attested = {}
    for t, kind, i, v in events:
        s = port[i]
        led.advance_clock(t)
        if kind == "version":
            report = dict(v["eval_report"])
            if collusion and ftypes[i] == "known_defect_concealment":
                # colluding auditor co-signs a sanitised report at registration time
                report["known_issue"] = False
            led.append("model_version", f"{s['system_id']}/{v['version']}",
                       {"artifact": v["artifact_hash"], "data": v["data_hash"],
                        "eval_report_hash": sha256_hex(report)},
                       ["insured", "auditor"])
            db.append(f"{s['system_id']}/{v['version']}",
                      {"artifact": v["artifact_hash"], "eval_report": dict(v["eval_report"])}, t)
        elif kind == "policy":
            led.append("policy", s["system_id"], {"incept": s["t_incept"],
                                                   "limit": C.POLICY_LIMIT_USD},
                       ["insurer", "insured"])
        elif kind == "attest":
            deployed_hash = s["active"]["artifact_hash"]
            if ftypes[i] == "version_misattribution":
                # an unregistered hot-fix was actually serving traffic
                deployed_hash = sha256_hex(f"hotfix-{s['system_id']}-{rng.random()}")
                s["true_deployed"] = deployed_hash
            if rng.random() < P_ATTESTATION_COVERAGE:
                on_ledger = deployed_hash
                if collusion and ftypes[i] == "version_misattribution":
                    on_ledger = s["active"]["artifact_hash"]   # colluding auditor attests falsely
                led.append("runtime_attestation", s["system_id"],
                           {"model_hash": on_ledger, "t": t}, ["insured", "auditor"])
                attested[s["system_id"]] = on_ledger
            db.append(f"{s['system_id']}/deploy", {"model_hash": deployed_hash}, t)
            # first notice of loss registered by the incident oracle
            led.append("fnol", f"{s['system_id']}/fnol",
                       {"peril": s["peril"], "t_inc": t}, ["insurer", "insured"])

    assert led.verify_chain(), "ledger integrity failure"

    # ------------------------------------------------ build & adjudicate
    fnol_index = {}   # (system_id, peril) -> list of incident times on ledger
    for s in port:
        fnol_index.setdefault((s["system_id"], s["peril"]), []).append(s["t_inc"])

    records = []
    claim_time = max(e[0] for e in events) + 30
    for i, s in enumerate(port):
        ft = ftypes[i]
        claims = [("primary", ft if ft != "duplicate_claim" else "honest", s["t_inc"])]
        if ft == "duplicate_claim":
            shift = rng.uniform(*DUPLICATE_SHIFT_DAYS)
            claims.append(("duplicate", "duplicate_claim", s["t_inc"] + shift))

        for role, ctype, t_rep in claims:
            active = s["active"]
            claimed_version = active
            claimed_loss = s["loss"]
            truly_payable = not s["excluded"]
            backdated_record = None

            if ctype == "version_misattribution":
                truly_payable = False          # unregistered model breaches warranty
                db.overwrite(f"{s['system_id']}/deploy", -1,
                             {"model_hash": active["artifact_hash"]})
            elif ctype == "evidence_backdating":
                truly_payable = False
                # insured claims an earlier, clean version was live and
                # inserts a backdated deployment record
                claimed_version = s["versions"][0]
                db.overwrite(f"{s['system_id']}/deploy", -1,
                             {"model_hash": claimed_version["artifact_hash"]},
                             ts=s["t_inc"] - 5)
                led.advance_clock(claim_time)
                backdated_record = led.append(
                    "runtime_attestation", s["system_id"],
                    {"model_hash": claimed_version["artifact_hash"], "t": s["t_inc"] - 5},
                    ["insured", "auditor"] if collusion else ["insured", "insurer"],
                    claimed_ts=s["t_inc"] - 5)
            elif ctype == "known_defect_concealment":
                truly_payable = False
            elif ctype == "loss_inflation":
                claimed_loss = s["loss"] * rng.uniform(*C.LOSS_INFLATION_FACTOR)
            elif ctype == "duplicate_claim":
                truly_payable = False

            claimed_hash = claimed_version["artifact_hash"]
            submitted_report = dict(claimed_version["eval_report"])
            if ctype == "known_defect_concealment":
                submitted_report["known_issue"] = False
                db.overwrite(f"{s['system_id']}/{active['version']}", 0,
                             {"artifact": claimed_hash, "eval_report": submitted_report})

            fraud = ctype != "honest"
            correct_pay = payout(s["loss"]) if truly_payable else 0.0

            # ---------------- BASELINE adjudication (manual controls only)
            b_flag = False
            b_days = tri(rng, C.BASELINE_INVESTIGATION_DAYS)
            if ctype in ("version_misattribution", "evidence_backdating",
                         "known_defect_concealment"):
                b_flag = rng.random() < p_audit and rng.random() < C.P_AUDIT_FINDS_TAMPER
            elif ctype == "duplicate_claim":
                b_flag = rng.random() < C.P_DUP_FUZZY_MATCH
            elif ctype == "loss_inflation":
                b_flag = rng.random() < C.P_ADJUSTER_INFLATION
            else:
                b_flag = rng.random() < C.P_FALSE_FLAG_BASELINE
            b_version_ok = not (ctype in ("version_misattribution", "evidence_backdating") and not b_flag)
            # honest claim on an excluded system: insured discloses truthfully in both designs
            b_pay = _decide(b_flag, ctype, s, claimed_loss, excluded_known=s["excluded"])

            # ---------------- LEDGER adjudication (t0 = cryptographic checks)
            t0 = time.perf_counter()
            l_flag = False
            l_manual = False
            vhist = led.history(f"{s['system_id']}/{claimed_version['version']}")
            reg_ok = bool(vhist) and led.verify_record(vhist[0])
            reg_payload_ok = reg_ok and vhist[0].payload_hash == sha256_hex(
                {"artifact": claimed_hash, "data": claimed_version["data_hash"],
                 "eval_report_hash": sha256_hex(submitted_report)})
            att = attested.get(s["system_id"])
            if att is None:
                l_manual = True                     # no attestation -> manual verification
            elif att != claimed_hash:
                l_flag = True                       # deployed model != claimed model
            if not reg_payload_ok:
                l_flag = True                       # eval report / artefact mismatch
            if backdated_record is not None:
                if backdated_record.order_ts > backdated_record.claimed_ts + 1:
                    l_flag = True                   # orderer timestamp exposes backdating
            if role == "duplicate":
                prior = fnol_index[(s["system_id"], s["peril"])]
                if any(abs(t_rep - tp) <= DUPLICATE_WINDOW_DAYS for tp in prior):
                    l_flag = True
                else:
                    l_manual = True
            crypto_ms = 1000 * (time.perf_counter() - t0)

            if l_manual and not l_flag:             # fall back to baseline controls
                if ctype in ("version_misattribution", "evidence_backdating",
                             "known_defect_concealment"):
                    l_flag = rng.random() < p_audit and rng.random() < C.P_AUDIT_FINDS_TAMPER
                elif ctype == "duplicate_claim":
                    l_flag = rng.random() < C.P_DUP_FUZZY_MATCH
                elif ctype == "honest":
                    l_flag = rng.random() < C.P_FALSE_FLAG_BASELINE
            if ctype == "loss_inflation":
                l_flag = rng.random() < C.P_ADJUSTER_INFLATION   # provenance cannot help
            l_days = (tri(rng, C.LEDGER_FLAGGED_REVIEW_DAYS) if l_flag else
                      tri(rng, C.BASELINE_INVESTIGATION_DAYS) if l_manual else
                      tri(rng, C.LEDGER_INVESTIGATION_DAYS))
            l_version_ok = not (ctype in ("version_misattribution", "evidence_backdating") and not l_flag)
            l_pay = _decide(l_flag, ctype, s, claimed_loss, excluded_known=s["excluded"])

            records.append({
                "incident_id": s["incident_id"], "peril": s["peril"], "severity": s["severity"],
                "role": role, "claim_type": ctype, "fraud": fraud,
                "correct_pay": correct_pay,
                "b_flag": b_flag, "b_pay": b_pay, "b_days": b_days, "b_version_ok": b_version_ok,
                "l_flag": l_flag, "l_pay": l_pay, "l_days": l_days, "l_version_ok": l_version_ok,
                "l_manual": l_manual, "crypto_ms": crypto_ms,
            })
    return pd.DataFrame(records), led


def _decide(flag, ctype, s, claimed_loss, excluded_known):
    """Amount paid by the insurer."""
    if flag:
        # flagged fraud is denied; flagged inflation is paid at the true amount
        if ctype == "loss_inflation":
            return payout(s["loss"]) if not excluded_known else 0.0
        if ctype == "honest":
            return payout(s["loss"]) if not excluded_known else 0.0  # cleared after review
        return 0.0
    if ctype == "honest":
        return 0.0 if excluded_known else payout(claimed_loss)
    return payout(claimed_loss)


def metrics(df):
    out = {}
    fr = df[df.fraud]
    hon = df[~df.fraud]
    legit_paid = df.correct_pay.sum()
    for p in ("b", "l"):
        leak = (df[f"{p}_pay"] - df.correct_pay).clip(lower=0).sum()
        out[f"{p}_detect_all"] = fr[f"{p}_flag"].mean()
        nonq = fr[fr.claim_type != "loss_inflation"]
        out[f"{p}_detect_provenance_types"] = nonq[f"{p}_flag"].mean()
        out[f"{p}_false_flag_rate"] = hon[f"{p}_flag"].mean()
        out[f"{p}_leakage_usd"] = leak
        out[f"{p}_leakage_pct"] = 100 * leak / legit_paid
        out[f"{p}_mean_days"] = df[f"{p}_days"].mean()
        out[f"{p}_attribution_acc"] = df[f"{p}_version_ok"].mean()
    out["n_claims"] = len(df)
    out["n_fraud"] = len(fr)
    out["legit_paid_usd"] = legit_paid
    out["ledger_manual_share"] = df.l_manual.mean()
    out["crypto_ms_mean"] = df.crypto_ms.mean()
    return out


def by_type(df):
    g = df[df.fraud].groupby("claim_type")
    return pd.DataFrame({"baseline_detect": g.b_flag.mean(),
                         "ledger_detect": g.l_flag.mean(), "n": g.size()})


def main(n_runs, quick=False):
    inc = pd.read_csv(C.RESULTS_DIR / "incidents_prepared.csv", parse_dates=["date"])
    C.RESULTS_DIR.mkdir(exist_ok=True)

    # ------------------------------------------------ main experiment
    runs, types = [], []
    for scen, coll in (("honest_consortium", False), ("collusion", True)):
        for k in range(n_runs):
            df, led = run_once(inc, C.SEED + k, collusion=coll, sign=(k < 5))
            m = metrics(df)
            m.update(run=k, scenario=scen, ledger_records=len(led.chain))
            runs.append(m)
            t = by_type(df).reset_index()
            t["run"], t["scenario"] = k, scen
            types.append(t)
            if k == 0 and scen == "honest_consortium":
                df.to_csv(C.RESULTS_DIR / "claims_run0.csv", index=False)
    runs = pd.DataFrame(runs)
    runs.to_csv(C.RESULTS_DIR / "mc_runs.csv", index=False)
    types = pd.concat(types)
    types_sum = (types.groupby(["scenario", "claim_type"])
                 .agg(baseline_detect=("baseline_detect", "mean"),
                      ledger_detect=("ledger_detect", "mean"),
                      mean_n=("n", "mean")).round(3))
    types_sum.to_csv(C.RESULTS_DIR / "mc_by_fraud_type.csv")

    def ci(x):
        return f"{x.mean():.3f} [{x.quantile(.025):.3f}, {x.quantile(.975):.3f}]"
    cols = [c for c in runs.columns if c.startswith(("b_", "l_"))] + [
        "ledger_manual_share", "crypto_ms_mean", "n_claims", "n_fraud", "ledger_records"]
    summ = runs.groupby("scenario")[cols].agg(ci).T
    summ.to_csv(C.RESULTS_DIR / "summary_main.csv")
    print(summ.to_string())
    print(types_sum.to_string())

    # ------------------------------------------------ sensitivity
    sens = []
    n_s = max(10, n_runs // 10) if not quick else 3
    for fr in C.SENS_FRAUD_RATES:
        for pa in C.SENS_AUDIT_RATES:
            for sc in C.SENS_SEVERITY_SCALE:
                ms = [metrics(run_once(inc, 10_000 + k, fr, pa, sc, sign=False)[0])
                      for k in range(n_s)]
                ms = pd.DataFrame(ms)
                sens.append({"fraud_rate": fr, "audit_rate": pa, "severity_scale": sc,
                             "b_leakage_pct": ms.b_leakage_pct.mean(),
                             "l_leakage_pct": ms.l_leakage_pct.mean(),
                             "leakage_reduction_pct": 100 * (1 - ms.l_leakage_usd.sum()
                                                             / ms.b_leakage_usd.sum()),
                             "b_detect": ms.b_detect_all.mean(),
                             "l_detect": ms.l_detect_all.mean()})
    pd.DataFrame(sens).round(3).to_csv(C.RESULTS_DIR / "sensitivity.csv", index=False)

    # ------------------------------------------------ reference benchmark
    bench = [micro_benchmark(n, True) for n in (1000, 5000, 10000)]
    (C.RESULTS_DIR / "ledger_benchmark.json").write_text(json.dumps(bench, indent=2))
    print(json.dumps(bench, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=C.N_RUNS)
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    main(a.runs, a.quick)
