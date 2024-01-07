"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const wei_1 = require("@synthetixio/wei");
const chalk_1 = __importDefault(require("chalk"));
const ethers_1 = require("ethers");
require("./type-extensions");
require("@nomicfoundation/hardhat-ethers");
const fs_1 = require("fs");
const config_1 = require("hardhat/config");
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
const prompts_1 = __importDefault(require("prompts"));
const staged_transactions_1 = __importDefault(require("./staged-transactions"));
const utils_1 = require("./utils");
const PROMPT_BACK_OPTION = { title: '↩ BACK' };
(0, config_1.extendConfig)((config, userConfig) => {
    config.paths.deployments = (0, utils_1.normalizePath)(config, userConfig.paths?.deployments, 'deployments');
    if (!config.external) {
        config.external = { deployments: {} };
    }
    if (userConfig.external?.deployments) {
        for (const key of Object.keys(userConfig.external.deployments)) {
            config.external.deployments[key] = (0, utils_1.normalizePathArray)(config, userConfig.external.deployments[key]);
        }
    }
});
(0, config_1.task)('interact', 'Call contracts with CLI')
    .addOptionalParam('privateKey', 'Private key to use to sign txs')
    .addOptionalParam('impersonate', 'Pretend to be the specified address. Runs transactions read-only, can export result to staged transactions file')
    .addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
    .addOptionalParam('blockTag', 'Specify the block tag to interact at, per ethers.js specification', undefined, config_1.types.int)
    .addOptionalParam('batch', 'Execute one command with no logs except the value, and exit', false, config_1.types.boolean)
    .addOptionalParam('driver', 'Format to export staged transactions. Either `gnosis-safe`, `csv`, or `curl` are currently supported.', 'csv')
    .addOptionalParam('out', 'Path which staged transactions should be written to', 'staged-transactions.txt')
    .addOptionalParam('contract', 'Contract to execute')
    .addOptionalParam('func', 'Function to execute')
    .addOptionalParam('value', 'Amount ETH to send to payable function (in ETH units)', 0, config_1.types.float)
    .addOptionalParam('args', 'Arguments for contract and function to execute (json formatted)', '', config_1.types.string)
    .setAction(async (args, hre) => {
    if (args.privateKey && args.impersonate) {
        console.log(chalk_1.default.bold(chalk_1.default.red('Please specify only one of --private-key and --public-key')));
        return 1;
    }
    const ctx = await buildInteractContext(hre, args);
    // -----------------
    // Start interaction
    // -----------------
    if (!args.batch) {
        await printHeader(ctx);
    }
    while (true) {
        if (!ctx.pickContract) {
            ctx.pickContract = await hre.run('interact:pick-contract', {
                contractNames: lodash_1.default.keys(ctx.contracts),
            });
            if (!ctx.pickContract) {
                return null;
            }
        }
        else if (!ctx.pickFunction) {
            if (!args.batch) {
                await printHelpfulInfo(ctx);
            }
            ctx.pickFunction = await hre.run('interact:pick-function', {
                contract: ctx.contracts[ctx.pickContract],
            });
            if (!ctx.pickFunction) {
                ctx.pickContract = null;
            }
        }
        else if (!ctx.currentArgs) {
            const argData = await hre.run('interact:pick-function-args', {
                func: ctx.contracts[ctx.pickContract].interface.getFunction(ctx.pickFunction),
            });
            if (!argData) {
                ctx.pickFunction = null;
            }
            else {
                ctx.currentArgs = argData.args;
                ctx.txnValue = (0, wei_1.wei)(argData.value);
            }
        }
        else {
            const contract = ctx.contracts[ctx.pickContract];
            const functionInfo = contract.interface.getFunction(ctx.pickFunction);
            let result;
            if (functionInfo.constant) {
                result = await hre.run('interact:query', {
                    contract,
                    functionSignature: ctx.pickFunction,
                    args: ctx.currentArgs,
                    blockTag: ctx.blockTag,
                    log: !args.batch,
                });
            }
            else {
                result = await hre.run('interact:execute', {
                    contract,
                    functionSignature: ctx.pickFunction,
                    args: ctx.currentArgs,
                    value: ctx.txnValue.toBN().toBigInt(),
                    log: !args.batch,
                    signer: ctx.signer,
                    impersonate: ctx.impersonate || undefined,
                });
            }
            if (args.batch) {
                return result;
            }
            // return to function select
            ctx.pickFunction = null;
            ctx.currentArgs = null;
        }
    }
});
async function buildInteractContext(hre, args) {
    const { providerUrl, impersonate, blockTag } = args;
    let { privateKey } = args;
    // load private key
    const envPrivateKey = process.env.DEPLOY_PRIVATE_KEY;
    if (!privateKey && envPrivateKey) {
        privateKey = envPrivateKey;
    }
    const provider = providerUrl ? new hre.ethers.JsonRpcProvider(providerUrl) : new hre.ethers.BrowserProvider(hre.network.provider);
    let signer = null;
    if (privateKey) {
        signer = new hre.ethers.Wallet(privateKey, provider);
    }
    else {
        const signers = await hre.ethers.getSigners();
        if (signers && signers.length) {
            signer = signers[0];
        }
    }
    // load contracts
    const contracts = await hre.run('interact:load-contracts', { provider });
    return {
        contracts,
        blockTag,
        hre,
        signer,
        impersonate: impersonate || null,
        stagedTransactionDriver: args.driver ? staged_transactions_1.default[args.driver] : null,
        stagedTransactionOutputFile: args.out || null,
        pickContract: args.contract || null,
        pickFunction: args.func || null,
        currentArgs: args.args ? JSON.parse(args.args) : null,
        txnValue: (0, wei_1.wei)(args.value || 0),
    };
}
async function printHeader(ctx) {
    // retrieve balance of the signer address
    // this isn't always necessary but it serves as a nice test that the provider is working
    // and prevents the UI from lurching later if its queried later
    const signerBalance = ctx.signer ? (0, wei_1.wei)((await ctx.hre.ethers.provider.getBalance(ctx.signer)).toString()) : (0, wei_1.wei)(0);
    console.log(chalk_1.default.green('Interact CLI'));
    console.log(chalk_1.default.gray('Please review this information:'));
    console.log(chalk_1.default.gray('================================================================================'));
    console.log(chalk_1.default.gray(`> Network: ${ctx.hre.network.name}`));
    console.log(chalk_1.default.gray('> Gas price: provider default'));
    console.log(chalk_1.default.gray(`> Block tag: ${ctx.blockTag || 'latest'}`));
    if (ctx.blockTag || ctx.impersonate) {
        console.log(chalk_1.default.gray(`> Read Only: ${ctx.impersonate}`));
    }
    else if (ctx.signer) {
        console.log(chalk_1.default.yellow(`> Read/Write: ${await ctx.signer.getAddress()}`));
        if (signerBalance.gt(1)) {
            console.log(chalk_1.default.green(`> Signer Balance: ${signerBalance.toString(2)}`));
        }
        else if (signerBalance.gt(0.1)) {
            console.log(chalk_1.default.yellow(`> Signer Balance: ${signerBalance.toString(4)}`));
        }
        else {
            console.log(chalk_1.default.red(`> WARNING! Low signer balance: ${signerBalance.toString(4)}`));
        }
    }
    else {
        console.log(chalk_1.default.gray('> No signer specified (check hardhat config or use --private-key)'));
    }
    console.log(chalk_1.default.gray('================================================================================'));
    console.log('\n');
}
function loadHardhatDeployContracts(hre, deploymentsPath, provider) {
    const deployments = (0, utils_1.loadHardhatDeploy)(deploymentsPath, hre.network, true);
    return lodash_1.default.mapValues(deployments, d => new hre.ethers.Contract(d.address, d.abi, provider));
}
function loadHardhatIgnitionContracts(hre, deploymentsPath, provider, chainId) {
    const deployments = (0, utils_1.loadHardhatIgnition)(deploymentsPath, hre.network, chainId.toString());
    return lodash_1.default.mapValues(deployments, d => new hre.ethers.Contract(d.address, d.abi, provider));
}
async function printHelpfulInfo(ctx) {
    if (ctx.pickContract) {
        console.log(chalk_1.default.gray.inverse(`${ctx.pickContract} => ${ctx.contracts[ctx.pickContract].address}`));
    }
    console.log(chalk_1.default.gray(`  * Signer: ${ctx.impersonate ? ctx.impersonate : ctx.signer ? await ctx.signer.getAddress() : 'None'}`));
    console.log('\n');
    /* console.log(gray('  * Recent contracts:'));
    for (let i = 0; i < recentContracts.length; i++) {
        const contract = recentContracts[i];
        console.log(gray(`    ${contract.name}: ${contract.address}`));
    }*/
}
(0, config_1.subtask)('interact:load-contracts', 'Returns `ethers.Contract` objects which can be queried or executed against for this project')
    .addOptionalParam('provider', 'ethers.Provider which should be attached to the contract', null, config_1.types.any)
    .setAction(async ({ provider }, hre) => {
    // hardhat-deploy and hardhat-ignition use different standards for representing deployed contracts on disk
    // we try both to support whichever is being used
    let contracts = {};
    // hardhat-deploy
    {
        const deploymentPaths = [];
        deploymentPaths.push(hre.config.paths.deployments);
        if (hre.config.external.deployments && hre.config.external.deployments[hre.network.name]) {
            deploymentPaths.push(...hre.config.external.deployments[hre.network.name]);
        }
        for (const deploymentPath of deploymentPaths) {
            contracts = {
                ...contracts,
                ...loadHardhatDeployContracts(hre, deploymentPath, provider),
            };
        }
    }
    // hardhat-ignition
    {
        const chainId = Number(await hre.network.provider.request({
            method: 'eth_chainId',
        }));
        if (hre.config.paths.ignition != null) {
            const deploymentsPath = path_1.default.join(hre.config.paths.ignition, 'deployments');
            contracts = {
                ...contracts,
                ...loadHardhatIgnitionContracts(hre, deploymentsPath, provider, chainId),
            };
        }
    }
    return contracts;
});
(0, config_1.subtask)('interact:pick-contract', 'Shows an interactive UI to select a contract. The selected contract name is returned')
    .addParam('contractNames', 'Name of contracts which can be selected', null, config_1.types.any)
    .addParam('contracts', 'Name of contracts which can be selected', null, config_1.types.any)
    .setAction(async ({ contractNames }) => {
    const { pickedContract } = await prompts_1.default.prompt([
        {
            type: 'autocomplete',
            name: 'pickedContract',
            message: 'Pick a CONTRACT:',
            choices: contractNames.sort().map(s => ({ title: s })),
            suggest: suggestBySubtring,
        },
    ]);
    return pickedContract;
});
(0, config_1.subtask)('interact:pick-function', 'Shows an interactive UI to select a function to execute. The selected function signature is returned')
    .addParam('contract', 'Contract to select function from', null, config_1.types.any)
    .setAction(async ({ contract }) => {
    const functionFragments = [];
    for (const fragment of contract.interface.fragments) {
        if (fragment instanceof ethers_1.ethers.FunctionFragment) {
            functionFragments.push(fragment);
        }
    }
    const choices = functionFragments
        .map(fragment => fragment.format())
        .sort()
        .map(s => ({ title: s }));
    choices.unshift(PROMPT_BACK_OPTION);
    const { pickedFunction } = await prompts_1.default.prompt([
        {
            type: 'autocomplete',
            name: 'pickedFunction',
            message: 'Pick a FUNCTION:',
            choices,
            suggest: suggestBySubtring,
        },
    ]);
    return pickedFunction === PROMPT_BACK_OPTION.title ? null : pickedFunction;
});
(0, config_1.subtask)('interact:pick-function-args', 'Shows an interactive UI to specify the arguments (and if its payable, the eth to send) for a function. The arguments array is returned')
    .addParam('func', 'ethers function fragment to retrieve arguments for', null, config_1.types.any)
    .setAction(async ({ func }) => {
    const args = [];
    let value = (0, wei_1.wei)(0).toBN().toBigInt();
    if (func.payable) {
        const { txnValue } = await prompts_1.default.prompt([
            {
                type: 'number',
                name: 'txnValue',
                message: 'Function is payable. ETH AMOUNT (in eth units):',
            },
        ]);
        value = (0, wei_1.wei)(txnValue).toBN().toBigInt();
    }
    for (const input of func.inputs) {
        const rawValue = await promptInputValue(input);
        if (!rawValue) {
            return null;
        }
        args.push(rawValue);
    }
    return { args, value };
});
(0, config_1.subtask)('interact:query', 'Executes a read-only query, returning the result')
    .addParam('contract', 'Interact context', null, config_1.types.any)
    .addParam('functionSignature', 'Which function to query')
    .addParam('args', 'Array of arguments to the function call', null, config_1.types.any)
    .addOptionalParam('blockTag', 'Perform archive query on the given block tag', 'latest', config_1.types.any)
    .addParam('log', 'Set to `true` to print diagnostic and user-friendly info', false, config_1.types.boolean)
    .setAction(async ({ contract, functionSignature, args, blockTag, log, }, hre) => {
    const functionInfo = contract.interface.getFunction(functionSignature);
    let result = [];
    try {
        result = await contract[functionSignature].staticCallResult(...args, {
            blockTag,
        });
    }
    catch (err) {
        console.error('failed query:', err);
        return null;
    }
    if (log) {
        for (let i = 0; i < (functionInfo.outputs?.length || 0); i++) {
            const output = functionInfo.outputs[i];
            console.log(chalk_1.default.cyan(`  ↪ ${output.name || ''}(${output.type}):`), printReturnedValue(output, result[i]));
        }
    }
    return result;
});
(0, config_1.subtask)('interact:execute', 'Executes a mutable txn and wait for it to complete, or appends it to staged transactions, returning diagnostic information as necessary')
    .addParam('contract', 'Interact context', null, config_1.types.any)
    .addParam('functionSignature', 'Which function to query')
    .addParam('args', 'Array of arguments to the function call', null, config_1.types.any)
    .addOptionalParam('value', 'Amount of eth to send to a payable function', BigInt(0), config_1.types.any)
    .addOptionalParam('impersonate', 'Account to pretend to run the transaction as for verification and transaction staging')
    .addOptionalParam('out', 'File', 'staged-txns.txt')
    .addOptionalParam('signer', 'Account to sign with, if the transaction is to be executed immediately', null, config_1.types.any)
    .addParam('log', 'Set to `true` to print diagnostic and user-friendly info', false, config_1.types.boolean)
    .setAction(async ({ contract, functionSignature, args, value, log, signer, impersonate, out, }, hre) => {
    if (!signer) {
        const signers = await hre.ethers.getSigners();
        if (signers && signers.length) {
            signer = await signers[0];
        }
    }
    const callData = contract.interface.encodeFunctionData(functionSignature, args);
    let txn = null;
    // estimate gas
    try {
        txn = await contract[functionSignature].populateTransaction(...args, {
            from: impersonate || (await signer.getAddress()),
        });
        const estimatedGas = await contract[functionSignature].estimateGas(...args, {
            from: impersonate || (await signer.getAddress()),
        });
        if (log) {
            console.log(chalk_1.default.gray(`  > calldata: ${txn.data}`));
            console.log(chalk_1.default.gray(`  > estimated gas required: ${estimatedGas}`));
            console.log(chalk_1.default.gray(`  > gas: ${JSON.stringify(lodash_1.default.pick(txn, 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'))}`));
            console.log(chalk_1.default.green(chalk_1.default.bold('  ✅ txn will succeed')));
        }
    }
    catch (err) {
        console.error(chalk_1.default.red('Error: Could not populate transaction (is it failing?)'));
    }
    if (impersonate) {
        if (log) {
            const { confirmation } = await prompts_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'confirmation',
                    message: 'Write staged transaction?',
                },
            ]);
            if (!confirmation) {
                return null;
            }
        }
        // write a staged transaction
        await hre.run('interact:stage-txn', {
            txn,
            contract,
            functionSignature,
            args,
            value,
            out,
        });
        if (log)
            console.log(`> staged transaction appended to ${out}`);
    }
    else if (signer != null) {
        if (log) {
            const { confirmation } = await prompts_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'confirmation',
                    message: 'Send transaction?',
                },
            ]);
            if (!confirmation) {
                return null;
            }
        }
        let txInfo;
        try {
            txInfo = await signer.sendTransaction({
                to: await contract.getAddress(),
                data: callData,
                value,
            });
            if (log) {
                console.log('> hash: ', txInfo.hash);
                console.log('confirming...');
            }
            const receipt = (await txInfo.wait());
            if (log) {
                await logTxSucceed(hre, receipt);
            }
            return receipt.hash;
        }
        catch (err) {
            logTxFail(err);
            return txInfo?.hash;
        }
    }
    else {
        console.log('not submitting transaction because in read-only mode');
    }
});
(0, config_1.subtask)('interact:stage-txn', 'Executes a mutable txn and wait for it to complete, or appends it to staged transactions, returning diagnostic information as necessary')
    .addParam('txn', 'Transaction to stage', null, config_1.types.any)
    .addParam('contract', 'Interact context', null, config_1.types.any)
    .addParam('functionSignature', 'Which function to query')
    .addParam('args', 'Array of arguments to the function call', null, config_1.types.any)
    .addOptionalParam('value', 'Amount of eth to send to a payable function', '0', config_1.types.any)
    .addOptionalParam('out', 'File to export staged transactions to', 'staged-txns.txt')
    .setAction(async ({ txn, out }) => {
    (0, fs_1.appendFileSync)(out, `${staged_transactions_1.default.csv(txn)}\n`);
});
async function promptInputValue(input) {
    const name = input.name || input.type;
    const message = input.name ? `${input.name} (${input.type})` : input.type;
    for (let i = 0; i < 5; i++) {
        try {
            const answer = await prompts_1.default.prompt([
                {
                    type: 'text',
                    message,
                    name,
                },
            ]);
            if (!answer[name]) {
                return null;
            }
            // if there is a problem this will throw and user will be forced to re-enter data
            return parseInput(input, answer[name]);
        }
        catch (err) {
            console.error('invalid input: ', err);
        }
    }
}
function parseInput(input, rawValue) {
    const requiresBytes32Util = input.type.includes('bytes32');
    const isArray = input.type.includes('[]');
    const isNumber = input.type.includes('int');
    let processed = isArray ? JSON.parse(rawValue) : rawValue;
    if (requiresBytes32Util) {
        if (isArray) {
            processed = processed.map((item) => ethers_1.ethers.encodeBytes32String(item));
        }
        else {
            processed = ethers_1.ethers.encodeBytes32String(processed);
        }
    }
    if (isNumber) {
        if (isArray) {
            processed = processed.map((item) => parseWeiValue(item));
        }
        else {
            processed = parseWeiValue(processed);
        }
    }
    if (isArray) {
        processed = processed.map((value) => boolify(value));
    }
    else {
        processed = boolify(processed);
    }
    // const processed = preprocessInput(input, type, hre);
    if (processed !== rawValue) {
        console.log(chalk_1.default.gray(`  > processed inputs (${isArray ? processed.length : '1'}):`, processed));
    }
    // Encode user's input to validate it
    ethers_1.ethers.AbiCoder.defaultAbiCoder().encode([input.type], [processed]);
    return processed;
}
function parseWeiValue(v) {
    if (v.includes('.')) {
        return (0, wei_1.wei)(v).toBN().toBigInt();
    }
    else {
        return (0, wei_1.wei)(v, 0, true).toBN().toBigInt();
    }
}
function printReturnedValue(output, value) {
    if (output?.baseType === 'tuple') {
        // handle structs
        return '\n' + output?.components.map((comp, ind) => `${comp.name}: ${printReturnedValue(comp, value[ind])}`).join('\n');
    }
    else if (output?.baseType === 'array' && Array.isArray(value)) {
        // handle arrays
        return value.map(item => printReturnedValue(output.arrayChildren, item)).join(', ');
    }
    else if (output?.type.startsWith('uint') || output?.type.startsWith('int')) {
        return `${value.toString()} (${(0, wei_1.wei)(value).toString(5)})`;
    }
    else if (output?.type.startsWith('bytes')) {
        return `${value} (${Buffer.from(value.slice(2), 'hex').toString('utf8')})`;
    }
    else {
        return value;
    }
}
// Avoid 'false' and '0' being interpreted as bool = true
function boolify(value) {
    if (value === 'false' || value === '0')
        return 0;
    return value;
}
async function logTxSucceed(hre, receipt) {
    console.log(chalk_1.default.green('  ✅ Success'));
    // console.log('receipt', JSON.stringify(receipt, null, 2));
    // Print tx hash
    console.log(chalk_1.default.gray(`    tx hash: ${receipt.hash}`));
    // Print gas used
    console.log(chalk_1.default.gray(`    gas used: ${receipt.gasUsed.toString()}`));
    // Print emitted events
    if (receipt.logs && receipt.logs.length > 0) {
        const contractsByAddress = lodash_1.default.keyBy(await hre.run('interact:load-contracts'), 'address');
        for (let i = 0; i < receipt.logs.length; i++) {
            const log = receipt.logs[i];
            try {
                // find contract matching address of the log
                const logContract = contractsByAddress[log.address];
                const parsedLog = logContract.interface.parseLog(log);
                console.log(chalk_1.default.gray(`    log ${i}:`), chalk_1.default.cyan(parsedLog.name));
                for (let j = 0; j < (parsedLog.args.length || 0); j++) {
                    const output = parsedLog.args[j];
                    const paramType = logContract.interface.getEvent(parsedLog.name).inputs[j];
                    console.log(chalk_1.default.cyan(`  ↪ ${output.name || ''}(${output.type}):`), printReturnedValue(paramType, output));
                }
            }
            catch (err) {
                console.log(chalk_1.default.gray(`    log ${i}: unable to decode log - ${JSON.stringify(log)}`));
            }
        }
    }
}
function logTxFail(error) {
    console.log(chalk_1.default.red('  ❌ Error'));
    function findReason(innerError) {
        if (typeof innerError === 'string') {
            return innerError;
        }
        else {
            if (innerError.hasOwnProperty('reason')) {
                return innerError.reason;
            }
            else if (innerError.hasOwnProperty('error')) {
                return findReason(innerError.error);
            }
        }
        return error.toString();
    }
    const reason = findReason(error);
    if (reason)
        console.log(chalk_1.default.red(`    Reason: ${reason}`));
    console.log(chalk_1.default.gray(JSON.stringify(error, null, 2)));
}
// filters choices by subtrings that don't have to be continuous e.g. 'ybtc' will match 'SynthsBTC'
const suggestBySubtring = (input, choices) => Promise.resolve(choices.filter(choice => {
    const titleStr = choice.title.toLowerCase();
    let index = 0;
    for (const c of input.toLowerCase()) {
        index = titleStr.indexOf(c, index);
        if (index === -1) {
            return false; // not found
        }
        else {
            index += 1; // start from next index
        }
    }
    return true;
}));
//# sourceMappingURL=interact.js.map