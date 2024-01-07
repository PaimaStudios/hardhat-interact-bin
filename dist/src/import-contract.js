"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const ethers_1 = require("ethers");
const fs_1 = require("fs");
const fs_extra_1 = require("fs-extra");
const config_1 = require("hardhat/config");
const path_1 = __importDefault(require("path"));
(0, config_1.task)('import-contract', 'Import address and ABI definition for a contract to be called with `interact`')
    .addOptionalParam('etherscanUrl', 'Connect to etherscan API at this URL')
    .addOptionalParam('name', 'Label for the download contract definition. Uses Etherscan provided name if not defined')
    .addOptionalPositionalParam('address', 'Contract address to import')
    .setAction(async (args, hre) => {
    const etherscanUrl = args.etherscanUrl || 'https://api.etherscan.io';
    const address = args.address;
    const name = args.name;
    if (!ethers_1.ethers.isAddress(address)) {
        console.error('Provided address is invalid:', address);
        return null;
    }
    const queryUrl = `${etherscanUrl}/api?module=contract&action=getsourcecode&address=${address}`;
    const res = await axios_1.default.get(queryUrl);
    const fileName = `${name || res.data.result[0].ContractName}.json`;
    const dirname = path_1.default.join(hre.config.paths.deployments, hre.network.name);
    (0, fs_extra_1.mkdirpSync)(dirname);
    (0, fs_1.writeFileSync)(path_1.default.join(dirname, fileName), JSON.stringify({
        address,
        abi: JSON.parse(res.data.result[0].ABI),
    }));
    console.log(`contract deployment artifact ${fileName} written successfully`);
    return path_1.default.join(dirname, fileName);
});
//# sourceMappingURL=import-contract.js.map