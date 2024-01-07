/// <reference types="node" />
import { HardhatConfig, Network } from 'hardhat/types';
import path from 'path';
export declare function normalizePathArray(config: HardhatConfig, paths: string[]): string[];
export declare function normalizePath(config: HardhatConfig, userPath: string | undefined, defaultPath: string): string;
export declare const traverse: (dir: string, result?: any[], topDir?: string, filter?: ((name: string, stats: any) => boolean) | undefined) => {
    name: string;
    path: string;
    relativePath: string;
    mtimeMs: number;
    directory: boolean;
}[];
export declare function loadHardhatDeploy(deploymentsPath: string, network: Network, onlyABIAndAddress?: boolean, expectedChainId?: string, truffleChainId?: string): {
    [name: string]: {
        address: string;
        abi: any;
    };
};
export declare function loadHardhatIgnition(deploymentsPath: string, network: Network, expectedChainId?: string): {
    [name: string]: {
        address: string;
        abi: any;
    };
};
//# sourceMappingURL=utils.d.ts.map