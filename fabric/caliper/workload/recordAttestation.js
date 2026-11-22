'use strict';
// Write path: runtime attestations (highest-volume record type in production).
const { Base, h, nowSec } = require('./common');
class RecordAttestation extends Base {
    async submitTransaction() {
        this.txIndex++;
        const sys = `att-w${this.workerIndex}-${this.txIndex % 50}`;
        await this.invoke('RecordAttestation', [sys, h(`${sys}a`), String(nowSec())]);
    }
}
module.exports.createWorkloadModule = () => new RecordAttestation();
