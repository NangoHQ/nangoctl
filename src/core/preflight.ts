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

/**
 * README pins the supported Helm major. Helm 4 switched the install/upgrade path to server-side
 * apply, which the current Nango chart tickles on duplicate `http`/`https` container ports.
 */
export const REQUIRED_HELM_MAJOR = 3;

async function getHelmMajorVersion(): Promise<number | undefined> {
  try {
    const { stdout } = await execa('helm', ['version', '--short'], { stdio: 'pipe' });
    const m = stdout.match(/v(\d+)\./);
    return m ? Number(m[1]) : undefined;
  } catch {
    return undefined;
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
        `Install Helm ${REQUIRED_HELM_MAJOR}: https://helm.sh/docs/intro/install/`,
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
    const major = await getHelmMajorVersion();
    if (major === undefined) {
      throw new PreflightError('Could not parse Helm version from `helm version --short`.', [
        'Ensure `helm version --short` runs and prints output like `v3.20.2+gabc`.',
      ]);
    }
    if (major !== REQUIRED_HELM_MAJOR) {
      const hints =
        major > REQUIRED_HELM_MAJOR
          ? [
              `Helm ${major}+ defaults to server-side apply, which the Nango chart does not currently support (see README: "kubectl and Helm ${REQUIRED_HELM_MAJOR}").`,
              `Install Helm ${REQUIRED_HELM_MAJOR} side-by-side: \`brew install helm@${REQUIRED_HELM_MAJOR}\` and prepend \`/opt/homebrew/opt/helm@${REQUIRED_HELM_MAJOR}/bin\` to PATH, or use the Helm ${REQUIRED_HELM_MAJOR} binary from https://github.com/helm/helm/releases.`,
            ]
          : [`Upgrade to Helm ${REQUIRED_HELM_MAJOR}: https://helm.sh/docs/intro/install/`];
      throw new PreflightError(`Helm ${REQUIRED_HELM_MAJOR} is required; detected v${major}.x.`, hints);
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

