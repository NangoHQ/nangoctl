import { PreflightError } from '../errors.js';
import type { ProcRunner } from '../proc.js';
import type { Kubectl } from '../kubectl.js';
import { restartNangoDeployments } from '../restartNangoDeployments.js';

import {
  assertAwsCliAvailable,
  runAwsConfigureGetRegion,
  runAwsExportCredentials,
  runAwsSsoLogin,
} from './exportCredentials.js';
import { renderAwsCredentialsSecretManifest } from './renderAwsSecret.js';

export type BuildAwsSecretOpts = {
  proc: ProcRunner;
  profile: string;
  namespace: string;
  /** When set, skips `aws configure get region` and env fallback. */
  region?: string;
  skipAwsSsoLogin?: boolean;
};

/**
 * SSO login (unless skipped), export short-lived keys, render Secret manifest.
 */
export async function buildAwsCredentialsSecretYaml(opts: BuildAwsSecretOpts): Promise<{ secretYaml: string; region: string }> {
  await assertAwsCliAvailable(opts.proc);
  if (!opts.skipAwsSsoLogin) {
    await runAwsSsoLogin(opts.proc, opts.profile);
  }
  const creds = await runAwsExportCredentials(opts.proc, opts.profile);
  let region = opts.region?.trim();
  if (!region) {
    region = (await runAwsConfigureGetRegion(opts.proc, opts.profile)) ?? process.env.AWS_REGION?.trim() ?? '';
  }
  if (!region) {
    throw new PreflightError(
      'AWS region is unset. Pass `--aws-region` or set `region` under this profile in ~/.aws/config.',
      []
    );
  }
  const secretYaml = renderAwsCredentialsSecretManifest({
    namespace: opts.namespace,
    region,
    creds,
  });
  return { secretYaml, region };
}

export async function applyAwsCredentialsSecret(opts: {
  kubectl: Kubectl;
  secretYaml: string;
  kubeContext?: string;
  namespace: string;
}): Promise<void> {
  await opts.kubectl.applyYaml(opts.secretYaml, { kubeContext: opts.kubeContext, namespace: opts.namespace });
}

/** @deprecated Use {@link restartNangoDeployments} from `restartNangoDeployments.js`. */
export async function restartNangoWorkloadsForAws(opts: {
  kubectl: Kubectl;
  release: string;
  kubeContext?: string;
  namespace: string;
  stdio: 'inherit' | 'pipe';
}): Promise<void> {
  await restartNangoDeployments(opts);
}
