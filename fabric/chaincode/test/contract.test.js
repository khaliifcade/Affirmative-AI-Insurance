'use strict';
// Unit tests with an in-memory stub (no Fabric network needed): `npm test`
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const Contract = require('../lib/aiProvenanceContract');

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SEP = '\u0000';

function mockCtx() {
  const state = new Map();
  let now = 1_700_000_000; let tx = 0;
  const stub = {
    getTxTimestamp: () => ({ seconds: { low: now }, nanos: 0 }),
    getTxID: () => `tx${tx}`,
    getState: async (k) => state.get(k),
    putState: async (k, v) => { state.set(k, v); },
    setEvent: () => {},
    createCompositeKey: (t, a) => SEP + t + SEP + a.map((x) => x + SEP).join(''),
    getStateByPartialCompositeKey: async (t, a) => {
      const prefix = SEP + t + SEP + a.map((x) => x + SEP).join('');
      const items = [...state.entries()].filter(([k]) => k.startsWith(prefix)).sort();
      let i = 0;
      return { next: async () => (i < items.length
        ? { done: false, value: { key: items[i][0], value: items[i++][1] } } : { done: true }),
        close: async () => {} };
    },
  };
  return { stub, clientIdentity: { getMSPID: () => 'Org1MSP' },
    tick: (s) => { now += s; tx += 1; }, now: () => now };
}

async function setup(knownIssue = false) {
  const c = new Contract(); const ctx = mockCtx();
  const art = h('model-v1'); const rep = h('report-v1');
  await c.RegisterModelVersion(ctx, 'sys1', 'v1', art, h('data'), rep, String(knownIssue));
  ctx.tick(10 * 86400);
  await c.IssuePolicy(ctx, 'pol1', 'sys1', String(ctx.now()), '10000000', '5000');
  ctx.tick(30 * 86400);
  const tInc = ctx.now();
  await c.RecordAttestation(ctx, 'sys1', art, String(tInc - 60));
  await c.FileFNOL(ctx, 'sys1', 'P1', String(tInc));
  ctx.tick(86400 * 3);
  return { c, ctx, art, rep, tInc };
}

test('honest claim is verified', async () => {
  const { c, ctx, art, rep, tInc } = await setup();
  const r = JSON.parse(await c.FileClaim(ctx, 'c1', 'pol1', 'v1', art, rep, String(tInc), 'P1', '100000'));
  assert.strictEqual(r.verdict, 'VERIFIED'); assert.strictEqual(r.provisionalPayable, 95000);
});

test('registration is immutable', async () => {
  const { c, ctx, art, rep } = await setup();
  await assert.rejects(c.RegisterModelVersion(ctx, 'sys1', 'v1', art, h('x'), rep, 'false'));
});

test('tampered evaluation report is flagged', async () => {
  const { c, ctx, art, tInc } = await setup();
  const r = JSON.parse(await c.FileClaim(ctx, 'c1', 'pol1', 'v1', art, h('clean-report'), String(tInc), 'P1', '1'));
  assert.ok(r.reasons.includes('EVAL_REPORT_MISMATCH'));
});

test('known pre-inception defect is flagged', async () => {
  const { c, ctx, art, rep, tInc } = await setup(true);
  const r = JSON.parse(await c.FileClaim(ctx, 'c1', 'pol1', 'v1', art, rep, String(tInc), 'P1', '1'));
  assert.ok(r.reasons.includes('KNOWN_PRE_INCEPTION_DEFECT'));
});

test('unregistered hot-fix in service is flagged', async () => {
  const c = new Contract(); const ctx = mockCtx();
  const art = h('v1'); const rep = h('r1');
  await c.RegisterModelVersion(ctx, 's', 'v1', art, h('d'), rep, 'false');
  await c.IssuePolicy(ctx, 'p', 's', String(ctx.now()), '1000000', '0');
  ctx.tick(1000); const t = ctx.now();
  await c.RecordAttestation(ctx, 's', h('hotfix'), String(t - 10));
  await c.FileFNOL(ctx, 's', 'P5', String(t));
  ctx.tick(1000);
  const r = JSON.parse(await c.FileClaim(ctx, 'c', 'p', 'v1', art, rep, String(t), 'P5', '10'));
  assert.ok(r.reasons.includes('DEPLOYED_MODEL_MISMATCH'));
});

test('backdated attestation is flagged', async () => {
  const { c, ctx, rep, tInc } = await setup();
  const clean = h('model-v0');
  await c.RegisterModelVersion(ctx, 'sys1', 'v0', clean, h('d0'), rep, 'false');
  await c.RecordAttestation(ctx, 'sys1', clean, String(tInc - 5 * 86400)); // committed ~3 days after incident
  const r = JSON.parse(await c.FileClaim(ctx, 'c1', 'pol1', 'v0', clean, rep, String(tInc), 'P1', '1'));
  assert.ok(r.reasons.includes('BACKDATED_ATTESTATION'));
});

test('near-duplicate FNOL is flagged', async () => {
  const { c, ctx, art, rep, tInc } = await setup();
  const t2 = tInc + 3 * 86400;
  const f = JSON.parse(await c.FileFNOL(ctx, 'sys1', 'P1', String(t2)));
  assert.ok(f.duplicateOf);
  const r = JSON.parse(await c.FileClaim(ctx, 'c2', 'pol1', 'v1', art, rep, String(t2), 'P1', '1'));
  assert.ok(r.reasons.includes('DUPLICATE_FNOL'));
});
