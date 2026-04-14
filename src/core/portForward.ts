import { spawn } from 'node:child_process';
import { execa, type Subprocess } from 'execa';

import { PreflightError } from './errors.js';

export type PortForwardSpec = {
  namespace: string;
  resource: string; // e.g. svc/server
  localPort: number;
  remotePort: number;
  kubeContext?: string;
};

/**
 * Starts `kubectl port-forward` detached so it keeps running after this process exits.
 * Resolves once the child is still running after a short grace period, or rejects if kubectl exits immediately.
 */
export async function startDetachedPortForward(spec: PortForwardSpec): Promise<void> {
  const args: string[] = [
    ...(spec.kubeContext ? ['--context', spec.kubeContext] : []),
    '-n',
    spec.namespace,
    'port-forward',
    spec.resource,
    `${spec.localPort}:${spec.remotePort}`,
  ];

  let stderr = '';
  const child = spawn('kubectl', args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString();
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
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
      resolve();
    });

    child.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new PreflightError(`Failed to start kubectl: ${err.message}`, ['Install kubectl and ensure it is on PATH.'], err)
      );
    });
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

