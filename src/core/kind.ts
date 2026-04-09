import { execa } from 'execa';
import { PreflightError } from './errors.js';

export type KindLogger = {
  debug: (msg: string) => void;
  info: (msg: string) => void;
};

export type KindEnsureClusterArgs = {
    clusterName: string;
    createIfMissing: boolean;
    logger: KindLogger;
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
        throw new PreflightError('Missing required dependency: kind', [
            'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation',
        ]);
    }

    const clusters = await kindListClusters();
    if (clusters.includes(clusterName)) {
        logger.debug(`kind cluster already exists: ${clusterName}`);
        return;
    }

    if (!createIfMissing) {
        throw new PreflightError(`kind cluster "${clusterName}" not found`, [
            `Re-run with --create-cluster to provision ${clusterName}`,
        ]);
    }

    logger.info(`Creating kind cluster "${clusterName}"...`);
    await execa('kind', ['create', 'cluster', '--name', clusterName], { stdio: 'inherit' });
}

