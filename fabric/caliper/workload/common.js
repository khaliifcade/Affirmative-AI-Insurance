'use strict';
const crypto = require('crypto');
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const nowSec = () => Math.floor(Date.now() / 1000);

class Base extends WorkloadModuleBase {
    constructor() { super(); this.txIndex = 0; }
    id(prefix) {
        return `${prefix}-r${this.roundIndex}-w${this.workerIndex}-${this.txIndex}`;
    }
    async invoke(fn, args, readOnly = false) {
        return this.sutAdapter.sendRequests({
            contractId: 'aiprov', contractFunction: fn, contractArguments: args,
            invokerIdentity: 'User1', readOnly,
        });
    }
}
module.exports = { Base, h, nowSec };
