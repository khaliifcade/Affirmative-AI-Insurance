'use strict';
/*
 * AI provenance & affirmative-AI-insurance claims verification chaincode.
 *
 * Keys
 *   MV~<systemId>~<version>   model-version registration (artifact/data/eval hashes)
 *   AT~<systemId>~<txTime>    runtime attestation of the model hash in service
 *   PO~<policyId>             policy
 *   FN~<systemId>~<peril>~<t> first notice of loss
 *   CL~<claimId>              claim + automated verdict
 *
 * Every write takes its time from the ordering service transaction timestamp,
 * never from the client, so backdated evidence is visible as observedAt < txTime.
 */
const { Contract } = require('fabric-contract-api');

const DAY = 86400;
const DUP_WINDOW_DAYS = 7;
const MAX_BACKDATE_SECONDS = DAY; // attestation older than this at commit time is flagged

function txTime(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    const secs = typeof ts.seconds === 'object' && ts.seconds !== null && ts.seconds.low !== undefined
        ? ts.seconds.low : Number(ts.seconds);
    return secs;
}

function isHex64(s) {
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

async function getJSON(ctx, key) {
    const buf = await ctx.stub.getState(key);
    if (!buf || buf.length === 0) {
        return null;
    }
    return JSON.parse(buf.toString());
}

async function putJSON(ctx, key, obj) {
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(obj)));
}

async function rangeJSON(ctx, objectType, attrs) {
    const out = [];
    const it = await ctx.stub.getStateByPartialCompositeKey(objectType, attrs);
    let r = await it.next();
    while (!r.done) {
        out.push({ key: r.value.key, value: JSON.parse(r.value.value.toString()) });
        r = await it.next();
    }
    await it.close();
    return out;
}

class AIProvenanceContract extends Contract {
    constructor() {
        super('aiprov');
    }

    // ------------------------------------------------------------ registry
    async RegisterModelVersion(ctx, systemId, version, artifactHash, dataHash, evalReportHash, knownIssueFlag) {
        for (const h of [artifactHash, dataHash, evalReportHash]) {
            if (!isHex64(h)) {
                throw new Error(`invalid sha256 hex: ${h}`);
            }
        }
        const key = ctx.stub.createCompositeKey('MV', [systemId, version]);
        if (await getJSON(ctx, key)) {
            throw new Error(`model version ${systemId}/${version} already registered (immutable)`);
        }
        const rec = {
            systemId, version, artifactHash, dataHash, evalReportHash,
            knownIssue: String(knownIssueFlag) === 'true',
            registeredAt: txTime(ctx),
            submitter: ctx.clientIdentity.getMSPID(),
        };
        await putJSON(ctx, key, rec);
        ctx.stub.setEvent('ModelVersionRegistered', Buffer.from(JSON.stringify({ systemId, version })));
        return JSON.stringify(rec);
    }

    async RecordAttestation(ctx, systemId, modelHash, observedAt) {
        if (!isHex64(modelHash)) {
            throw new Error('invalid model hash');
        }
        const t = txTime(ctx);
        const obs = Number(observedAt);
        const key = ctx.stub.createCompositeKey('AT', [systemId, String(t).padStart(12, '0'), ctx.stub.getTxID()]);
        const rec = {
            systemId, modelHash, observedAt: obs, committedAt: t,
            backdated: t - obs > MAX_BACKDATE_SECONDS,
            submitter: ctx.clientIdentity.getMSPID(),
        };
        await putJSON(ctx, key, rec);
        return JSON.stringify(rec);
    }

    async IssuePolicy(ctx, policyId, systemId, inceptionTs, limitUsd, deductibleUsd) {
        const key = ctx.stub.createCompositeKey('PO', [policyId]);
        if (await getJSON(ctx, key)) {
            throw new Error(`policy ${policyId} exists`);
        }
        const rec = {
            policyId, systemId, inception: Number(inceptionTs),
            limit: Number(limitUsd), deductible: Number(deductibleUsd), issuedAt: txTime(ctx),
        };
        await putJSON(ctx, key, rec);
        return JSON.stringify(rec);
    }

    // ------------------------------------------------------------- claims
    async FileFNOL(ctx, systemId, peril, incidentTs) {
        const t = Number(incidentTs);
        const prior = await rangeJSON(ctx, 'FN', [systemId, peril]);
        const dup = prior.find((p) => Math.abs(p.value.incidentTs - t) <= DUP_WINDOW_DAYS * DAY);
        const key = ctx.stub.createCompositeKey('FN', [systemId, peril, String(t)]);
        const rec = { systemId, peril, incidentTs: t, filedAt: txTime(ctx),
            duplicateOf: dup ? dup.key : null };
        await putJSON(ctx, key, rec);
        return JSON.stringify(rec);
    }

    /**
     * Files a claim and returns an automated provenance verdict.
     * Checks: (1) the claimed version is registered with the same artefact and
     * evaluation-report hashes, (2) the latest non-backdated attestation before
     * the incident matches the claimed artefact, (3) no known pre-inception
     * defect, (4) the FNOL is not a near-duplicate.
     */
    async FileClaim(ctx, claimId, policyId, version, artifactHash, evalReportHash, incidentTs, peril, amountUsd) {
        const ckey = ctx.stub.createCompositeKey('CL', [claimId]);
        if (await getJSON(ctx, ckey)) {
            throw new Error(`claim ${claimId} exists`);
        }
        const policy = await getJSON(ctx, ctx.stub.createCompositeKey('PO', [policyId]));
        if (!policy) {
            throw new Error(`unknown policy ${policyId}`);
        }
        const sys = policy.systemId;
        const tInc = Number(incidentTs);
        const reasons = [];
        let manualReview = false;

        const mv = await getJSON(ctx, ctx.stub.createCompositeKey('MV', [sys, version]));
        if (!mv) {
            reasons.push('UNREGISTERED_VERSION');
        } else {
            if (mv.artifactHash !== artifactHash) reasons.push('ARTIFACT_HASH_MISMATCH');
            if (mv.evalReportHash !== evalReportHash) reasons.push('EVAL_REPORT_MISMATCH');
            if (mv.knownIssue && mv.registeredAt < policy.inception) reasons.push('KNOWN_PRE_INCEPTION_DEFECT');
        }

        const atts = (await rangeJSON(ctx, 'AT', [sys])).map((a) => a.value);
        if (atts.some((a) => a.backdated && a.modelHash === artifactHash)) {
            reasons.push('BACKDATED_ATTESTATION');
        }
        const valid = atts.filter((a) => !a.backdated && a.observedAt <= tInc)
            .sort((a, b) => b.observedAt - a.observedAt);
        if (valid.length === 0) {
            manualReview = true;
        } else if (valid[0].modelHash !== artifactHash) {
            reasons.push('DEPLOYED_MODEL_MISMATCH');
        }

        const fnols = (await rangeJSON(ctx, 'FN', [sys, peril])).map((f) => f.value);
        const own = fnols.find((f) => f.incidentTs === tInc);
        if (!own) {
            manualReview = true;
        } else if (own.duplicateOf) {
            reasons.push('DUPLICATE_FNOL');
        }
        if (tInc < policy.inception) reasons.push('INCIDENT_BEFORE_INCEPTION');

        const amount = Number(amountUsd);
        const verdict = reasons.length ? 'FLAGGED' : (manualReview ? 'MANUAL_REVIEW' : 'VERIFIED');
        const payable = verdict === 'VERIFIED'
            ? Math.max(0, Math.min(policy.limit, amount - policy.deductible)) : 0;
        const rec = { claimId, policyId, systemId: sys, version, artifactHash, incidentTs: tInc,
            peril, amount, verdict, reasons, provisionalPayable: payable, filedAt: txTime(ctx) };
        await putJSON(ctx, ckey, rec);
        ctx.stub.setEvent('ClaimAdjudicated', Buffer.from(JSON.stringify({ claimId, verdict })));
        return JSON.stringify(rec);
    }

    // ------------------------------------------------------------ queries
    async GetModelVersion(ctx, systemId, version) {
        const r = await getJSON(ctx, ctx.stub.createCompositeKey('MV', [systemId, version]));
        if (!r) throw new Error('not found');
        return JSON.stringify(r);
    }

    async GetClaim(ctx, claimId) {
        const r = await getJSON(ctx, ctx.stub.createCompositeKey('CL', [claimId]));
        if (!r) throw new Error('not found');
        return JSON.stringify(r);
    }

    async GetAttestations(ctx, systemId) {
        return JSON.stringify((await rangeJSON(ctx, 'AT', [systemId])).map((a) => a.value));
    }

    async GetKeyHistory(ctx, objectType, ...attrs) {
        const key = ctx.stub.createCompositeKey(objectType, attrs);
        const it = await ctx.stub.getHistoryForKey(key);
        const out = [];
        let r = await it.next();
        while (!r.done) {
            out.push({ txId: r.value.txId, isDelete: r.value.isDelete,
                value: r.value.value && r.value.value.length ? JSON.parse(r.value.value.toString()) : null });
            r = await it.next();
        }
        await it.close();
        return JSON.stringify(out);
    }
}

module.exports = AIProvenanceContract;
