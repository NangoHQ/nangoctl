import { execa } from 'execa';

import { PreflightError } from './errors.js';

/** Shown next to manual install links when a prerequisite is missing. */
export const PREREQ_BOOTSTRAP_HINT =
  'Install missing tools with `nangoctl local bootstrap` (automated on macOS + Homebrew; guided steps elsewhere), or install manually.';

async function isCmdAvailable(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await execa(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export type PrereqTool = 'docker' | 'kubectl' | 'helm' | 'kind';

/** Parallel presence check for local install prerequisites. */
export async function getToolPresence(): Promise<Record<PrereqTool, boolean>> {
  const [docker, kubectl, helm, kind] = await Promise.all([
    isCmdAvailable('docker', ['version']),
    isCmdAvailable('kubectl', ['version', '--client=true']),
    isCmdAvailable('helm', ['version']),
    isCmdAvailable('kind', ['version']),
  ]);
  return { docker, kubectl, helm, kind };
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
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
  }

  if (opts.requireKubectl) {
    const ok = await isCmdAvailable('kubectl', ['version', '--client=true']);
    if (!ok) {
      throw new PreflightError('kubectl is required but was not found or is not working.', [
        'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
  }

  if (opts.requireHelm) {
    const ok = await isCmdAvailable('helm', ['version']);
    if (!ok) {
      throw new PreflightError('Helm is required but was not found or is not working.', [
        'Install Helm 3+: https://helm.sh/docs/intro/install/',
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
  }

  if (opts.requireKind) {
    const ok = await isCmdAvailable('kind', ['version']);
    if (!ok) {
      throw new PreflightError('kind is required but was not found or is not working.', [
        'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation',
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
  }
}

