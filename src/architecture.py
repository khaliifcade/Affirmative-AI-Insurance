"""Fig. 1 - framework architecture (static diagram)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
import config as C

fig, ax = plt.subplots(figsize=(7, 4.2)); ax.set_xlim(0, 100); ax.set_ylim(0, 62); ax.axis("off")

def box(x, y, w, h, text, fc, ec="#1f3b57", fs=7.5, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2", fc=fc, ec=ec, lw=1))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            fontweight="bold" if bold else "normal", wrap=True)

def arrow(x1, y1, x2, y2, label="", dy=1.2):
    ax.annotate("", (x2, y2), (x1, y1), arrowprops=dict(arrowstyle="-|>", color="#333", lw=0.9))
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + dy, label, ha="center", fontsize=6.3, color="#333")

# ledger band
ax.add_patch(FancyBboxPatch((18, 22), 64, 16, boxstyle="round,pad=0.5", fc="#e8f1f8", ec="#1f5f8b", lw=1.3))
ax.text(50, 35.6, "Permissioned provenance ledger (Hyperledger Fabric channel)", ha="center", fontsize=8, fontweight="bold", color="#1f5f8b")
box(20, 23.5, 18, 9, "Model-version\nregistry\n(artefact, data,\neval-report hashes)", "white", fs=6.3)
box(41, 23.5, 18, 9, "Runtime\nattestations\n(orderer-timestamped)", "white", fs=6.3)
box(62, 23.5, 18, 9, "Policy, FNOL &\nclaim-verification\nchaincode", "white", fs=6.3)

# actors
box(2, 48, 22, 10, "AI deployer\n(insured)", "#f4f4f4", bold=True)
box(39, 48, 22, 10, "Independent auditor /\nevaluator", "#f4f4f4", bold=True)
box(76, 48, 22, 10, "Insurer\n(underwriting & claims)", "#f4f4f4", bold=True)
box(2, 2, 26, 11, "Serving infrastructure\n(runtime attestor)", "#f4f4f4", bold=True)
box(37, 2, 26, 11, "Off-chain evidence store\n(models, datasets, reports;\ncontent-addressed)", "#fff7e6", fs=6.8)
box(72, 2, 26, 11, "Incident oracle\n(FNOL / AIID-style report)", "#f4f4f4", bold=True)

arrow(13, 48, 27, 33, "register + endorse")
arrow(50, 48, 30, 33, "co-sign eval", dy=2.5)
arrow(87, 48, 73, 33, "issue policy /\nadjudicate", dy=0.5)
arrow(15, 13, 47, 23.5, "model hash", dy=-3)
arrow(85, 13, 72, 23.5, "FNOL")
arrow(50, 13, 50, 23.5)
ax.text(51, 17.5, "hash only\non-chain", fontsize=6.3)
fig.tight_layout()
C.FIG_DIR.mkdir(parents=True, exist_ok=True)
fig.savefig(C.FIG_DIR / "fig1_architecture.png", dpi=300)
