import type { ProcRunner } from './proc.js';
import { PreflightError } from './errors.js';
import { PREREQ_BOOTSTRAP_HINT } from './preflight.js';

export class Kubectl {
  constructor(
    private readonly proc: ProcRunner,
    private readonly defaults: { kubeContext?: string; namespace?: string } = {}
  ) {}

  async preflight(): Promise<void> {
    const res = await this.proc.run('kubectl', ['version', '--client=true'], {
      allowNonZeroExit: true,
      quiet: true,
    });
    if (res.exitCode !== 0) {
      throw new PreflightError('Missing prerequisite: kubectl', [
        'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
        PREREQ_BOOTSTRAP_HINT,
      ]);
    }
  }

  /** Active kubeconfig context name, if any. */
  async currentContext(): Promise<string | undefined> {
    const res = await this.proc.run('kubectl', ['config', 'current-context'], {
      stdio: 'pipe',
      allowNonZeroExit: true,
    });
    if (res.exitCode !== 0) return undefined;
    const name = res.stdout.trim();
    return name.length > 0 ? name : undefined;
  }

  async applyYaml(yaml: string, opts: { kubeContext?: string; namespace?: string } = {}): Promise<void> {
    const args = this.withDefaults(['apply', '-f', '-'], opts);
    await this.proc.run('kubectl', args, { stdin: yaml, stdio: 'pipe' });
  }

  async ensureNamespace(namespace: string, opts: { kubeContext?: string } = {}): Promise<void> {
    const nsYaml = `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${namespace}\n`;
    await this.applyYaml(nsYaml, { ...opts, namespace: undefined });
  }

  async getPodsWide(opts: { kubeContext?: string; namespace?: string } = {}): Promise<string> {
    const res = await this.proc.run('kubectl', this.withDefaults(['get', 'pods', '-o', 'wide'], opts), {
      quiet: true,
    });
    return res.stdout.trim();
  }

  /**
   * JSON from `kubectl get ... -o json`. On failure returns `ok: false` with stderr/stdout (no throw).
   */
  async getJson(
    args: string[],
    opts: { kubeContext?: string; namespace?: string; skipNamespace?: boolean } = {}
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const res = await this.proc.run('kubectl', this.withDefaults(args, opts), {
      stdio: 'pipe',
      allowNonZeroExit: true,
    });
    if (res.exitCode !== 0) {
      const err = (res.stderr || res.stdout || 'kubectl failed').trim();
      return { ok: false, error: err };
    }
    try {
      return { ok: true, data: JSON.parse(res.stdout) as unknown };
    } catch {
      return { ok: false, error: 'Invalid JSON from kubectl' };
    }
  }

  async logsBySelector(params: {
    selector: string;
    follow?: boolean;
    since?: string;
    tail?: number;
    kubeContext?: string;
    namespace?: string;
  }): Promise<void> {
    const args = this.withDefaults(['logs', '-l', params.selector], params);
    if (params.follow ?? true) args.push('-f');
    if (params.since) args.push('--since', params.since);
    if (params.tail) args.push('--tail', String(params.tail));
    await this.proc.run('kubectl', args, { stdio: 'inherit' });
  }

  /** Raw kubectl for advanced use (e.g. delete pvc, delete ns). */
  async run(
    args: string[],
    opts: {
      kubeContext?: string;
      namespace?: string;
      allowNonZeroExit?: boolean;
      skipNamespace?: boolean;
      stdio?: 'inherit' | 'pipe';
    } = {}
  ): Promise<void> {
    await this.proc.run('kubectl', this.withDefaults(args, opts), {
      stdio: opts.stdio ?? 'inherit',
      allowNonZeroExit: opts.allowNonZeroExit,
    });
  }

  /** Wait for a Deployment rollout (used after Helm for a friendly status line). */
  async rolloutStatusDeployment(
    name: string,
    opts: { kubeContext?: string; namespace?: string; timeout?: string; stdio?: 'inherit' | 'pipe' }
  ): Promise<void> {
    const timeout = opts.timeout ?? '3m';
    await this.run(['rollout', 'status', `deployment/${name}`, `--timeout=${timeout}`], {
      kubeContext: opts.kubeContext,
      namespace: opts.namespace,
      stdio: opts.stdio ?? 'pipe',
    });
  }

  /** Wait for a StatefulSet rollout (e.g. OpenSearch master node). */
  async rolloutStatusStatefulSet(
    name: string,
    opts: { kubeContext?: string; namespace?: string; timeout?: string; stdio?: 'inherit' | 'pipe' }
  ): Promise<void> {
    const timeout = opts.timeout ?? '3m';
    await this.run(['rollout', 'status', `statefulset/${name}`, `--timeout=${timeout}`], {
      kubeContext: opts.kubeContext,
      namespace: opts.namespace,
      stdio: opts.stdio ?? 'pipe',
    });
  }

  private withDefaults(
    args: string[],
    opts: { kubeContext?: string; namespace?: string; skipNamespace?: boolean }
  ): string[] {
    const kubeContext = opts.kubeContext ?? this.defaults.kubeContext;
    const namespace = opts.skipNamespace ? undefined : opts.namespace ?? this.defaults.namespace;
    const out = [...args];
    if (namespace) out.unshift('-n', namespace);
    if (kubeContext) out.unshift('--context', kubeContext);
    return out;
  }
}
