"""Step 3 - Figures for the manuscript (results/figures/*.png, 300 dpi)."""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C

plt.rcParams.update({"font.size": 9, "font.family": "DejaVu Sans",
                     "axes.spines.top": False, "axes.spines.right": False})
BASE, LEDG = "#9a9a9a", "#1f5f8b"
TYPE_LABELS = {
    "version_misattribution": "Version\nmisattribution",
    "evidence_backdating": "Evidence\nbackdating",
    "known_defect_concealment": "Known-defect\nconcealment",
    "duplicate_claim": "Duplicate\nclaim",
    "loss_inflation": "Loss inflation\n(control)",
}


def save(fig, name):
    C.FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(C.FIG_DIR / name, dpi=300)
    plt.close(fig)


def fig_perils():
    inc = pd.read_csv(C.RESULTS_DIR / "incidents_prepared.csv", parse_dates=["date"])
    order = ["Negligible", "Minor", "Moderate", "Severe", "Critical"]
    ct = pd.crosstab(inc.peril_label, inc.severity)[order]
    ct = ct.loc[ct.sum(axis=1).sort_values().index]
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    left = np.zeros(len(ct))
    colors = plt.cm.Blues(np.linspace(0.25, 0.95, len(order)))
    for c, col in zip(order, colors):
        ax.barh(ct.index, ct[c], left=left, color=col, label=c)
        left += ct[c].values
    ax.set_xlabel("AIID incidents (2015-03 to 2023-03)")
    ax.legend(title="Harm tier", fontsize=7, title_fontsize=7, frameon=False, loc="lower right")
    save(fig, "fig2_perils_by_severity.png")

    fig, ax = plt.subplots(figsize=(6.5, 2.6))
    yr = pd.crosstab(inc.date.dt.year, inc.peril_label)
    yr.plot(kind="bar", stacked=True, ax=ax, colormap="tab20", width=0.8, legend=False)
    ax.set_xlabel("Year"); ax.set_ylabel("Incidents")
    ax.legend(fontsize=6, frameon=False, ncol=2, bbox_to_anchor=(1.01, 1), loc="upper left")
    save(fig, "fig3_incidents_by_year.png")


def fig_detection():
    t = pd.read_csv(C.RESULTS_DIR / "mc_by_fraud_type.csv")
    fig, axes = plt.subplots(1, 2, figsize=(7, 2.9), sharey=True)
    for ax, scen, title in zip(axes, ["honest_consortium", "collusion"],
                               ["(a) Honest consortium", "(b) Insured-auditor collusion"]):
        d = t[t.scenario == scen].set_index("claim_type").reindex(TYPE_LABELS)
        x = np.arange(len(d))
        ax.bar(x - 0.2, d.baseline_detect, 0.4, color=BASE, label="Centralised baseline")
        ax.bar(x + 0.2, d.ledger_detect, 0.4, color=LEDG, label="Provenance ledger")
        ax.set_xticks(x, [TYPE_LABELS[k] for k in d.index], fontsize=6.5)
        ax.set_ylim(0, 1.05); ax.set_title(title, fontsize=9)
    axes[0].set_ylabel("Detection rate (mean of runs)")
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, loc="upper center", ncol=2, frameon=False, fontsize=7)
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    C.FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(C.FIG_DIR / "fig4_detection_by_fraud_type.png", dpi=300)
    plt.close(fig)


def fig_leakage():
    r = pd.read_csv(C.RESULTS_DIR / "mc_runs.csv")
    fig, ax = plt.subplots(figsize=(5, 2.9))
    data, labels, cols = [], [], []
    for scen, lab in [("honest_consortium", "Honest"), ("collusion", "Collusion")]:
        d = r[r.scenario == scen]
        data += [d.b_leakage_pct, d.l_leakage_pct]
        labels += [f"Baseline\n({lab})", f"Ledger\n({lab})"]
        cols += [BASE, LEDG]
    bp = ax.boxplot(data, patch_artist=True, showfliers=False, widths=0.55)
    for p, c in zip(bp["boxes"], cols):
        p.set_facecolor(c); p.set_alpha(0.85)
    ax.set_xticks(range(1, 5), labels, fontsize=7)
    ax.set_ylabel("Fraud leakage (% of legitimate payout)")
    save(fig, "fig5_leakage.png")


def fig_sensitivity():
    s = pd.read_csv(C.RESULTS_DIR / "sensitivity.csv")
    s = s[s.severity_scale == 1.0]
    pv = s.pivot(index="fraud_rate", columns="audit_rate", values="leakage_reduction_pct")
    fig, ax = plt.subplots(figsize=(4.4, 2.8))
    im = ax.imshow(pv.values, cmap="Blues", vmin=0, vmax=100, aspect="auto")
    ax.set_xticks(range(len(pv.columns)), [f"{c:.0%}" for c in pv.columns])
    ax.set_yticks(range(len(pv.index)), [f"{i:.0%}" for i in pv.index])
    ax.set_xlabel("Baseline forensic-audit rate"); ax.set_ylabel("Fraud rate")
    for i in range(pv.shape[0]):
        for j in range(pv.shape[1]):
            v = pv.values[i, j]
            ax.text(j, i, f"{v:.0f}%", ha="center", va="center",
                    color="white" if v > 55 else "black", fontsize=8)
    fig.colorbar(im, ax=ax, label="Leakage reduction (%)")
    save(fig, "fig6_sensitivity.png")


def fig_benchmark():
    p = C.RESULTS_DIR / "caliper_summary.csv"      # optional: produced from Caliper report
    if not p.exists():
        return
    d = pd.read_csv(p)
    fig, ax = plt.subplots(figsize=(5, 2.8))
    for rnd, g in d.groupby("round"):
        ax.plot(g.send_tps, g.throughput_tps, marker="o", label=rnd)
    ax.set_xlabel("Offered load (TPS)"); ax.set_ylabel("Throughput (TPS)")
    ax.legend(frameon=False, fontsize=7)
    save(fig, "fig7_fabric_throughput.png")


if __name__ == "__main__":
    fig_perils(); fig_detection(); fig_leakage(); fig_sensitivity(); fig_benchmark()
    print("figures ->", C.FIG_DIR)
