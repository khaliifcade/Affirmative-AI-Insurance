'use strict';
// Unit tests with an in-memory stub that follows Fabric semantics: reads see committed state only,
// writes are applied at commit; the stub records the read set (point keys and range queries).
const assert = require('assert');
const P = require('../lib/provenance');
const DAY = 86400;
class World { constructor() { this.s = new Map(); this.ver = 0; } }
class Stub {
  constructor(w, t, id) { this.w = w; this.t = t; this.id = id; this.writes = new Map(); this.points = []; this.ranges = []; this.events = []; }
  createCompositeKey(type, attrs) { return '\u0000' + [type, ...attrs].join('\u0000') + '\u0000'; }
  async getState(k) { this.points.push(k); const v = this.w.s.get(k); return v ? v.val : Buffer.alloc(0); }
  async putState(k, v) { this.writes.set(k, v); }
  async getStateByPartialCompositeKey(type, attrs) {
    const pre = this.createCompositeKey(type, attrs); this.ranges.push(pre);
    const rows = [...this.w.s.entries()].filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => (a < b ? -1 : 1));
    let i = 0; return { next: async () => (i < rows.length ? { value: { key: rows[i][0], value: rows[i++][1].val }, done: false } : { done: true }), close: async () => {} };
  }
  getTxTimestamp() { return { seconds: this.t, nanos: 0 }; }
  getTxID() { return this.id; }
  setEvent(n, p) { this.events.push(n); }
  commit() { this.w.ver++; for (const [k, v] of this.writes) this.w.s.set(k, { val: v, ver: this.w.ver }); }
}
let n = 0;
async function tx(w, t, fn, ...args) { const st = new Stub(w, t, 'tx' + (++n)); const r = await new P()[fn]({ stub: st }, ...args); st.commit(); return { r, st }; }
const T0 = 1_780_000_000; // base time (s)
async function setup(version) {
  const w = new World();
  await tx(w, T0, 'RegisterModel', 'S1', 'v1', 'hM', 'hD', 'hE', 'false');
  await tx(w, T0, 'RegisterModel', 'S1', 'v2', 'hM2', 'hD', 'hE2', 'true');
  await tx(w, T0, 'CreatePolicy', 'P1', 'S1', String(T0 + 10 * DAY), '10000000', '5000');
  const att = version === 1 ? 'Attest' : 'AttestV2';
  for (let d = 11; d <= 20; d++) await tx(w, T0 + d * DAY, att, 'S1', 'hM', String(T0 + d * DAY - 60));
  return w;
}
const claim = (version) => (version === 1 ? 'FileClaim' : 'FileFNOLAndClaim');
async function file(w, version, cid, ver, dM, dE, peril, tInc, fid) {
  if (version === 1) await tx(w, tInc + 3600, 'SubmitFNOL', fid, 'S1', peril, String(tInc));
  const { r, st } = await tx(w, tInc + 7200, claim(version), cid, 'P1', 'S1', ver, dM, dE, peril, String(tInc), fid, '100000');
  return { ...JSON.parse(r), st };
}
(async () => {
  for (const v of [1, 2]) {
    const tInc = T0 + 20 * DAY + 3600;
    let w = await setup(v);
    let c = await file(w, v, 'C1', 'v1', 'hM', 'hE', 'hall', tInc, 'F1');
    assert.strictEqual(c.status, 'VERIFIED', `v${v} honest`);
    c = await file(w, v, 'C2', 'v1', 'hM', 'hE', 'hall', tInc + DAY, 'F2');
    assert.deepStrictEqual(c.rules, ['R5'], `v${v} duplicate`);
    w = await setup(v);
    c = await file(w, v, 'C3', 'v1', 'hM', 'hEx', 'bias', tInc, 'F3');
    assert.ok(c.rules.includes('R1'), `v${v} sanitised report`);
    w = await setup(v);
    c = await file(w, v, 'C4', 'v1', 'hX', 'hE', 'bias', tInc, 'F4');
    assert.ok(c.rules.includes('R1'), `v${v} unregistered digest`);
    w = await setup(v);
    await tx(w, T0 + 20 * DAY + 60, v === 1 ? 'Attest' : 'AttestV2', 'S1', 'hHOTFIX', String(T0 + 20 * DAY + 30));
    c = await file(w, v, 'C5', 'v1', 'hM', 'hE', 'bias', tInc, 'F5');
    assert.ok(c.rules.includes('R2'), `v${v} misattribution`);
    w = await setup(v);
    await tx(w, T0 + 20 * DAY + 600, v === 1 ? 'Attest' : 'AttestV2', 'S1', 'hM', String(T0 + 17 * DAY));
    c = await file(w, v, 'C6', 'v1', 'hM', 'hE', 'bias', tInc, 'F6');
    assert.ok(c.rules.includes('R3'), `v${v} backdating`);
    w = await setup(v);
    c = await file(w, v, 'C7', 'v2', 'hM2', 'hE2', 'bias', tInc, 'F7');
    assert.ok(c.rules.includes('R4'), `v${v} known defect`);
    w = await setup(v);
    await assert.rejects(tx(w, T0, 'RegisterModel', 'S1', 'v1', 'a', 'b', 'c', 'false'), /already registered/);
    console.log(`v${v}: 8 tests passed`);
  }
  // read-set composition as a function of history length h
  const rows = [];
  for (const h of [10, 100, 1000]) {
    for (const v of [1, 2]) {
      const w = new World();
      await tx(w, T0, 'RegisterModel', 'S1', 'v1', 'hM', 'hD', 'hE', 'false');
      await tx(w, T0, 'CreatePolicy', 'P1', 'S1', String(T0), '1', '1');
      for (let i = 0; i < h; i++) {
        const t = T0 + i * 3600;
        await tx(w, t, v === 1 ? 'Attest' : 'AttestV2', 'S1', 'hM', String(t - 10));
      }
      const tInc = T0 + h * 3600 + 7200;
      const c = await file(w, v, 'C', 'v1', 'hM', 'hE', 'hall', tInc, 'F');
      const st = c.st;
      const rangeRows = st.ranges.reduce((a, pre) => a + [...w.s.keys()].filter((k) => k.startsWith(pre)).length, 0);
      rows.push({ h, v, points: st.points.length, ranges: st.ranges.length, rangeRows });
    }
  }
  console.log(JSON.stringify(rows));
})().catch((e) => { console.error(e); process.exit(1); });
