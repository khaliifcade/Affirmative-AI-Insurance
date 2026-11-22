'use strict';
// Write path: immutable model-version registrations.
const { Base, h } = require('./common');
class RegisterModel extends Base {
    async submitTransaction() {
        this.txIndex++;
        const sys = this.id('sys');
        await this.invoke('RegisterModelVersion',
            [sys, 'v1', h(`${sys}a`), h(`${sys}d`), h(`${sys}r`), 'false']);
    }
}
module.exports.createWorkloadModule = () => new RegisterModel();
