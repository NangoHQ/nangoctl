import { Command } from 'commander';
import { z } from 'zod';

import { getGlobalCliOptions } from '../../core/context.js';
import { PreflightError } from '../../core/errors.js';
import { getDefaultProfile } from '../../core/profile.js';
import { getLocalPaths, writeFile0600 } from '../../core/paths.js';
import { readState, writeState } from '../../core/state.js';
import { Kubectl } from '../../core/kubectl.js';
import { ProcRunner } from '../../core/proc.js';
import { defaultKubeContextForKind } from '../../core/local/materialize.js';
import { renderJson } from '../../core/output/render.js';
import {
  applyAwsCredentialsSecret,
  buildAwsCredentialsSecretYaml,
  restartNangoWorkloadsForAws,
} from '../../core/aws/syncAwsCredentials.js';

const AwsSyncFlagsSchema = z.object({
  json: z.boolean(),
  verbose: z.boolean(),
  profile: z.string().min(1).optional(),
  awsRegion: z.string().min(1).optional(),
  skipAwsSsoLogin: z.boolean(),
  stateDir: z.string().optional(),
  namespace: z.string().min(1),
  release: z.string().min(1),
  context: z.string().optional(),
});

export function buildLocalAwsCommand(): Command {
  const aws = new Command('aws').description('AWS credentials for Nango workloads in the local cluster');

  const sync = new Command('sync')
    .description(
      'Run `aws sso login` (unless skipped), export credentials via `aws configure export-credentials`, update the cluster Secret, and restart all Nango Deployments'
    )
    .option('--profile <name>', 'AWS CLI profile (default: profile saved by `local install --aws-profile`)')
    .option('--aws-region <name>', 'AWS region (default: ~/.aws/config for profile or AWS_REGION)')
    .option('--skip-aws-sso-login', 'Skip `aws sso login` when the SSO session is already valid', false)
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--namespace <ns>', 'Kubernetes namespace', getDefaultProfile().namespace)
    .option('--release <name>', 'Helm release name', getDefaultProfile().release)
    .option('--context <name>', 'Kubernetes context (default: from local state or kind-<clusterName>)')
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Stream kubectl output', false)
    .action(async (opts) => {
      const global = getGlobalCliOptions(sync);
      const parsed = AwsSyncFlagsSchema.safeParse({
        json: Boolean(opts.json ?? global.json),
        verbose: Boolean(opts.verbose ?? global.verbose),
        profile: opts.profile,
        awsRegion: opts.awsRegion,
        skipAwsSsoLogin: Boolean(opts.skipAwsSsoLogin),
        stateDir: opts.stateDir,
        namespace: opts.namespace,
        release: opts.release,
        context: opts.context ?? global.context,
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const flags = parsed.data;
      const paths = await getLocalPaths(flags.stateDir);
      const state = await readState(paths.stateFile);
      if (!state) {
        throw new PreflightError('No local install state found. Run `nangoctl local install` first.', []);
      }

      const profileName = flags.profile ?? state.awsProfile;
      if (!profileName) {
        throw new PreflightError(
          'No AWS profile configured. Pass `--profile <name>` or reinstall with `nangoctl local install --aws-profile <name>`.',
          []
        );
      }

      const kubeContext = flags.context ?? state.kubeContext ?? defaultKubeContextForKind(state.clusterName);
      const stdio = flags.verbose ? 'inherit' : 'pipe';

      const proc = new ProcRunner();

      const { secretYaml, region } = await buildAwsCredentialsSecretYaml({
        proc,
        profile: profileName,
        namespace: flags.namespace,
        region: flags.awsRegion,
        skipAwsSsoLogin: flags.skipAwsSsoLogin,
      });

      await writeFile0600(paths.awsCredentialsSecretFile, secretYaml);

      const kubectl = new Kubectl(proc, { kubeContext, namespace: flags.namespace });
      await applyAwsCredentialsSecret({
        kubectl,
        secretYaml,
        kubeContext,
        namespace: flags.namespace,
      });
      await restartNangoWorkloadsForAws({
        kubectl,
        release: flags.release,
        kubeContext,
        namespace: flags.namespace,
        stdio,
      });

      if (flags.profile && flags.profile !== state.awsProfile) {
        await writeState(paths.stateFile, { ...state, awsProfile: flags.profile, updatedAt: new Date().toISOString() });
      }

      if (flags.json) {
        renderJson({
          ok: true,
          profile: profileName,
          region,
          namespace: flags.namespace,
          release: flags.release,
          kubeContext,
          secretFile: paths.awsCredentialsSecretFile,
        });
        return;
      }

      process.stdout.write(
        `AWS credentials updated (region ${region}). Restarted Deployments for release “${flags.release}”.\n`
      );
    });

  aws.addCommand(sync);
  return aws;
}
