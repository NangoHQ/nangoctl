import { PreflightError } from './errors.js';
import type { ProcRunner } from './proc.js';

export interface HelmReleaseRef {
  namespace: string;
  release: string;
}

export class Helm {
  constructor(
    private readonly proc: ProcRunner,
    private readonly opts: { kubeContext?: string } = {}
  ) {}

  async preflight(): Promise<void> {
    try {
      await this.proc.run('helm', ['version'], { stdio: 'pipe' });
    } catch {
      throw new PreflightError('Missing prerequisite: helm', [
        'Install Helm 3+ and ensure `helm` is on your PATH.',
      ]);
    }
  }

  async repoAddIfMissing(opts: {
    name: string;
    url: string;
    /** Default `pipe` to keep install output calm; use `inherit` with `--verbose`. */
    stdio?: 'inherit' | 'pipe';
  }): Promise<void> {
    const list = await this.proc.run('helm', ['repo', 'list', '-o', 'json'], { stdio: 'pipe' });
    try {
      const repos = JSON.parse(list.stdout || '[]') as Array<{ name: string; url: string }>;
      if (repos.some((r) => r.name === opts.name)) return;
    } catch {
      // fallthrough
    }
    const stdio = opts.stdio ?? 'pipe';
    await this.proc.run('helm', ['repo', 'add', opts.name, opts.url], { stdio });
  }

  async repoUpdate(opts?: { stdio?: 'inherit' | 'pipe' }): Promise<void> {
    await this.proc.run('helm', ['repo', 'update'], { stdio: opts?.stdio ?? 'pipe' });
  }

  async installOrUpgrade(opts: {
    ref: HelmReleaseRef;
    chart: string;
    chartVersion?: string;
    valuesFiles?: string[];
    set?: string[];
    createNamespace?: boolean;
    wait?: boolean;
    timeout?: string;
    /** Default `pipe` so Kubernetes admission warnings do not flood the terminal; use `inherit` with `--verbose`. */
    stdio?: 'inherit' | 'pipe';
  }): Promise<void> {
    const args = ['upgrade', '--install', opts.ref.release, opts.chart, '--namespace', opts.ref.namespace];
    if (opts.createNamespace) args.push('--create-namespace');
    if (opts.chartVersion) args.push('--version', opts.chartVersion);
    for (const vf of opts.valuesFiles ?? []) args.push('-f', vf);
    for (const s of opts.set ?? []) args.push('--set', s);
    if (opts.wait) args.push('--wait');
    if (opts.timeout) args.push('--timeout', opts.timeout);
    const ctx = this.opts.kubeContext;
    if (ctx) {
      args.unshift('--kube-context', ctx);
    }
    await this.proc.run('helm', args, { stdio: opts.stdio ?? 'pipe' });
  }

  async status(opts: { ref: HelmReleaseRef }): Promise<{ raw: string }> {
    const args = ['status', opts.ref.release, '--namespace', opts.ref.namespace];
    const ctx = this.opts.kubeContext;
    if (ctx) args.unshift('--kube-context', ctx);
    const res = await this.proc.run('helm', args, { stdio: 'pipe' });
    return { raw: res.stdout || res.stderr || '' };
  }

  async uninstall(opts: { ref: HelmReleaseRef; keepHistory?: boolean }): Promise<void> {
    const args = ['uninstall', opts.ref.release, '--namespace', opts.ref.namespace];
    if (opts.keepHistory) args.push('--keep-history');
    const ctx = this.opts.kubeContext;
    if (ctx) args.unshift('--kube-context', ctx);
    await this.proc.run('helm', args, { stdio: 'inherit', allowNonZeroExit: true });
  }
}
