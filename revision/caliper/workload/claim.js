'use strict';
const { WorkloadModuleBase, req, now, sys } = require('./common');
const PERILS = ['synthetic', 'autonomous', 'hallucination', 'harmful', 'decision', 'privacy', 'adversarial', 'bias', 'ip'];
class Claim extends WorkloadModuleBase {
  async initializeWorkloadModule(w, tw, r, args, sut, ctx) { await super.initializeWorkloadModule(w, tw, r, args, sut, ctx); this.i = 0; }
  async submitTransaction() {
    const a = this.roundArguments; const k = this.i++;
    const s = sys(this.workerIndex, k % a.pool); const peril = PERILS[Math.floor(k / a.pool) % PERILS.length];
    const id = `R${this.roundIndex}W${this.workerIndex}N${k}`; const t = now();
    const claimArgs = ['C' + id, 'P_' + s, s, 'v1', 'hM_' + s, 'hE_' + s, peril, t, 'F' + id, 100000];
    if (a.mode === 'merged') return this.sutAdapter.sendRequests(req(a.contract, 'FileFNOLAndClaim', claimArgs));
    const fnol = req(a.contract, 'SubmitFNOL', ['F' + id, s, peril, t]);
    const claim = req(a.contract, 'FileClaim', claimArgs);
    if (a.mode === 'pipelined') return this.sutAdapter.sendRequests([fnol, claim]);   // FNOL and claim in flight together
    await this.sutAdapter.sendRequests(fnol);                                            // sequential: wait for FNOL commit
    return this.sutAdapter.sendRequests(claim);
  }
}
module.exports.createWorkloadModule = () => new Claim();
