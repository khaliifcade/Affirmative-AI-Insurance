'use strict';
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const req = (contract, fn, args) => ({ contractId: contract, contractFunction: fn, contractArguments: args.map(String), readOnly: false, invokerIdentity: 'User1', channel: 'mychannel' });
const now = () => Math.floor(Date.now() / 1000);
const sys = (w, i) => `W${w}S${i}`;
module.exports = { WorkloadModuleBase, req, now, sys };
