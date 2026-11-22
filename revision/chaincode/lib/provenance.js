'use strict';
/*
 * Provenance chaincode for affirmative AI insurance.
 *
 * v1 (benchmarked in the original submission): FileClaim verifies a claim with range reads over
 *     the partial composite keys ATT~system and FNOL~system~peril, and the FNOL is a separate transaction.
 * v2 (revision): attestations and FNOL records are indexed by day-bucketed deterministic keys, verification
 *     uses a bounded number of point reads, and FNOL and claim are written in one transaction
 *     (FileFNOLAndClaim). Rules R1-R5 are identical in both versions.
 */
const { Contract } = require('fabric-contract-api');

const DAY = 86400;            // seconds
const BACKDATE_TOLERANCE = DAY; // Delta_b, rule R3
const DUP_WINDOW_DAYS = 7;    // w, rule R5
const LOOKBACK_DAYS = 7;      // D, attestation look-back for v2

function txSeconds(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    const s = typeof ts.seconds === 'object' && ts.seconds.low !== undefined ? ts.seconds.low : Number(ts.seconds);
    return s + Math.floor((ts.nanos || 0) / 1e9);
}
const day = (t) => Math.floor(Number(t) / DAY);
const enc = (o) => Buffer.from(JSON.stringify(o));
async function getJSON(ctx, key) {
    const b = await ctx.stub.getState(key);
    return b && b.length ? JSON.parse(b.toString()) : null;
}
async function rangeJSON(ctx, type, attrs) {
    const it = await ctx.stub.getStateByPartialCompositeKey(type, attrs);
    const out = [];
    for (let r = await it.next(); !r.done; r = await it.next()) out.push(JSON.parse(r.value.value.toString()));
    await it.close();
    return out;
}
function decide(rules, haveAttestation, haveFnol) {
    if (rules.length) return 'FLAGGED';
    if (!haveAttestation || !haveFnol) return 'MANUAL_REVIEW';
    return 'VERIFIED';
}

class Provenance extends Contract {
    constructor() { super('Provenance'); }

    // ---------------- records shared by both versions ----------------
    async RegisterModel(ctx, sys, ver, dM, dD, dE, knownIssue) {
        const k = ctx.stub.createCompositeKey('VERSION', [sys, ver]);
        if (await getJSON(ctx, k)) throw new Error(`model version ${sys}/${ver} already registered`);
        await ctx.stub.putState(k, enc({ dM, dD, dE, knownIssue: knownIssue === 'true', tc: txSeconds(ctx) }));
        ctx.stub.setEvent('ModelRegistered', enc({ sys, ver }));
        return 'OK';
    }
    async CreatePolicy(ctx, pid, sys, inception, limit, deductible) {
        const k = ctx.stub.createCompositeKey('POLICY', [pid]);
        await ctx.stub.putState(k, enc({ sys, t0: Number(inception), limit: Number(limit), deductible: Number(deductible) }));
        return 'OK';
    }
    async ReadClaim(ctx, cid) { return JSON.stringify(await getJSON(ctx, ctx.stub.createCompositeKey('CLAIM', [cid]))); }

    async _commonRules(ctx, rules, pid, sys, ver, dM, dE) {
        const V = await getJSON(ctx, ctx.stub.createCompositeKey('VERSION', [sys, ver]));
        if (!V || V.dM !== dM || V.dE !== dE) rules.push('R1');
        const P = await getJSON(ctx, ctx.stub.createCompositeKey('POLICY', [pid]));
        if (V && P && V.knownIssue && V.tc < P.t0) rules.push('R4');
        return V;
    }

    // ---------------- v1: range-read verification ----------------
    async Attest(ctx, sys, digest, observed) {
        const tc = txSeconds(ctx);
        await ctx.stub.putState(ctx.stub.createCompositeKey('ATT', [sys, ctx.stub.getTxID()]), enc({ d: digest, to: Number(observed), tc }));
        return 'OK';
    }
    async SubmitFNOL(ctx, fid, sys, peril, incident) {
        await ctx.stub.putState(ctx.stub.createCompositeKey('FNOL', [sys, peril, fid]), enc({ fid, t: Number(incident) }));
        return 'OK';
    }
    async FileClaim(ctx, cid, pid, sys, ver, dM, dE, peril, incident, fid, amount) {
        const tInc = Number(incident); const rules = [];
        await this._commonRules(ctx, rules, pid, sys, ver, dM, dE);
        const A = await rangeJSON(ctx, 'ATT', [sys]);                       // range read (phantom-protected)
        let aStar = null;
        for (const a of A) if (a.tc < tInc && (!aStar || a.tc > aStar.tc)) aStar = a;
        if (aStar && aStar.d !== dM) rules.push('R2');
        if (A.some((a) => a.to < tInc && a.tc - a.to > BACKDATE_TOLERANCE)) rules.push('R3');
        const own = await getJSON(ctx, ctx.stub.createCompositeKey('FNOL', [sys, peril, fid])); // the notice this claim refers to
        const F = await rangeJSON(ctx, 'FNOL', [sys, peril]);              // range read (phantom-protected)
        if (F.some((f) => f.fid !== fid && Math.abs(f.t - tInc) <= DUP_WINDOW_DAYS * DAY)) rules.push('R5');
        const status = decide(rules, !!aStar, !!own);
        await ctx.stub.putState(ctx.stub.createCompositeKey('CLAIM', [cid]), enc({ status, rules, amount: Number(amount), tx: txSeconds(ctx) }));
        ctx.stub.setEvent('ClaimAdjudicated', enc({ cid, status }));
        return JSON.stringify({ status, rules });
    }

    // ---------------- v2: deterministic, day-bucketed keys ----------------
    async AttestV2(ctx, sys, digest, observed) {
        const tc = txSeconds(ctx); const to = Number(observed); const b = String(day(to));
        await ctx.stub.putState(ctx.stub.createCompositeKey('ATTD', [sys, b]), enc({ d: digest, to, tc }));
        if (tc - to > BACKDATE_TOLERANCE) await ctx.stub.putState(ctx.stub.createCompositeKey('BACKDATE', [sys, b]), enc({ tc, to }));
        return 'OK';
    }
    async FileFNOLAndClaim(ctx, cid, pid, sys, ver, dM, dE, peril, incident, fid, amount) {
        const tInc = Number(incident); const dInc = day(tInc); const rules = [];
        await this._commonRules(ctx, rules, pid, sys, ver, dM, dE);
        let aStar = null; let backdated = false;
        for (let j = 0; j <= LOOKBACK_DAYS; j++) {                         // 2(D+1) point reads at most
            const b = String(dInc - j);
            if (await getJSON(ctx, ctx.stub.createCompositeKey('BACKDATE', [sys, b]))) backdated = true;
            if (!aStar) {
                const x = await getJSON(ctx, ctx.stub.createCompositeKey('ATTD', [sys, b]));
                if (x && x.tc < tInc) aStar = x;
            }
        }
        if (aStar && aStar.d !== dM) rules.push('R2');
        if (backdated) rules.push('R3');
        let dup = false;
        for (let j = -DUP_WINDOW_DAYS; j <= DUP_WINDOW_DAYS; j++) {         // 2w+1 point reads
            const L = await getJSON(ctx, ctx.stub.createCompositeKey('FNOLD', [sys, peril, String(dInc + j)]));
            if (L && L.some((f) => f.fid !== fid && Math.abs(f.t - tInc) <= DUP_WINDOW_DAYS * DAY)) dup = true;
        }
        if (dup) rules.push('R5');
        const kB = ctx.stub.createCompositeKey('FNOLD', [sys, peril, String(dInc)]);   // FNOL written in the same transaction
        const list = (await getJSON(ctx, kB)) || [];
        list.push({ fid, t: tInc });
        await ctx.stub.putState(kB, enc(list));
        const status = decide(rules, !!aStar, true);
        await ctx.stub.putState(ctx.stub.createCompositeKey('CLAIM', [cid]), enc({ status, rules, amount: Number(amount), tx: txSeconds(ctx) }));
        ctx.stub.setEvent('ClaimAdjudicated', enc({ cid, status }));
        return JSON.stringify({ status, rules });
    }
}
module.exports = Provenance;
