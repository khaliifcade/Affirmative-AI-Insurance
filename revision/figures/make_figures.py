import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, numpy as np
from matplotlib.patches import FancyBboxPatch
plt.rcParams.update({"font.family":"DejaVu Sans","font.size":9,"axes.titlesize":9.5,"axes.labelsize":9,"xtick.labelsize":9,"ytick.labelsize":9,"legend.fontsize":9,"savefig.dpi":300})
D='./'
# ---------- Fig 1 architecture ----------
fig=plt.figure(figsize=(6.6,5.2)); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,100); ax.set_ylim(0,79); ax.axis('off')
NAVY='#0d2b45'; TEAL='#124e5c'; ORG='#b5420e'; LED='#e6eff8'
def box(x,y,w,h,title,body,fc,tc='white',ec=None,lw=1.2):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle="round,pad=0.4,rounding_size=1.2",fc=fc,ec=ec or fc,lw=lw))
    ax.text(x+w/2,y+h-2.4,title,ha='center',va='top',color=tc,fontsize=9,fontweight='bold')
    ax.text(x+w/2,y+h-6.0,body,ha='center',va='top',color=tc,fontsize=9,linespacing=1.15)
def step(x,y,n): ax.add_patch(plt.Circle((x,y),1.9,color=ORG,zorder=5)); ax.text(x,y,str(n),ha='center',va='center',color='white',fontsize=9,fontweight='bold',zorder=6)
def arr(x1,y1,x2,y2): ax.annotate('',xy=(x2,y2),xytext=(x1,y1),arrowprops=dict(arrowstyle='-|>',color='#1f3b57',lw=1.3,mutation_scale=11))
box(2,63,30,11,'AI deployer (insured)','registers and endorses\nmodel versions',NAVY)
box(35,63,30,11,'Independent auditor','evaluates models and\nco-signs the evidence',NAVY)
box(68,63,30,11,'Insurer','underwriting and\nclaims adjudication',NAVY)
ax.add_patch(FancyBboxPatch((1,22),98,31,boxstyle="round,pad=0.3,rounding_size=1.5",fc=LED,ec='#1f4e79',lw=1.3))
ax.text(50,51.2,'Permissioned provenance ledger (Hyperledger Fabric channel)',ha='center',va='center',fontsize=9.5,fontweight='bold',color='#0d3b66',zorder=8,bbox=dict(fc=LED,ec='none',pad=0.5))
box(3,26,29,15,'Model version registry','digests of artefact,\ntraining data and\nevaluation report','white','#0d2b45','#1f4e79')
box(35.5,26,29,15,'Runtime attestations','digest of the model in\nservice, timestamped\nby the orderer','white','#0d2b45','#1f4e79')
box(68,26,29,15,'Claim verification','compares digests and\ntimestamps; applies\nrules R1–R5','white','#0d2b45','#1f4e79')
ax.text(50,48.4,'every write requires 2 of 3 endorsements (insured, auditor, insurer)',ha='center',va='center',fontsize=9,color=ORG,fontweight='bold',zorder=8,bbox=dict(fc=LED,ec='none',pad=0.5))
box(2,1,30,12,'Off-chain evidence store','models, datasets, reports;\ncontent-addressed','#fdf0c2','#0d2b45',ORG)
box(35,1,30,12,'Serving infrastructure','runtime attestor for the\nmodel answering requests',TEAL)
box(68,1,30,12,'Incident oracle','first notice of loss\n(FNOL)',TEAL)
arr(10,62.6,10,42); step(10,57,1); ax.text(13,57,'register version\n+ digests',va='center',fontsize=9)
arr(45,62.6,27,42); step(38.5,55.5,2); ax.text(41.5,55.5,'co-sign\nevaluation',va='center',fontsize=9)
arr(80,62.6,80,42); step(80,57,4); ax.text(77,57,'issue\npolicy',va='center',ha='right',fontsize=9)
arr(93,42,93,62.6); step(93,57,8); ax.text(91,58.6,'verdict',va='center',ha='right',fontsize=9)
arr(10,13.6,10,25.4); step(10,18.5,3); ax.text(13,18.5,'digest on-chain only',va='center',fontsize=9)
arr(50,13.6,50,25.4); step(50,18.5,5); ax.text(53,18.5,'attest model in service',va='center',fontsize=9)
arr(83,13.6,83,25.4); step(83,18.5,6); ax.text(86,18.5,'file FNOL',va='center',fontsize=9)
ax.annotate('',xy=(67.4,33.5),xytext=(64.6,33.5),arrowprops=dict(arrowstyle='-|>',color='#1f3b57',lw=1.3,mutation_scale=11))
ax.plot([17.5,17.5,66],[41.4,44.6,44.6],color='#1f3b57',lw=1.3); ax.annotate('',xy=(75,41.6),xytext=(66,44.6),arrowprops=dict(arrowstyle='-|>',color='#1f3b57',lw=1.3,mutation_scale=11,connectionstyle="angle,angleA=0,angleB=90"))
step(57,44.6,7); ax.text(73.5,42.9,'verify claim',fontsize=9,va='center',ha='right')
fig.savefig(D+'f1.png'); plt.close()
# ---------- Fig 2 ----------
I=np.load(D+'fig2_counts.npy')
classes=['Synthetic media / impersonation fraud','Autonomous / physical harm','Hallucination / misinformation','Harmful content','Automated decision error','Privacy / data exposure','Adversarial attack / model security','Bias / discrimination','Intellectual property']
tiers=['Negligible','Minor','Moderate','Severe','Critical']; tc=['#c6dbef','#8abfdd','#4a98c9','#1c6ab0','#08306b']; hat=['','','','///','xx']
fig,ax=plt.subplots(figsize=(6.6,3.6)); left=np.zeros(9); y=np.arange(9)[::-1]
for k in range(5):
    ax.barh(y,I[:,k],left=left,color=tc[k],edgecolor='white',lw=0.5,label=tiers[k],hatch=hat[k]); left+=I[:,k]
ax.set_yticks(y,classes); ax.set_xlabel('Number of incidents (AIID, 2015–2026)'); ax.legend(title='Harm tier',frameon=False,loc='lower right')
ax.spines[['top','right']].set_visible(False); fig.tight_layout(); fig.savefig(D+'f2.png'); plt.close()
# ---------- Fig 3 ----------
J=np.load(D+'fig3_counts.npy'); years=np.arange(2015,2027)
names=['Adversarial attack / model security','Automated decision error','Autonomous / physical harm','Bias / discrimination','Hallucination / misinformation','Harmful content','Intellectual property','Privacy / data exposure','Synthetic media / impersonation fraud']
cc=['#1f77b4','#ff7f0e','#98df8a','#ff9896','#8c564b','#e377c2','#c7c7c7','#dbdb8d','#9edae5']
fig,ax=plt.subplots(figsize=(6.6,3.8)); bot=np.zeros(12)
for k in range(9): ax.bar(years,J[:,k],bottom=bot,color=cc[k],edgecolor='white',lw=0.4,label=names[k]); bot+=J[:,k]
ax.set_xticks(years,[str(y) for y in years],rotation=45); ax.set_ylabel('Number of incidents'); ax.set_xlabel('Year (2026: to 10 September)')
ax.legend(frameon=False,loc='upper left',fontsize=8.5 if False else 9,ncol=1); ax.spines[['top','right']].set_visible(False)
fig.tight_layout(); fig.savefig(D+'f3.png'); plt.close()
# ---------- Fig 4 ----------
types=['Version\nmisattribution','Evidence\nbackdating','Known-defect\nconcealment','Duplicate\nclaim','Loss inflation\n(control)']
vals={'h':([0.065,0.065,0.067,0.585,0.302],[0.955,1.0,1.0,0.883,0.295]),'c':([0.071,0.067,0.068,0.595,0.300],[0.003,1.0,0.004,0.885,0.295])}
fig,axs=plt.subplots(1,2,figsize=(6.6,3.2),sharey=True); x=np.arange(5)
for ax,(k,t) in zip(axs,[('h','(a) Honest consortium'),('c','(b) Insured–auditor collusion')]):
    b,l=vals[k]; ax.bar(x-0.19,b,0.38,color='#a0a0a0',label='Centralised baseline'); ax.bar(x+0.19,l,0.38,color='#1f5f8b',label='Provenance ledger')
    ax.set_xticks(x,types,fontsize=8.6 if False else 9,rotation=0); ax.set_title(t); ax.set_ylim(0,1.05); ax.spines[['top','right']].set_visible(False)
    plt.setp(ax.get_xticklabels(),rotation=45,ha='right',rotation_mode='anchor')
axs[0].set_ylabel('Detection rate (mean of runs)'); h,l=axs[0].get_legend_handles_labels(); fig.legend(h,l,frameon=False,loc='upper center',ncol=2)
fig.tight_layout(rect=(0,0,1,0.92)); fig.savefig(D+'f4.png'); plt.close()
# ---------- Fig 5 ----------
st=[('Baseline\n(honest)',4.35,7.59,9.13,10.53,14.29,'#a9a9a9'),('Ledger\n(honest)',0.05,0.85,1.12,1.51,2.71,'#41779c'),('Baseline\n(collusion)',3.95,7.64,9.13,10.51,14.29,'#a9a9a9'),('Ledger\n(collusion)',2.00,4.89,6.22,7.48,11.31,'#41779c')]
fig,ax=plt.subplots(figsize=(5.2,3.2))
bx=ax.bxp([dict(label=s[0],whislo=s[1],q1=s[2],med=s[3],q3=s[4],whishi=s[5],fliers=[]) for s in st],showfliers=False,patch_artist=True,widths=0.55)
for p,s in zip(bx['boxes'],st): p.set_facecolor(s[6])
for m in bx['medians']: m.set_color('black'); m.set_linewidth(1.5)
ax.set_ylabel('Fraud leakage (% of legitimate payout)'); ax.spines[['top','right']].set_visible(False)
fig.tight_layout(); fig.savefig(D+'f5.png'); plt.close()
# ---------- Fig 6 ----------
v=np.array([[87,86,84,87],[87,87,87,82],[87,87,84,82]])
fig,ax=plt.subplots(figsize=(4.8,3.0)); im=ax.imshow(v,cmap="Blues",vmin=0,vmax=100,aspect="auto")
ax.set_xticks(range(4),["5%","10%","25%","50%"]); ax.set_yticks(range(3),["5%","10%","20%"]); ax.set_xlabel("Baseline forensic-audit rate"); ax.set_ylabel("Fraud rate")
for i in range(3):
    for j in range(4): ax.text(j,i,f"{v[i,j]}%",ha="center",va="center",color="white",fontsize=9.5,fontweight='bold')
cb=fig.colorbar(im,ax=ax); cb.set_label("Relative leakage reduction (%)"); fig.tight_layout(); fig.savefig(D+'f6.png'); plt.close()
# ---------- Fig 7 ----------
rounds={"register":([25,50,100,200],[25.0,50.0,99.8,182.7],[0.28,0.18,0.13,2.79],"o"),"attest":([50,100],[50.0,99.9],[0.17,0.12],"s"),"query":([100,300],[100.0,300.0],[0.02,0.02],"^"),"claim (pool 20)":([10,25],[9.5,23.0],[0.70,0.33],"D"),"claim (pool 200)":([10,25],[9.7,23.1],[0.71,0.31],"v"),"claim (1 worker)":([10],[10.0],[0.52],"*")}
fig,(a,b)=plt.subplots(1,2,figsize=(6.6,3.0))
for k,(x,t,l,m) in rounds.items(): a.plot(x,t,marker=m,label=k,ms=5); b.plot(x,l,marker=m,label=k,ms=5)
a.plot([0,310],[0,310],":",color="grey",lw=1)
a.set_title("(a) Throughput");a.set_xlabel("Offered load (TPS)");a.set_ylabel("Throughput (TPS)")
b.set_title("(b) Mean latency");b.set_xlabel("Offered load (TPS)");b.set_ylabel("Mean latency (s)")
for z in (a,b): z.spines[["top","right"]].set_visible(False)
a.legend(frameon=False,loc="upper left",fontsize=9); fig.tight_layout(); fig.savefig(D+'f7.png'); plt.close()
print('ok')
