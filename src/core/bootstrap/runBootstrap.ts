import { CliError } from '../errors.js';
import type { ProcRunner } from '../proc.js';
import { getToolPresence, type PrereqTool } from '../preflight.js';

export type BootstrapReport = {
  platform: NodeJS.Platform;
  dryRun: boolean;
  noDocker: boolean;
  before: Record<PrereqTool, boolean>;
  /** Present after a real run when tools were installed. */
  after?: Record<PrereqTool, boolean>;
  /** Human-readable shell lines (what ran or would run). */
  commandsRun: string[];
  notes: string[];
};

async function cmdOk(proc: ProcRunner, cmd: string, args: string[]): Promise<boolean> {
  const r = await proc.run(cmd, args, { stdio: 'pipe', allowNonZeroExit: true });
  return r.exitCode === 0;
}

function missingTools(p: Record<PrereqTool, boolean>): PrereqTool[] {
  return (Object.entries(p) as [PrereqTool, boolean][])
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
}

function manualInstallHints(tools: PrereqTool[]): string[] {
  const map: Record<PrereqTool, string> = {
    docker: 'Docker: https://docs.docker.com/get-docker/',
    kubectl: 'kubectl: https://kubernetes.io/docs/tasks/tools/',
    helm: 'Helm: https://helm.sh/docs/intro/install/',
    kind: 'kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation',
  };
  return tools.map((t) => map[t]);
}

/** macOS: Homebrew installs. */
async function bootstrapDarwin(
  proc: ProcRunner,
  opts: { before: Record<PrereqTool, boolean>; noDocker: boolean; dryRun: boolean }
): Promise<{ commandsRun: string[]; notes: string[] }> {
  const commandsRun: string[] = [];
  const notes: string[] = [];

  const hasBrew = await cmdOk(proc, 'brew', ['--version']);

  const formulae: string[] = [];
  if (!opts.before.kubectl) formulae.push('kubernetes-cli');
  if (!opts.before.kind) formulae.push('kind');
  if (!opts.before.helm) formulae.push('helm');

  const wantDockerCask = !opts.noDocker && !opts.before.docker;

  if (!hasBrew) {
    if (formulae.length > 0) {
      commandsRun.push(`brew install ${formulae.join(' ')}`);
    }
    if (wantDockerCask) {
      commandsRun.push('brew install --cask docker');
      notes.push('Open Docker Desktop once after install so `docker version` succeeds.');
    }
    notes.unshift('Homebrew was not found on PATH — install from https://brew.sh , then re-run bootstrap.');
    if (opts.dryRun) {
      return { commandsRun, notes };
    }
    throw new CliError(
      'BOOTSTRAP_NO_BREW',
      'Homebrew was not found. Install it from https://brew.sh and re-run, or install tools manually.',
      { hints: manualInstallHints(missingTools(opts.before)) }
    );
  }

  if (formulae.length > 0) {
    commandsRun.push(`brew install ${formulae.join(' ')}`);
    if (!opts.dryRun) {
      await proc.run('brew', ['install', ...formulae], { stdio: 'inherit' });
    }
  }

  if (wantDockerCask) {
    commandsRun.push('brew install --cask docker');
    notes.push('Open Docker Desktop once after install so `docker version` succeeds.');
    if (!opts.dryRun) {
      await proc.run('brew', ['install', '--cask', 'docker'], { stdio: 'inherit' });
    }
  }

  return { commandsRun, notes };
}

function linuxSnapPlan(before: Record<PrereqTool, boolean>, noDocker: boolean): Array<{ pkg: string; extra: string[] }> {
  const snaps: Array<{ pkg: string; extra: string[] }> = [];
  if (!before.kubectl) snaps.push({ pkg: 'kubectl', extra: ['--classic'] });
  if (!before.helm) snaps.push({ pkg: 'helm', extra: ['--classic'] });
  if (!before.kind) snaps.push({ pkg: 'kind', extra: [] });
  if (!noDocker && !before.docker) snaps.push({ pkg: 'docker', extra: [] });
  return snaps;
}

/** Linux: snap when available (needs sudo, interactive password). */
async function bootstrapLinux(
  proc: ProcRunner,
  opts: { before: Record<PrereqTool, boolean>; noDocker: boolean; dryRun: boolean }
): Promise<{ commandsRun: string[]; notes: string[] }> {
  const commandsRun: string[] = [];
  const notes: string[] = [];
  const hasSnap = await cmdOk(proc, 'snap', ['version']);
  const snaps = linuxSnapPlan(opts.before, opts.noDocker);

  if (!hasSnap) {
    for (const s of snaps) {
      commandsRun.push(`sudo snap install ${s.pkg}${s.extra.length ? ` ${s.extra.join(' ')}` : ''}`);
    }
    if (opts.dryRun) {
      notes.push('`snap` was not found on PATH. Install snapd for your distro, then re-run bootstrap without --dry-run.');
      notes.push('https://snapcraft.io/docs/installing-snapd');
      return { commandsRun, notes };
    }
    throw new CliError(
      'BOOTSTRAP_LINUX_NO_SNAP',
      '`snap` was not found. Install snapd (see https://snapcraft.io/docs/installing-snapd) or install tools manually:',
      {
        hints: [
          ...manualInstallHints(missingTools(opts.before)),
          'Alternatively use macOS with Homebrew: `nangoctl local bootstrap`',
        ],
      }
    );
  }

  notes.push('You may be prompted for your sudo password.');

  for (const s of snaps) {
    const line = `sudo snap install ${s.pkg}${s.extra.length ? ` ${s.extra.join(' ')}` : ''}`;
    commandsRun.push(line);
    if (!opts.dryRun) {
      await proc.run('sudo', ['snap', 'install', s.pkg, ...s.extra], { stdio: 'inherit' });
    }
  }

  if (!opts.noDocker && !opts.before.docker) {
    notes.push('Add your user to the `docker` group if needed: `sudo usermod -aG docker $USER` (log out/in).');
  }

  return { commandsRun, notes };
}

/** Windows: winget for kubectl + helm when available. */
async function bootstrapWin32(
  proc: ProcRunner,
  opts: { before: Record<PrereqTool, boolean>; dryRun: boolean; noDocker: boolean }
): Promise<{ commandsRun: string[]; notes: string[] }> {
  const commandsRun: string[] = [];
  const notes: string[] = [];
  const hasWinget = await cmdOk(proc, 'winget', ['--version']);

  if (!hasWinget) {
    throw new CliError(
      'BOOTSTRAP_WIN_MANUAL',
      'Could not find winget. Install Docker Desktop, kubectl, Helm, and kind manually:',
      { hints: manualInstallHints(missingTools(opts.before)) }
    );
  }

  const wingetBase = [
    'install',
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ] as const;

  if (!opts.before.kubectl) {
    commandsRun.push(
      `winget ${[...wingetBase, '--id', 'Kubernetes.kubectl'].join(' ')}`
    );
    if (!opts.dryRun) {
      await proc.run('winget', [...wingetBase, '--id', 'Kubernetes.kubectl'], { stdio: 'inherit' });
    }
  }

  if (!opts.before.helm) {
    commandsRun.push(`winget ${[...wingetBase, '--id', 'Helm.Helm'].join(' ')}`);
    if (!opts.dryRun) {
      await proc.run('winget', [...wingetBase, '--id', 'Helm.Helm'], { stdio: 'inherit' });
    }
  }

  if (!opts.before.kind) {
    notes.push(
      'kind: install from https://kind.sigs.k8s.io/docs/user/quick-start/#installation or `go install sigs.k8s.io/kind@latest` with Go on PATH.'
    );
  }

  if (!opts.noDocker && !opts.before.docker) {
    notes.push(
      'Docker: install Docker Desktop for Windows from https://docs.docker.com/desktop/install/windows-install/ (large download).'
    );
  }

  return { commandsRun, notes };
}

export async function runLocalBootstrap(opts: {
  proc: ProcRunner;
  dryRun: boolean;
  noDocker: boolean;
}): Promise<BootstrapReport> {
  const before = await getToolPresence();
  const missing = missingTools(before);

  if (missing.length === 0) {
    return {
      platform: process.platform,
      dryRun: opts.dryRun,
      noDocker: opts.noDocker,
      before,
      commandsRun: [],
      notes: ['Docker, kubectl, Helm, and kind are already available.'],
    };
  }

  const platform = process.platform;
  let commandsRun: string[] = [];
  let notes: string[] = [];

  if (platform === 'darwin') {
    const r = await bootstrapDarwin(opts.proc, { before, noDocker: opts.noDocker, dryRun: opts.dryRun });
    commandsRun = r.commandsRun;
    notes = r.notes;
  } else if (platform === 'linux') {
    const r = await bootstrapLinux(opts.proc, { before, noDocker: opts.noDocker, dryRun: opts.dryRun });
    commandsRun = r.commandsRun;
    notes = r.notes;
  } else if (platform === 'win32') {
    const r = await bootstrapWin32(opts.proc, {
      before,
      dryRun: opts.dryRun,
      noDocker: opts.noDocker,
    });
    commandsRun = r.commandsRun;
    notes = r.notes;
  } else {
    throw new CliError('BOOTSTRAP_UNSUPPORTED', `Unsupported platform: ${platform}`, {
      hints: manualInstallHints(missing),
    });
  }

  if (opts.dryRun) {
    return {
      platform,
      dryRun: true,
      noDocker: opts.noDocker,
      before,
      commandsRun,
      notes,
    };
  }

  const after = await getToolPresence();
  const stillMissing = missingTools(after);
  if (stillMissing.length > 0) {
    notes.push(
      `Still missing after bootstrap: ${stillMissing.join(', ')}. Install manually or fix PATH, then re-run \`nangoctl local bootstrap\`.`
    );
  }

  return {
    platform,
    dryRun: false,
    noDocker: opts.noDocker,
    before,
    after,
    commandsRun,
    notes,
  };
}
