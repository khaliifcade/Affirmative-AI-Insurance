const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, ImageRun, Footer, PageNumber, LevelFormat,
} = require('docx');

const FIG = require('path').join(__dirname, '..', 'results', 'figures') + '/';
const FONT = 'Times New Roman';
// figures that depend on the reader's own simulation / Fabric run are left as placeholders
const PENDING = new Set((process.env.PENDING_FIGS || 'fig4_detection_by_fraud_type.png,fig5_leakage.png,fig6_sensitivity.png,fig7_fabric_throughput.png').split(','));

// "[[...]]" = pending placeholder (yellow), "**...**" = bold, "*...*" = italic
function runs(text, base = {}) {
  const out = [];
  for (const part of text.split(/(\[\[.*?\]\]|\*\*.*?\*\*|\*[^*]+?\*)/)) {
    if (!part) continue;
    if (part.startsWith('[[')) out.push(new TextRun({ ...base, text: part.slice(2, -2), highlight: 'yellow', bold: true }));
    else if (part.startsWith('**')) out.push(new TextRun({ ...base, text: part.slice(2, -2), bold: true }));
    else if (part.startsWith('*')) out.push(new TextRun({ ...base, text: part.slice(1, -1), italics: true }));
    else out.push(new TextRun({ ...base, text: part }));
  }
  return out;
}
const P = (t, o = {}) => new Paragraph({ children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 276 }, ...o });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], spacing: { before: 240, after: 120 } });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], spacing: { before: 180, after: 80 } });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: runs(t), spacing: { after: 60 }, alignment: AlignmentType.JUSTIFIED });
const numbered = (t) => new Paragraph({ numbering: { reference: 'num', level: 0 }, children: runs(t), spacing: { after: 60 }, alignment: AlignmentType.JUSTIFIED });
const caption = (t) => new Paragraph({ children: runs(t, { size: 19 }), alignment: AlignmentType.CENTER, spacing: { after: 200 } });

function figure(file, w, h, cap) {
  const pth = FIG + file;
  const children = fs.existsSync(pth) && !PENDING.has(file)
    ? [new ImageRun({ type: 'png', data: fs.readFileSync(pth), transformation: { width: w, height: h },
        altText: { title: cap, description: cap, name: file } })]
    : runs(`[[FIGURE PENDING: ${file}]]`);
  return [new Paragraph({ children, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 } }), caption(cap)];
}

const TW = 9026; // A4 text width with 1" margins
const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
function table(cap, header, rows, widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const cw = widths.map((w) => Math.round((w / sum) * TW));
  cw[cw.length - 1] += TW - cw.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    width: { size: cw[i], type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border },
    shading: head ? { fill: 'DCE6F0', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: runs(String(t), { size: 18, bold: head }) })],
  });
  return [
    new Paragraph({ children: runs(cap, { size: 19 }), alignment: AlignmentType.CENTER, spacing: { before: 160, after: 60 }, keepNext: true }),
    new Table({
      width: { size: TW, type: WidthType.DXA }, columnWidths: cw,
      rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))],
    }),
    new Paragraph({ children: [], spacing: { after: 120 } }),
  ];
}

// --------------------------------------------------------------------------- content
const body = [];
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: 'Affirmative AI Insurance: A Blockchain-Assured Provenance Framework for Emerging AI Risks', bold: true, size: 32 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: runs('[[Author Name(s)]]') }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: runs('[[Affiliation, City, Country · corresponding e-mail]]') }));

body.push(new Paragraph({ children: [new TextRun({ text: 'Abstract', bold: true })], spacing: { after: 60 } }));
body.push(P('Insurers have begun to offer *affirmative* coverage for losses caused by artificial intelligence (AI), such as hallucinations, model-performance degradation and discriminatory outputs, instead of leaving these exposures silent inside legacy cyber and technology errors-and-omissions policies. Pricing and settling such cover depends on facts that are hard to verify after a loss: which model version was in service, what its pre-inception evaluation revealed, and whether the evidence submitted with a claim is authentic. We propose a provenance framework in which model-version registrations, evaluation-report digests, runtime model attestations, policies and first notices of loss are committed to a permissioned blockchain and endorsed by the insured, an independent auditor and the insurer, while the underlying artefacts remain off-chain. Claims are verified by smart-contract rules that recompute hashes and read ordering-service timestamps. We ground the evaluation in 447 real incidents from the AI Incident Database (2015–2023), which we map to eight insurable peril classes, and run a Monte Carlo study with five injected claim-fraud types against a centralised baseline. With an honest consortium, the ledger raised detection of provenance-related fraud from [[X%]] to [[Y%]] and reduced fraud leakage by [[Z%]]; it gave no benefit against loss-amount inflation and lost most of its advantage when the insured and auditor colluded. A Hyperledger Fabric prototype achieved [[N TPS]] for claim verification at [[L s]] mean latency. The results indicate that provenance ledgers address attribution and evidence-integrity problems in AI insurance but not quantum disputes, and that the independence of attesting parties is the critical design assumption.'));
body.push(P('**Keywords:** affirmative AI insurance; AI risk; provenance; blockchain; Hyperledger Fabric; claims fraud; AI Incident Database; smart contracts.'));

// 1
body.push(H1('1. Introduction'));
body.push(P('Organisations now deploy machine-learning systems in credit, hiring, health care, content moderation and vehicle control, and the failures of these systems cause losses that someone must bear. For most of the past decade such losses were handled, if at all, under policies that neither granted nor excluded AI-specific perils, a situation the market calls *silent* exposure, by analogy with the silent-cyber problem that led Lloyd’s to require explicit cyber wording in 2019 [5]. Since 2025 carriers and managing agents have started to write *affirmative* AI cover. In April 2025, for example, Armilla Insurance Services launched an AI liability product underwritten at Lloyd’s that names hallucinations, model-performance degradation and deviations from expected behaviour as covered perils [1]. Recent studies map this emerging boundary between affirmative, silent and excluded AI perils [2] and propose actuarial structures for agentic AI [3].'));
body.push(P('Affirmative cover sharpens an old problem. Insurability requires that losses be random, measurable and not dominated by information asymmetry [4]. For AI systems the central asymmetry concerns *provenance*: the insured controls the records that show which model was running, how it was trained and evaluated, and what defects were known before the policy began. A policy can exclude known pre-inception defects or require that only registered model versions are deployed, but these terms are only as enforceable as the evidence behind them. When that evidence lives in a database the insured can edit, fraud such as misattributing a loss to a compliant model version, backdating deployment logs, or concealing an adverse evaluation is cheap and rarely detected.'));
body.push(P('Tamper-evident logging [9], cryptographic time-stamping [10] and permissioned blockchains [8] offer a way to fix these facts at the time they are created. Blockchain has been proposed for insurance before [14] and for AI audit trails, but, to our knowledge, it has not been designed and evaluated specifically for the evidence problems of affirmative AI insurance. This paper makes four contributions:'));
body.push(numbered('A provenance framework for affirmative AI insurance, with a threat model, record types, endorsement policy and claim-verification rules (Section 3).'));
body.push(numbered('An open implementation as Hyperledger Fabric chaincode with unit tests and a Caliper benchmark, plus a reference ledger used for simulation (Section 3.5).'));
body.push(numbered('An empirical grounding in 447 real AI incidents from the AI Incident Database (AIID) [6], mapped to eight insurable peril classes, with the harm-severity assignment checked against expert labels from the CSET taxonomy [7] (Section 4).'));
body.push(numbered('A Monte Carlo evaluation of five claim-fraud types, including a loss-inflation control and an insider-collusion scenario, which shows both where provenance helps and where it does not (Sections 5–6).'));

// 2
body.push(H1('2. Background and Related Work'));
body.push(H2('2.1 Affirmative AI insurance and insurability'));
body.push(P('Classical insurability criteria include randomness of loss, a bounded maximum loss, manageable information asymmetry and a sufficiently large exposure base [4]. AI risk strains several of these at once. Leung et al. code 55 AI threat classes against 26 insurance products and identify a four-tier frontier of affirmatively insured, silent, excluded and uninsurable perils; they place hallucination, IP infringement, sensitive-information disclosure, model drift, data poisoning, evasion and bias in the affirmatively insured tier [2]. Work on agentic AI proposes coordinated towers of cyber, technology E&O, product liability, performance-warranty and AI-liability cover with dedicated AI aggregates [3]. These studies focus on coverage design and pricing; they do not address how the facts that trigger or exclude cover are to be verified.'));
body.push(H2('2.2 Documenting AI failures'));
body.push(P('The AI Incident Database collects publicly reported harms and near-harms from deployed AI systems, following the model of aviation and computer-security incident registries [6]. Subsets of incidents carry structured expert annotations, notably the CSET AI Harm taxonomy, which records severity, harm type and deployment sector [7]. Documentation practices such as model cards [12] and datasheets [13], and governance frameworks such as the NIST AI RMF [16], ISO/IEC 42001 [17] and the record-keeping obligations of the EU AI Act for high-risk systems [15], define *what* should be recorded. Proposals for affirmative safety cases likewise place the burden on developers to evidence that risks stay below thresholds [18]. None of these specifies how records can be made trustworthy to a counterparty with opposing financial interests, which is the situation of an insurer.'));
body.push(H2('2.3 Provenance and tamper-evident records'));
body.push(P('The W3C PROV model describes entities, activities and agents involved in producing data [11], and content-provenance standards such as C2PA [21] bind signed manifests to media. Hash chains and Merkle structures make logs tamper-evident [9], and trusted time-stamping prevents backdating [10]. Hyperledger Fabric adds a permissioned membership service, an execute-order-validate architecture and configurable endorsement policies, which suit consortia of known organisations such as insurers, insureds and auditors [8].'));
body.push(H2('2.4 Blockchain in insurance'));
body.push(P('Gatteschi et al. reviewed blockchain and smart contracts for insurance and concluded that the main benefits lie in shared, verifiable records and automated claims for parametric products, while privacy, scalability and oracle trust remain open [14]. Our work applies this idea to a new line of business and, importantly, tests it against explicit adversaries, including colluding insiders.'));
body.push(P('**Research gap.** Prior work either designs AI coverage without an evidence layer [2], [3] or builds blockchain audit trails without an insurance model or adversarial evaluation. We connect the two and quantify the effect on fraud detection and leakage using real incident data.'));

// 3
body.push(H1('3. Proposed Framework'));
body.push(...figure('fig1_architecture.png', 560, 336, 'Fig. 1. Framework architecture. Only digests and metadata are stored on-chain; artefacts stay in a content-addressed off-chain store.'));
body.push(H2('3.1 Actors and threat model'));
body.push(P('The consortium has three endorsing members: the **insured** (the AI deployer), an **independent auditor** that evaluates models before and during cover, and the **insurer**. Two further roles feed data: the insured’s **serving infrastructure**, which periodically attests the digest of the model answering requests, and an **incident oracle** that records first notice of loss (FNOL). We assume that the ordering service is operated honestly and that cryptographic primitives (SHA-256, Ed25519 [20]) are secure. The adversary is the insured, who wishes to be paid for a claim that the policy excludes or to be paid more than once. In the collusion scenario the auditor also cooperates with the insured; because two of three signatures suffice to commit a record, the pair can register false evidence at creation time.'));
body.push(H2('3.2 Record types'));
body.push(P('The ledger holds five record types: (i) *model-version registrations* containing digests of the model artefact, training-data manifest and evaluation report, plus a known-issue flag; (ii) *runtime attestations* of the model digest in service, time-stamped by the orderer; (iii) *policies* with inception date, limit and deductible; (iv) *FNOL* records keyed by system, peril and incident time; and (v) *claims* with the automated verdict. Registrations are immutable: a new version requires a new key. Personal data and model weights are never written to the chain, which keeps the design compatible with erasure requests and trade-secret protection.'));
body.push(H2('3.3 Claim-verification rules'));
body.push(P('When a claim is filed, the chaincode (a) checks that the claimed model version is registered with the submitted artefact and evaluation-report digests; (b) selects the latest attestation observed before the incident and compares its digest with the claimed artefact; (c) flags attestations whose observation time precedes their commit time by more than one day; (d) applies the prior-knowledge exclusion when the registered evaluation flagged an issue before inception; and (e) flags an FNOL for the same system and peril within ±7 days of an earlier one. A claim is *VERIFIED* when no rule fires, *FLAGGED* when any rule fires, and routed to *MANUAL_REVIEW* when attestations or FNOL are missing.'));
body.push(...table('Table 1. Claim-fraud typology used in the evaluation',
  ['Fraud type', 'Insured’s action', 'Ledger control', 'Can provenance help?'],
  [['Version misattribution', 'Unregistered hot-fix was in service; claim names a registered version', 'Runtime attestation ≠ claimed digest', 'Yes, unless auditor attests falsely'],
   ['Evidence backdating', 'Inserts a deployment record dated before the incident', 'Orderer timestamp ≫ claimed timestamp', 'Yes, if orderer honest'],
   ['Known-defect concealment', 'Submits a sanitised evaluation report', 'Report digest ≠ registered digest', 'Yes, unless auditor co-signed a sanitised report'],
   ['Duplicate claim', 'Re-files the same loss with a shifted date', 'FNOL window rule', 'Partly (window-dependent)'],
   ['Loss inflation (control)', 'Overstates the loss amount', 'None', 'No']],
  [2, 3.2, 2.6, 2.2]));
body.push(H2('3.4 Endorsement policy'));
body.push(P('In the reference design every write needs two of three signatures (insured, auditor, insurer). Model registrations and attestations are co-signed by the insured and the auditor; policies and FNOL by the insured and the insurer. The Fabric prototype uses the two-organisation test network with an AND endorsement policy, which is stricter; a three-organisation deployment is straightforward but was not benchmarked.'));
body.push(H2('3.5 Implementation'));
body.push(P('The chaincode is written in JavaScript with fabric-contract-api and uses composite keys for each record type, the transaction timestamp for all time fields, and chaincode events for registrations and adjudications. Seven unit tests cover honest verification, immutability, and each fraud control. For simulation we implemented a reference ledger in Python with SHA-256 hash chaining, Ed25519 threshold endorsements, a logical orderer clock and replica head comparison. Code, configuration and data-preparation scripts are available at [[repository URL]].'));

// 4
body.push(H1('4. Methodology'));
body.push(H2('4.1 Data'));
body.push(P('We used the AIID MongoDB snapshot of 23 April 2023 distributed on Kaggle, which is shared under CC BY-SA 4.0. The snapshot contains 514 incidents; the ten duplicate identifiers listed by AIID were already absent. We kept 469 incidents dated between 1 January 2015 and 31 March 2023, the period of widespread ML deployment covered by the snapshot. CSET expert annotations (severity, harm type) were read from the classifications collection for the 69 in-window incidents that have them.'));
body.push(H2('4.2 Peril mapping and severity'));
body.push(P('Each incident was assigned to one of eight peril classes aligned with affirmative-cover wordings (Table 3) by ordered, transparent keyword rules applied to the title and description; 22 incidents matched no rule and were excluded, leaving **447** incidents. Harm severity on a five-tier scale (negligible to critical) was taken from CSET labels where available (61 of the 447) and otherwise from keyword rules. Against the 69 CSET-labelled incidents, the rule-based severity agreed exactly in 52.2% of cases (Cohen’s κ = 0.32 [22]; linear-weighted κ = 0.51) and was within one tier in 87.0%. We therefore used expert labels wherever they existed and treat the rule-based tiers as approximate. A stratified sample of 90 incidents is released for manual checking of the peril mapping; [[manual-check accuracy = __%]].'));
body.push(H2('4.3 Insurance portfolio model'));
body.push(P('Each eligible incident becomes one insured AI system with one to four registered model versions, an affirmative AI policy incepting 30–365 days before the incident, and one FNOL. Because no public AI-claims loss data exist, loss amounts are drawn from log-normal distributions whose medians are set per severity tier and varied by factors of 0.5 and 2 in the sensitivity analysis (Table 2). Ten per cent of claims are made fraudulent, a rate commonly cited for property-casualty insurance [23], and distributed across the five fraud types in Table 1.'));
body.push(...table('Table 2. Simulation parameters (assumptions are varied in the sensitivity analysis)',
  ['Parameter', 'Value', 'Basis'],
  [['Loss median by tier (USD)', '10k / 50k / 250k / 2M / 10M; σ = 1.0', 'Assumption; scaled ×0.5, ×2'],
   ['Policy limit / deductible', 'USD 10M / USD 5k', 'Assumption'],
   ['Fraud rate', '10% (5%, 20%)', 'Industry estimate [23]'],
   ['Fraud mix', '25 / 25 / 20 / 15 / 15 %', 'Assumption (Table 1 order)'],
   ['Forensic-audit rate (baseline)', '10% (5%, 25%, 50%)', 'Assumption'],
   ['Audit success given tampering', '70%', 'Assumption'],
   ['Fuzzy duplicate match (baseline)', '60%', 'Assumption'],
   ['Adjuster catches inflation', '30% (both designs)', 'Assumption'],
   ['Runtime attestation coverage', '95%', 'Assumption'],
   ['Endorsement threshold', '2 of 3', 'Design'],
   ['Investigation time (days, triangular)', 'Baseline 5/15/45; ledger 1/3/10; flagged 2/5/15', 'Assumption'],
   ['Monte Carlo runs', '200 per scenario; 20 per sensitivity cell', 'Design']],
  [3, 3.6, 2.4]));
body.push(H2('4.4 Adjudication designs and metrics'));
body.push(P('In the **baseline**, evidence comes from an insured-controlled database that can be overwritten silently; fraud is caught only by forensic audits, fuzzy duplicate matching and loss adjusters. In the **ledger** design, the rules of Section 3.3 run first and the same manual controls apply to claims routed to manual review. We report detection rate by fraud type, false-flag rate on honest claims, fraud leakage (overpayment as a percentage of legitimate payout), model-version attribution accuracy and mean handling time, each with 95% percentile intervals across runs. Two scenarios are simulated: an honest consortium and insured–auditor collusion.'));
body.push(H2('4.5 Performance evaluation'));
body.push(P('The chaincode was deployed on the Hyperledger Fabric test network (two peer organisations, Raft ordering service) on [[hardware: CPU, RAM, OS, Docker version, Fabric version]] and benchmarked with Hyperledger Caliper 0.6.0 [19] using four workers and fixed-rate rounds for registration (25–200 TPS), attestation (50–100 TPS), end-to-end claim verification (10–25 TPS) and evidence queries (100–300 TPS).'));

// 5
body.push(H1('5. Results'));
body.push(H2('5.1 Incident portfolio'));
body.push(...table('Table 3. AIID incidents by insurable peril class (n = 447, March 2015 – March 2023)',
  ['Peril class', 'Incidents', 'Share', 'Severe or critical'],
  [['Autonomous / physical harm', '106', '23.7%', '46.2%'],
   ['Bias / discrimination', '68', '15.2%', '2.9%'],
   ['Automated decision error', '66', '14.8%', '7.6%'],
   ['Adversarial / security misuse', '59', '13.2%', '5.1%'],
   ['Privacy / data exposure', '57', '12.8%', '12.3%'],
   ['Hallucination / misinformation', '42', '9.4%', '4.8%'],
   ['Harmful content', '42', '9.4%', '11.9%'],
   ['Intellectual property', '7', '1.6%', '0.0%']],
  [3.4, 1.4, 1.4, 1.8]));
body.push(P('Autonomous and physical-harm incidents are the largest class and carry by far the highest share of severe or critical harm (46.2%), whereas bias, hallucination and IP incidents are frequent but mostly low-severity (Table 3, Fig. 2). Across all 447 incidents, 192 were negligible, 112 minor, 70 moderate, 44 severe and 29 critical. Annual counts rose from 23 in 2015 to 86 in 2022 (Fig. 3); the 44 incidents in 2023 cover only the first quarter. Adversarial and security misuse, including deepfake fraud, grew fastest in 2022–2023. Intellectual-property incidents are rare in this snapshot, which predates most generative-AI copyright litigation.'));
body.push(...figure('fig2_perils_by_severity.png', 520, 272, 'Fig. 2. AIID incidents by peril class and harm tier.'));
body.push(...figure('fig3_incidents_by_year.png', 540, 216, 'Fig. 3. AIID incidents by year and peril class (2023: January–March only).'));

body.push(H2('5.2 Fraud detection'));
body.push(P('[[Fill from results/summary_main.csv and results/mc_by_fraud_type.csv.]] With an honest consortium, the ledger detected [[__%]] of all fraudulent claims against [[__%]] for the baseline, and [[__%]] vs [[__%]] of the four provenance-related fraud types (Fig. 4a). Version misattribution was detected in [[__%]] of cases (missed only when runtime attestation was absent), evidence backdating and known-defect concealment in [[__%]], and duplicates in [[__%]]. Loss-inflation detection was unchanged ([[__%]] vs [[__%]]), as expected. The false-flag rate on honest claims was [[__%]] for the ledger and [[__%]] for the baseline.'));
body.push(...figure('fig4_detection_by_fraud_type.png', 560, 232, 'Fig. 4. Detection rate by fraud type: (a) honest consortium; (b) insured–auditor collusion.'));
body.push(P('Under collusion (Fig. 4b), detection of version misattribution and known-defect concealment fell to [[__%]] and [[__%]], because the colluding auditor signed false evidence at creation time. Backdating was still detected in [[__%]] of cases because the orderer timestamp cannot be forged by endorsers.'));

body.push(H2('5.3 Leakage, attribution and handling time'));
body.push(...table('Table 4. Main results (mean and 95% interval over 200 runs)',
  ['Metric', 'Baseline', 'Ledger (honest)', 'Ledger (collusion)'],
  [['Detection, all fraud', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['Detection, provenance types', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['False-flag rate (honest claims)', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['Fraud leakage (% legit payout)', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['Model attribution accuracy', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['Mean handling time (days)†', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['Claims routed to manual review', '100%', '[[ __ ]]', '[[ __ ]]'],
   ['Verification CPU time per claim (ms)', '–', '[[ __ ]]', '[[ __ ]]']],
  [3.2, 2, 2, 2]));
body.push(P('†Handling time follows directly from the assumed investigation-time distributions and is reported for completeness, not as an independent finding. Fraud leakage fell from [[__%]] to [[__%]] of legitimate payout with an honest consortium, a reduction of [[__%]], but only to [[__%]] under collusion (Fig. 5). The wide intervals reflect heavy-tailed losses: one undetected critical-tier claim can dominate a run.'));
body.push(...figure('fig5_leakage.png', 400, 232, 'Fig. 5. Fraud leakage across 200 runs per design and scenario (outliers hidden).'));

body.push(H2('5.4 Sensitivity analysis'));
body.push(P('Across fraud rates of 5–20%, baseline audit rates of 5–50% and loss-severity scaling of 0.5–2, the ledger reduced leakage by [[__–__%]] (Fig. 6). The advantage narrowed as the baseline audit rate increased, but even a 50% audit rate, which would be costly in practice, left [[__%]] of the reduction in place.'));
body.push(...figure('fig6_sensitivity.png', 352, 224, 'Fig. 6. Leakage reduction by fraud rate and baseline forensic-audit rate (severity scale = 1).'));

body.push(H2('5.5 Platform performance'));
body.push(P('The Python reference ledger appended signed records at about [[__]] records/s and verified them at about [[__]] records/s (results/ledger_benchmark.json). On Fabric, [[describe results/caliper_summary.csv: throughput saturation point, mean and max latency for register, attest, claim and query rounds, failure counts, CPU/memory from the Docker monitor]].'));
body.push(...table('Table 5. Hyperledger Caliper results',
  ['Round', 'Offered TPS', 'Throughput (TPS)', 'Avg latency (s)', 'Max latency (s)', 'Succ / Fail'],
  [['register', '25 / 50 / 100 / 200', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['attest', '50 / 100', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['claim (FNOL + claim)', '10 / 25', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]'],
   ['query', '100 / 300', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]', '[[ __ ]]']],
  [2.2, 1.8, 1.6, 1.5, 1.5, 1.4]));
body.push(...figure('fig7_fabric_throughput.png', 400, 224, 'Fig. 7. Fabric throughput against offered load.'));

// 6
body.push(H1('6. Discussion'));
body.push(P('**What provenance buys.** The ledger turns three questions that are otherwise decided by costly, probabilistic investigation (which model was running, what was known before inception, and whether evidence was altered) into deterministic checks. This matters most for the peril classes where the real-world data show high severity, particularly autonomous and physical harm, where attribution of a loss to a specific model version is also central to product-liability recovery.'));
body.push(P('**What it does not buy.** Provenance says nothing about how large a loss was. The loss-inflation control confirms that quantum disputes need other tools, such as parametric triggers or independent loss data. Provenance also cannot establish that an evaluation was *adequate*, only that it was not changed.'));
body.push(P('**Independence is the key assumption.** The collusion scenario shows that a ledger inherits the honesty of the parties who sign at creation time. Insurers should therefore require that evaluation and runtime attestation come from parties without a stake in the claim, for example accredited auditors or trusted-execution-based attestors, and should consider requiring the insurer’s own endorsement for evaluation records. Orderer honesty is similarly critical for the backdating control.'));
body.push(P('**Underwriting and regulation.** The same records support underwriting: a registry of versions and evaluations gives the insurer an exposure inventory, and attestation frequency can be priced. The design also maps onto record-keeping duties for high-risk systems under the EU AI Act [15] and onto documentation practices in the NIST AI RMF [16] and ISO/IEC 42001 [17], so the compliance effort can be shared with the insurance use case.'));

// 7
body.push(H1('7. Limitations'));
body.push(bullet('Loss amounts, policy terms, fraud rates and control effectiveness are assumptions, not estimates; no public AI-claims dataset exists. The sensitivity analysis bounds but does not remove this limitation.'));
body.push(bullet('AIID incidents are publicly reported events and over-represent large, newsworthy firms; the snapshot ends in March 2023 and misses most generative-AI incidents since then.'));
body.push(bullet('The peril mapping is rule-based; rule-based severity showed only fair exact agreement with expert labels (κ = 0.32), although 87% of cases were within one tier.'));
body.push(bullet('Detection of provenance fraud is partly true by construction once honest endorsement is assumed; the contribution lies in quantifying its economic effect and its failure modes, not in the detection logic itself.'));
body.push(bullet('The Fabric benchmark uses the single-host test network with two organisations; production deployments across organisations and regions will have higher latency.'));
body.push(bullet('The oracle problem (whether the runtime attestor and incident oracle report truthfully) is assumed away except in the collusion scenario.'));

// 8
body.push(H1('8. Conclusion'));
body.push(P('Affirmative AI insurance needs verifiable answers to questions about model identity, prior knowledge and evidence integrity. We showed how a permissioned provenance ledger can supply those answers and evaluated it on a portfolio built from 447 real AI incidents. With independent endorsers, the framework detected most provenance-related fraud and reduced fraud leakage by [[__%]]; it did not help with inflated losses and was largely defeated by insured–auditor collusion. Future work should use real claims data from carriers, extend the model to agentic systems with delegated actions, add privacy-preserving verification such as zero-knowledge proofs of evaluation results, and test multi-organisation deployments.'));

body.push(H1('Data and Code Availability'));
body.push(P('AIID data are available under CC BY-SA 4.0 from the AI Incident Database and the Kaggle mirror (konradb/ai-incident-database). All code, configuration and outputs are available at [[repository URL / DOI]].'));
body.push(H1('Declaration of Competing Interest'));
body.push(P('[[The authors declare no competing interests.]]'));

body.push(H1('References'));
const refs = [
  'Hunton Andrews Kurth LLP, “Affirmative Artificial Intelligence Insurance Coverages Emerge,” Hunton Insurance Recovery Blog, 2025. [Online]. Available: https://www.hunton.com/hunton-insurance-recovery-blog/affirmative-artificial-intelligence-insurance-coverages-emerge',
  'A. Leung et al., “The Insurability Frontier of AI Risk: Mapping Threats to Affirmative Coverage, Silent Exposures, and Exclusions,” arXiv:2605.18784, 2026.',
  '[[Authors]], “Insurance of Agentic AI,” arXiv:2606.05449, 2026.',
  'B. Berliner, Limits of Insurability of Risks. Englewood Cliffs, NJ, USA: Prentice-Hall, 1982.',
  'Lloyd’s, “Providing clarity for Lloyd’s customers on coverage for cyber exposures,” Market Bulletin Y5258, Jul. 2019.',
  'S. McGregor, “Preventing repeated real world AI failures by cataloging incidents: The AI Incident Database,” in Proc. AAAI Conf. Artif. Intell., vol. 35, no. 17, 2021, pp. 15458–15463.',
  'M. Hoffmann and H. Frase, “Adding Structure to AI Harm: An Introduction to CSET’s AI Harm Framework,” Center for Security and Emerging Technology, Jul. 2023.',
  'E. Androulaki et al., “Hyperledger Fabric: A distributed operating system for permissioned blockchains,” in Proc. EuroSys, 2018, Art. no. 30.',
  'S. A. Crosby and D. S. Wallach, “Efficient data structures for tamper-evident logging,” in Proc. 18th USENIX Security Symp., 2009, pp. 317–334.',
  'S. Haber and W. S. Stornetta, “How to time-stamp a digital document,” J. Cryptology, vol. 3, no. 2, pp. 99–111, 1991.',
  'L. Moreau and P. Missier (Eds.), “PROV-DM: The PROV Data Model,” W3C Recommendation, Apr. 2013.',
  'M. Mitchell et al., “Model cards for model reporting,” in Proc. Conf. Fairness, Accountability, and Transparency (FAT*), 2019, pp. 220–229.',
  'T. Gebru et al., “Datasheets for datasets,” Commun. ACM, vol. 64, no. 12, pp. 86–92, 2021.',
  'V. Gatteschi, F. Lamberti, C. Demartini, C. Pranteda, and V. Santamaría, “Blockchain and smart contracts for insurance: Is the technology mature enough?,” Future Internet, vol. 10, no. 2, Art. no. 20, 2018.',
  'Regulation (EU) 2024/1689 of the European Parliament and of the Council (Artificial Intelligence Act), Official Journal of the European Union, Jul. 2024.',
  'National Institute of Standards and Technology, “Artificial Intelligence Risk Management Framework (AI RMF 1.0),” NIST AI 100-1, 2023.',
  'ISO/IEC 42001:2023, Information technology — Artificial intelligence — Management system, 2023.',
  'A. R. Wasil, J. Clymer, D. Krueger, E. Dardaman, S. Campos, and E. R. Murphy, “Affirmative safety: An approach to risk management for high-risk AI,” arXiv:2406.15371, 2024.',
  'Hyperledger Foundation, “Hyperledger Caliper documentation,” v0.6.0. [Online]. Available: https://hyperledger-caliper.github.io/caliper/',
  'D. J. Bernstein, N. Duif, T. Lange, P. Schwabe, and B.-Y. Yang, “High-speed high-security signatures,” J. Cryptographic Engineering, vol. 2, no. 2, pp. 77–89, 2012.',
  'Coalition for Content Provenance and Authenticity, “C2PA Technical Specification.” [Online]. Available: https://c2pa.org/specifications/',
  'J. Cohen, “A coefficient of agreement for nominal scales,” Educ. Psychol. Meas., vol. 20, no. 1, pp. 37–46, 1960.',
  'Insurance Information Institute, “Background on: Insurance fraud.” [Online]. Available: https://www.iii.org/article/background-on-insurance-fraud',
];
refs.forEach((r, i) => body.push(new Paragraph({ children: runs(`[${i + 1}] ${r}`, { size: 19 }), spacing: { after: 60 }, indent: { left: 440, hanging: 440 } })));

const doc = new Document({
  creator: 'Draft', title: 'Affirmative AI Insurance: A Blockchain-Assured Provenance Framework for Emerging AI Risks',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '(%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(process.argv[2] || 'manuscript.docx', b); console.log('written'); });
