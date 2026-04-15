import { execa } from 'execa';
import { PreflightError } from './errors.js';
import { PREREQ_BOOTSTRAP_HINT } from './preflight.js';

export type KindLogger = {
  debug: (msg: string) => void;
  info: (msg: string) => void;
};

export type KindEnsureClusterArgs = {
  clusterName: string;
  createIfMissing: boolean;
  logger: KindLogger;
  /** `pipe` hides kind progress (default); `inherit` shows full output (e.g. `--verbose`). */
  stdio?: 'inherit' | 'pipe';
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

export async function kindEnsureCluster({
  clusterName,
  createIfMissing,
  logger,
  stdio,
}: KindEnsureClusterArgs): Promise<{ created: boolean }> {
  if (!(await kindIsInstalled())) {
    throw new PreflightError('Missing required dependency: kind', [
      'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation',
      PREREQ_BOOTSTRAP_HINT,
    ]);
  }

  const clusters = await kindListClusters();
  if (clusters.includes(clusterName)) {
    logger.debug(`kind cluster already exists: ${clusterName}`);
    return { created: false };
  }

  if (!createIfMissing) {
    throw new PreflightError(`kind cluster "${clusterName}" not found`, [
      `Re-run with --create-cluster to provision ${clusterName}`,
    ]);
  }

  logger.debug(`kind create cluster ${clusterName}`);
  await execa('kind', ['create', 'cluster', '--name', clusterName], { stdio: stdio ?? 'pipe' });
  return { created: true };
}

