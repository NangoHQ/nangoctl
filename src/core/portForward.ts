import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';

import { execa, type Subprocess } from 'execa';

import { PreflightError } from './errors.js';
import { PREREQ_BOOTSTRAP_HINT } from './preflight.js';

export type PortForwardSpec = {
  namespace: string;
  resource: string; // e.g. svc/server
  localPort: number;
  remotePort: number;
  kubeContext?: string;
};

export type PortForwardMultiSpec = {
  namespace: string;
  resource: string;
  kubeContext?: string;
  /** One kubectl invocation supports multiple `local:remote` mappings. */
  mappings: Array<{ localPort: number; remotePort: number }>;
};

function buildKubectlPortForwardArgs(spec: PortForwardMultiSpec): string[] {
  if (spec.mappings.length === 0) {
    throw new PreflightError('port-forward requires at least one port mapping', []);
  }
  const portArgs = spec.mappings.map((m) => `${m.localPort}:${m.remotePort}`);
  return [
    ...(spec.kubeContext ? ['--context', spec.kubeContext] : []),
    '-n',
    spec.namespace,
    'port-forward',
    spec.resource,
    ...portArgs,
  ];
}

/**
 * Runs `kubectl port-forward` in the foreground (stdio inherited). Ctrl+C / SIGTERM stops kubectl.
 * Use this when you want closing the terminal or stopping the CLI to end port-forwarding.
 */
export async function runForegroundPortForwardMulti(spec: PortForwardMultiSpec): Promise<void> {
  const args = buildKubectlPortForwardArgs(spec);
  const child = spawn('kubectl', args, { stdio: 'inherit' });

  const shutdown = (): void => {
    if (child.pid && !child.killed) {
      child.kill('SIGTERM');
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await new Promise<void>((resolve, reject) => {
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      if (signal === 'SIGTERM' || signal === 'SIGINT') {
        resolve();
        return;
      }
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(
        new PreflightError(`kubectl port-forward exited with code ${code}`, [
          'Check that kubectl works for this cluster and the Nango server Service exists.',
          'Run `nangoctl local install` if you have not installed yet.',
        ])
      );
    });
    child.once('error', (err) => {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      reject(
        new PreflightError(
          `Failed to start kubectl: ${err.message}`,
          ['Install kubectl and ensure it is on PATH.', PREREQ_BOOTSTRAP_HINT],
          err
        )
      );
    });
  });
}

/**
 * Starts `kubectl port-forward` detached so it keeps running after this process exits.
 * Returns the child PID after a short grace period if kubectl stays up.
 */
export async function startDetachedPortForwardMulti(spec: PortForwardMultiSpec): Promise<number> {
  const args = buildKubectlPortForwardArgs(spec);
  let stderr = '';
  const child = spawn('kubectl', args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString();
  });

  const pid = await new Promise<number>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      const p = child.pid;
      if (p === undefined) {
        reject(new PreflightError('kubectl port-forward did not report a PID', []));
        return;
      }
      resolve(p);
    }, 900);

    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        reject(
          new PreflightError(
            `kubectl port-forward failed: ${stderr.trim() || `exit ${code}`}`,
            [
              'Check that kubectl works for this cluster and the Nango server Service exists.',
              'Run `nangoctl local install` if you have not installed yet.',
            ]
          )
        );
        return;
      }
      child.unref();
      reject(new PreflightError('kubectl port-forward exited before becoming ready', []));
    });

    child.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new PreflightError(
          `Failed to start kubectl: ${err.message}`,
          ['Install kubectl and ensure it is on PATH.', PREREQ_BOOTSTRAP_HINT],
          err
        )
      );
    });
  });

  return pid;
}

/** @deprecated Prefer {@link startDetachedPortForwardMulti} with a single mapping. */
export async function startDetachedPortForward(spec: PortForwardSpec): Promise<void> {
  await startDetachedPortForwardMulti({
    namespace: spec.namespace,
    resource: spec.resource,
    kubeContext: spec.kubeContext,
    mappings: [{ localPort: spec.localPort, remotePort: spec.remotePort }],
  });
}

export class PortForwardManager {
  private child: Subprocess | null = null;

  isRunning(): boolean {
    return Boolean(this.child && this.child.exitCode === null);
  }

  async start(spec: PortForwardSpec): Promise<void> {
    if (this.isRunning()) return;

    const args: string[] = ['port-forward', '-n', spec.namespace, spec.resource, `${spec.localPort}:${spec.remotePort}`];
    if (spec.kubeContext) args.unshift('--context', spec.kubeContext);

    this.child = execa('kubectl', args, {
      stdout: 'pipe',
      stderr: 'pipe'
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return;
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
  }
}

/**
 * Stops a detached session recorded in `port-forward.pid` (SIGTERM + remove file).
 */
export async function stopPortForwardFromPidFile(pidFilePath: string): Promise<{
  ok: boolean;
  message: string;
}> {
  let raw: string;
  try {
    raw = await readFile(pidFilePath, 'utf8');
  } catch {
    return { ok: false, message: 'No port-forward session file found.' };
  }
  const pid = parseInt(raw.trim(), 10);
  if (!Number.isFinite(pid)) {
    try {
      await unlink(pidFilePath);
    } catch {
      // ignore
    }
    return { ok: false, message: 'Invalid PID file; removed it.' };
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      try {
        await unlink(pidFilePath);
      } catch {
        // ignore
      }
      return { ok: true, message: `Process ${pid} was not running; removed stale PID file.` };
    }
    throw e;
  }
  await new Promise((r) => setTimeout(r, 200));
  try {
    await unlink(pidFilePath);
  } catch {
    // ignore
  }
  return { ok: true, message: `Stopped kubectl port-forward (pid ${pid}).` };
}
