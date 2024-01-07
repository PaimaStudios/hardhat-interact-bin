"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeployments = exports.traverse = exports.normalizePath = exports.normalizePathArray = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function normalizePathArray(config, paths) {
    const newArray = [];
    for (const value of paths) {
        if (value) {
            newArray.push(normalizePath(config, value, value));
        }
    }
    return newArray;
}
exports.normalizePathArray = normalizePathArray;
function normalizePath(config, userPath, defaultPath) {
    if (userPath === undefined) {
        userPath = path_1.default.join(config.paths.root, defaultPath);
    }
    else {
        if (!path_1.default.isAbsolute(userPath)) {
            userPath = path_1.default.normalize(path_1.default.join(config.paths.root, userPath));
        }
    }
    return userPath;
}
exports.normalizePath = normalizePath;
// adopted from hardhat-deploy's function: https://github.com/wighawag/hardhat-deploy/blob/f96f725a9f5ac46493a7cc18e95f1fb6258f48c2/src/utils.ts
const traverse = function (dir, result = [], topDir, filter // TODO any is Stats
) {
    fs_1.default.readdirSync(dir).forEach(name => {
        const fPath = path_1.default.resolve(dir, name);
        const stats = fs_1.default.statSync(fPath);
        if ((!filter && !name.startsWith('.')) || (filter && filter(name, stats))) {
            const fileStats = {
                name,
                path: fPath,
                relativePath: path_1.default.relative(topDir || dir, fPath),
                mtimeMs: stats.mtimeMs,
                directory: stats.isDirectory(),
            };
            if (fileStats.directory) {
                result.push(fileStats);
                return (0, exports.traverse)(fPath, result, topDir || dir, filter);
            }
            result.push(fileStats);
        }
    });
    return result;
};
exports.traverse = traverse;
function loadDeployments(deploymentsPath, subPath, onlyABIAndAddress, expectedChainId, truffleChainId) {
    const deploymentsFound = {};
    const deployPath = path_1.default.join(deploymentsPath, subPath);
    let filesStats;
    try {
        filesStats = (0, exports.traverse)(deployPath, undefined, undefined, name => !name.startsWith('.') && name !== 'solcInputs');
    }
    catch (e) {
        // console.log('no folder at ' + deployPath);
        return {};
    }
    if (filesStats.length > 0) {
        if (expectedChainId) {
            const chainIdFilepath = path_1.default.join(deployPath, '.chainId');
            if (fs_1.default.existsSync(chainIdFilepath)) {
                const chainIdFound = fs_1.default.readFileSync(chainIdFilepath).toString().trim();
                if (expectedChainId !== chainIdFound) {
                    throw new Error(`Loading deployment in folder '${deployPath}' (with chainId: ${chainIdFound}) for a different chainId (${expectedChainId})`);
                }
            }
            else {
                throw new Error("with hardhat-deploy >= 0.6 you are expected to create a '.chainId' file in the deployment folder");
            }
        }
    }
    let fileNames = filesStats.map(a => a.relativePath);
    fileNames = fileNames.sort((a, b) => {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    });
    for (const fileName of fileNames) {
        if (fileName.substr(fileName.length - 5) === '.json') {
            const deploymentFileName = path_1.default.join(deployPath, fileName);
            let deployment = JSON.parse(fs_1.default.readFileSync(deploymentFileName).toString());
            if (!deployment.address && deployment.networks) {
                if (truffleChainId && deployment.networks[truffleChainId]) {
                    // TRUFFLE support
                    const truffleDeployment = deployment; // TruffleDeployment;
                    deployment.address = truffleDeployment.networks[truffleChainId].address;
                    deployment.transactionHash = truffleDeployment.networks[truffleChainId].transactionHash;
                }
            }
            if (onlyABIAndAddress) {
                deployment = {
                    address: deployment.address,
                    abi: deployment.abi,
                    linkedData: deployment.linkedData,
                };
            }
            const name = fileName.slice(0, fileName.length - 5);
            // console.log('fetching ' + deploymentFileName + '  for ' + name);
            deploymentsFound[name] = deployment;
        }
    }
    return deploymentsFound;
}
exports.loadDeployments = loadDeployments;
//# sourceMappingURL=utils.js.map