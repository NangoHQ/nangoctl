import { execa } from 'execa';
import { PreflightError } from './errors.js';
import type { ProcLogger } from './proc.js';

export type KindEnsureClusterArgs = {
    clusterName: string;
    createIfMissing: boolean;
    logger: ProcLogger;
};

export async function kindIsInstalled(): Promise<boolean> {
    try {
        await execa('kind', ['version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export async function kindListClusters(): Promise<string[]> {
    const res = await execa('kind', ['get', 'clusters']);
    return res.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function kindEnsureCluster({ clusterName, createIfMissing, logger }: KindEnsureClusterArgs): Promise<void> {
    if (!(await kindIsInstalled())) {
        throw new PreflightError('Missing required dependency: kind', {
            hint: 'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation'
        });
    }

    const clusters = await kindListClusters();
    if (clusters.includes(clusterName)) {
        logger.debug(`kind cluster already exists: ${clusterName}`);
        return;
    }

    if (!createIfMissing) {
        throw new PreflightError(`kind cluster "${clusterName}" not found`, {
            hint: `Re-run with --create-cluster to provision ${clusterName}`
        });
    }

    logger.info(`Creating kind cluster "${clusterName}"...`);
    await execa('kind', ['create', 'cluster', '--name', clusterName], { stdio: 'inherit' });
}

