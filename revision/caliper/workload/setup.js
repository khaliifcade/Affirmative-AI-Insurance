'use strict';
const { WorkloadModuleBase, req, now, sys } = require('./common');
class Setup extends WorkloadModuleBase {
  async initializeWorkloadModule(w, tw, r, args, sut, ctx) { await super.initializeWorkloadModule(w, tw, r, args, sut, ctx); this.i = 0; }
  async submitTransaction() {
    const c = this.roundArguments.contract; const s = sys(this.workerIndex, this.i++); const t = now();
    await this.sutAdapter.sendRequests([
      req(c, 'RegisterModel', [s, 'v1', 'hM_' + s, 'hD_' + s, 'hE_' + s, 'false']),
      req(c, 'CreatePolicy', ['P_' + s, s, t - 30 * 86400, 10000000, 5000]),
      req(c, 'Attest', [s, 'hM_' + s, t - 5]),
      req(c, 'AttestV2', [s, 'hM_' + s, t - 5]),
    ]);
  }
}
module.exports.createWorkloadModule = () => new Setup();
