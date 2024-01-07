"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function stageCsv(txn) {
    return `${txn.to},${txn.value || 0},${txn.data}`;
}
exports.default = stageCsv;
//# sourceMappingURL=csv.js.map