'use strict';
const { WorkloadModuleBase, req } = require('./common');
class Reg extends WorkloadModuleBase {
  async initializeWorkloadModule(w, tw, r, args, sut, ctx) { await super.initializeWorkloadModule(w, tw, r, args, sut, ctx); this.i = 0; }
  async submitTransaction() {
    const id = `REG_R${this.roundIndex}W${this.workerIndex}N${this.i++}`;
    return this.sutAdapter.sendRequests(req(this.roundArguments.contract, 'RegisterModel', [id, 'v1', 'a', 'b', 'c', 'false']));
  }
}
module.exports.createWorkloadModule = () => new Reg();
