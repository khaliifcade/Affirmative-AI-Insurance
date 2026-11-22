'use strict';
// Read path: evidence lookup by an adjuster (evaluate only, not ordered).
const { Base, h } = require('./common');
class QueryModel extends Base {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.n = roundArguments.assets || 20;
        for (let i = 0; i < this.n; i++) {
            const sys = `q-r${roundIndex}-w${workerIndex}-${i}`;
            await this.invoke('RegisterModelVersion', [sys, 'v1', h(`${sys}a`), h(`${sys}d`), h(`${sys}r`), 'false']);
        }
    }
    async submitTransaction() {
        this.txIndex++;
        const i = this.txIndex % this.n;
        await this.invoke('GetModelVersion', [`q-r${this.roundIndex}-w${this.workerIndex}-${i}`, 'v1'], true);
    }
}
module.exports.createWorkloadModule = () => new QueryModel();
