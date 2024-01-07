"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function stageGnosisSafe(txn) {
    return `send_custom ${txn.to} ${txn.value || 0} ${txn.data}`;
}
exports.default = stageGnosisSafe;
//# sourceMappingURL=gnosis-safe.js.map