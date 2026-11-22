'use strict';
// End-to-end verification: each worker pre-registers a pool of insured systems;
// every transaction then files an FNOL and a claim and receives an automated verdict.
const { Base, h, nowSec } = require('./common');
class FileClaim extends Base {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.pool = roundArguments.poolSize || 20;
        this.fraudShare = roundArguments.fraudShare || 0.1;
        const t0 = nowSec() - 90 * 86400;
        for (let i = 0; i < this.pool; i++) {
            const sys = `cl-r${roundIndex}-w${workerIndex}-${i}`;
            await this.invoke('RegisterModelVersion', [sys, 'v1', h(`${sys}a`), h(`${sys}d`), h(`${sys}r`), 'false']);
            await this.invoke('IssuePolicy', [`pol-${sys}`, sys, String(t0), '10000000', '5000']);
            await this.invoke('RecordAttestation', [sys, h(`${sys}a`), String(nowSec())]);
        }
    }
    async submitTransaction() {
        this.txIndex++;
        const i = this.txIndex % this.pool;
        const sys = `cl-r${this.roundIndex}-w${this.workerIndex}-${i}`;
        const tInc = nowSec() + this.txIndex * 30 * 86400; // keeps incidents outside the duplicate window
        const peril = 'P1';
        await this.invoke('FileFNOL', [sys, peril, String(tInc)]);
        const fraud = Math.random() < this.fraudShare;
        const report = fraud ? h('sanitised-report') : h(`${sys}r`);
        await this.invoke('FileClaim', [this.id('claim'), `pol-${sys}`, 'v1', h(`${sys}a`),
            report, String(tInc), peril, String(50000 + (this.txIndex % 1000) * 100)]);
    }
}
module.exports.createWorkloadModule = () => new FileClaim();
