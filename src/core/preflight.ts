import { execa } from 'execa';

import { PreflightError } from './errors.js';

async function isCmdAvailable(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await execa(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function runPreflightChecks(opts: {
  requireDocker: boolean;
  requireKubectl: boolean;
  requireHelm: boolean;
  requireKind: boolean;
}): Promise<void> {
  if (opts.requireDocker) {
    const ok = await isCmdAvailable('docker', ['version']);
    if (!ok) {
      throw new PreflightError('Docker is required but was not found or is not working.', [
        'Install Docker Desktop (macOS) or Docker Engine (Linux) and ensure `docker` works.',
      ]);
    }
  }

  if (opts.requireKubectl) {
    const ok = await isCmdAvailable('kubectl', ['version', '--client=true']);
    if (!ok) {
      throw new PreflightError('kubectl is required but was not found or is not working.', [
        'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
      ]);
    }
  }

  if (opts.requireHelm) {
    const ok = await isCmdAvailable('helm', ['version']);
    if (!ok) {
      throw new PreflightError('Helm is required but was not found or is not working.', [
        'Install Helm 3+: https://helm.sh/docs/intro/install/',
      ]);
    }
  }

  if (opts.requireKind) {
    const ok = await isCmdAvailable('kind', ['version']);
    if (!ok) {
      throw new PreflightError('kind is required but was not found or is not working.', [
        'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation',
      ]);
    }
  }
}

