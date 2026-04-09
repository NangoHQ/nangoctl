import { execa, type Subprocess } from 'execa';

export type PortForwardSpec = {
  namespace: string;
  resource: string; // e.g. svc/server
  localPort: number;
  remotePort: number;
  kubeContext?: string;
};

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

