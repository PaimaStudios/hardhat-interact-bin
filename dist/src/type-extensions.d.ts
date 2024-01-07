import 'hardhat/types/config';
declare module 'hardhat/types/config' {
    interface HardhatUserConfig {
        external?: {
            deployments?: {
                [networkName: string]: string[];
            };
        };
    }
    interface HardhatConfig {
        external: {
            deployments: {
                [networkName: string]: string[];
            };
        };
    }
    interface ProjectPathsUserConfig {
        deployments?: string;
    }
    interface ProjectPathsConfig {
        deployments: string;
    }
    interface ProjectPathsUserConfig {
        ignition?: string;
    }
    interface ProjectPathsConfig {
        ignition?: string;
    }
}
//# sourceMappingURL=type-extensions.d.ts.map