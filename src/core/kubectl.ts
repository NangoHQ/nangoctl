import { execa } from 'execa';
import { z } from 'zod';
import { NangoctlError, PreflightError } from './errors.js';
import type { Logger } from './output/render.js';

const KubeContext = z.string().min(1);

export interface KubectlOptions {
  context?: string;
  namespace?: string;
  logger: Logger;
}

export async function assertKubectlAvailable(): Promise<void> {
  try {
    await execa('kubectl', ['version', '--client=true'], { stdio: 'ignore' });
  } catch {
    throw new PreflightError('kubectl is required but was not found or is not working.', {
      hint: 'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
    });
  }
}

export async function kubectl(args: string[], opts: KubectlOptions): Promise<{ stdout: string; stderr: string }> {
  const finalArgs = [...args];
  if (opts.context) {
    finalArgs.unshift('--context', KubeContext.parse(opts.context));
  }
  if (opts.namespace && !finalArgs.includes('-n') && !finalArgs.includes('--namespace')) {
    finalArgs.unshift('-n', opts.namespace);
  }

  try {
    const res = await execa('kubectl', finalArgs, { stdio: 'pipe' });
    return { stdout: res.stdout, stderr: res.stderr };
  } catch (e: any) {
    throw new NangoctlError('kubectl command failed.', {
      cause: e,
      details: { args: finalArgs, stderr: e?.stderr, stdout: e?.stdout, exitCode: e?.exitCode },
    });
  }
}

export async function applyYaml(yaml: string, opts: KubectlOptions): Promise<void> {
  try {
    await execa('kubectl', buildArgs(['apply', '-f', '-'], opts), { input: yaml, stdio: 'pipe' });
  } catch (e: any) {
    throw new NangoctlError('Failed to apply Kubernetes manifests.', {
      cause: e,
      details: { stderr: e?.stderr, stdout: e?.stdout },
    });
  }
}

export async function ensureNamespace(namespace: string, opts: KubectlOptions): Promise<void> {
  // Use apply for idempotency.
  const nsYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`;
  await applyYaml(nsYaml, { ...opts, namespace: undefined });
}

export async function getPodsTable(opts: KubectlOptions): Promise<string> {
  const { stdout } = await kubectl(['get', 'pods', '-o', 'wide'], opts);
  return stdout.trim();
}

function buildArgs(args: string[], opts: KubectlOptions): string[] {
  const finalArgs = [...args];
  if (opts.context) {
    finalArgs.unshift('--context', KubeContext.parse(opts.context));
  }
  if (opts.namespace && !finalArgs.includes('-n') && !finalArgs.includes('--namespace')) {
    finalArgs.unshift('-n', opts.namespace);
  }
  return finalArgs;
}

