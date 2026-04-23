import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import YAML from 'yaml';
import { z } from 'zod';

import { PreflightError } from '../../core/errors.js';
import { runPreflightChecks } from '../../core/preflight.js';
import { getGlobalCliOptions } from '../../core/context.js';
import { createInstallProgress } from '../../core/installProgress.js';
import { renderHuman, renderJson } from '../../core/output/render.js';
import {
  DEFAULT_CONNECT_UI_POD_PORT,
  DEFAULT_LOCAL_CONNECT_UI_PORT,
  DEFAULT_LOCAL_INSTALL_WAIT_TIMEOUT,
  DEFAULT_LOCAL_SERVER_PORT,
  getDefaultClusterName,
  getDefaultHelmRepo,
} from '../../core/defaults.js';
import { getLocalPaths, ensureStateDir, writeFile0600 } from '../../core/paths.js';
import { LOCAL_AWS_CREDENTIALS_SECRET_NAME, readState, writeState, type LocalState } from '../../core/state.js';
import { ProcRunner } from '../../core/proc.js';
import { Kubectl } from '../../core/kubectl.js';
import { Helm } from '../../core/helm.js';
import { kindEnsureCluster } from '../../core/kind.js';
import { materializeLocalRuntime, defaultKubeContextForKind } from '../../core/local/materialize.js';
import { mergeValues } from '../../core/values/mergeValues.js';
import {
  nangoServerDeploymentName,
  nangoServerServiceName,
  opensearchClusterName,
  opensearchLogsHelmReleaseName,
  opensearchMasterStatefulSetName,
} from '../../core/helm/names.js';
import { installLocalOpensearch } from '../../core/opensearch/installLocalOpensearch.js';
import { buildAwsCredentialsSecretYaml } from '../../core/aws/syncAwsCredentials.js';

const InstallFlagsSchema = z.object({
  json: z.boolean(),
  verbose: z.boolean(),
  namespace: z.string().min(1),
  release: z.string().min(1),
  context: z.string().optional(),
  chart: z.string().min(1),
  chartVersion: z.string().optional(),
  values: z.array(z.string()),
  set: z.array(z.string()),
  access: z.enum(['port-forward', 'ingress']),
  serverPort: z.coerce.number().int().min(1).max(65535),
  connectUiPort: z.coerce.number().int().min(1).max(65535),
  createCluster: z.boolean(),
  clusterRuntime: z.enum(['kind']),
  clusterName: z.string().min(1),
  waitTimeout: z.string().min(1),
  lowResource: z.boolean(),
  stateDir: z.string().optional(),
  rotateSecrets: z.boolean(),
  recreatePostgresData: z.boolean(),
  /** Nango container image tag (Helm `global.image.tag`). */
  withImageTag: z.string().min(1).optional(),
  /** Elasticsearch (Bitnami subchart) or OpenSearch (`opensearch/opensearch` second release). */
  logsProvider: z.enum(['elasticsearch', 'opensearch']),
  /** AWS CLI profile (SSO); exports keys into `nango-local-aws-credentials` and wires all workloads. */
  awsProfile: z.string().min(1).optional(),
  awsRegion: z.string().min(1).optional(),
  skipAwsSsoLogin: z.boolean().default(false),
});

export function buildLocalInstallCommand(): Command {
  const cmd = new Command('install')
    .description('Install or upgrade a local Nango runtime in Kubernetes')
    .option('--namespace <ns>', 'Kubernetes namespace', 'nango')
    .option('--release <name>', 'Helm release name', 'nango')
    .option('--context <name>', 'Kube context (advanced)')
    .option('--chart <ref>', 'Helm chart reference', 'nangohq/nango')
    .option('--chart-version <ver>', 'Helm chart version (optional)')
    .option('--values <file>', 'Additional Helm values file', (v, p: string[]) => [...p, v], [])
    .option('--set <key=val>', 'Additional Helm set', (v, p: string[]) => [...p, v], [])
    .option('--access <mode>', 'Access mode: port-forward or ingress', 'port-forward')
    .option('--server-port <port>', 'Localhost port for server API/dashboard', String(DEFAULT_LOCAL_SERVER_PORT))
    .option(
      '--connect-ui-port <port>',
      'Localhost port for Connect UI (maps to NANGO_CONNECT_UI_PORT in the server pod)',
      String(DEFAULT_LOCAL_CONNECT_UI_PORT)
    )
    .option('--create-cluster', 'Create local cluster if missing', true)
    .option('--no-create-cluster', 'Do not create local cluster')
    .option('--cluster-runtime <runtime>', 'Local cluster runtime', 'kind')
    .option('--cluster-name <name>', 'kind cluster name', getDefaultClusterName())
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--wait-timeout <dur>', 'Helm --wait timeout (install + OpenSearch when used)', DEFAULT_LOCAL_INSTALL_WAIT_TIMEOUT)
    .option('--low-resource', 'Use low-resource defaults', false)
    .option('--rotate-secrets', 'Regenerate local secrets (destructive)', false)
    .option(
      '--recreate-postgres-data',
      'Scale down Postgres, delete its PVC and chart secret, then reinstall (fixes "password authentication failed for postgres" when the DB volume predates postgresPassword in values; wipes Postgres data)',
      false
    )
    .option(
      '--with-image-tag <tag>',
      'Nango image tag for all chart images (sets Helm global.image.tag; no `--set` required)',
      undefined
    )
    .option(
      '--logs-provider <provider>',
      'Logs backend: elasticsearch (Bitnami subchart) or opensearch (separate Helm release)',
      'elasticsearch'
    )
    .option(
      '--aws-profile <name>',
      'AWS CLI profile (runs `aws sso login` unless `--skip-aws-sso-login`); creates Secret and injects into all Nango pods'
    )
    .option('--aws-region <region>', 'AWS region for exported credentials (default: profile config or AWS_REGION env)')
    .option('--skip-aws-sso-login', 'Skip `aws sso login` when credentials are already fresh', false)
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Show full kind/Helm/kubectl output (default is concise progress only)', false)
    .action(async (opts) => {
      const global = getGlobalCliOptions(cmd);
      const parsed = InstallFlagsSchema.safeParse({
        json: Boolean(opts.json ?? global.json),
        verbose: Boolean(opts.verbose ?? global.verbose),
        namespace: opts.namespace,
        release: opts.release,
        context: opts.context ?? global.context,
        chart: opts.chart,
        chartVersion: opts.chartVersion,
        values: opts.values,
        set: opts.set,
        access: opts.access,
        serverPort: opts.serverPort,
        connectUiPort: opts.connectUiPort,
        createCluster: opts.createCluster,
        clusterRuntime: opts.clusterRuntime,
        clusterName: opts.clusterName,
        waitTimeout: opts.waitTimeout,
        lowResource: opts.lowResource,
        stateDir: opts.stateDir,
        rotateSecrets: Boolean(opts.rotateSecrets),
        recreatePostgresData: Boolean(opts.recreatePostgresData),
        withImageTag: opts.withImageTag,
        logsProvider: opts.logsProvider,
        awsProfile:
          typeof opts.awsProfile === 'string' && opts.awsProfile.trim().length > 0 ? opts.awsProfile.trim() : undefined,
        awsRegion:
          typeof opts.awsRegion === 'string' && opts.awsRegion.trim().length > 0 ? opts.awsRegion.trim() : undefined,
        skipAwsSsoLogin: Boolean(opts.skipAwsSsoLogin),
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const ctx = parsed.data;
      const progress = createInstallProgress({ json: ctx.json, verbose: ctx.verbose });
      const substdio = ctx.verbose ? 'inherit' : 'pipe';

      try {
        if (!ctx.json) {
          progress.header();
        }

        let ph = progress.phase('Checking prerequisites (Docker, kubectl, Helm, kind)');
        await runPreflightChecks({
          requireDocker: ctx.clusterRuntime === 'kind' && ctx.createCluster,
          requireHelm: true,
          requireKubectl: true,
          requireKind: ctx.clusterRuntime === 'kind' && ctx.createCluster,
        });
        ph.succeed();

        const paths = await getLocalPaths(ctx.stateDir);
        await ensureStateDir(paths);

        const proc = new ProcRunner();
        const kubeContext = ctx.context ?? defaultKubeContextForKind(ctx.clusterName);

        if (ctx.clusterRuntime === 'kind') {
          ph = progress.phase('Preparing local Kubernetes cluster (kind)');
          const { created } = await kindEnsureCluster({
            clusterName: ctx.clusterName,
            createIfMissing: ctx.createCluster,
            stdio: substdio,
            logger: {
              debug: (m: string) => {
                if (ctx.verbose) process.stderr.write(`${m}\n`);
              },
              info: (m: string) => {
                if (ctx.verbose) process.stderr.write(`${m}\n`);
              },
            },
          });
          ph.succeed(
            created
              ? `Created cluster “${ctx.clusterName}” (context ${kubeContext})`
              : `Using existing cluster “${ctx.clusterName}”`
          );
        }

        const kubectl = new Kubectl(proc, { kubeContext, namespace: ctx.namespace });
        const helm = new Helm(proc, { kubeContext });

        ph = progress.phase('Verifying kubectl and Helm');
        await kubectl.preflight();
        await helm.preflight();
        ph.succeed();

        ph = progress.phase('Ensuring Kubernetes namespace');
        await kubectl.ensureNamespace(ctx.namespace, { kubeContext });
        ph.succeed(ctx.namespace);

        if (ctx.recreatePostgresData) {
          ph = progress.phase('Recreating PostgreSQL data volume');
          const sts = `${ctx.release}-postgresql`;
          const pvc = `data-${sts}-0`;
          const pgSecret = `${ctx.release}-postgresql`;
          await kubectl.run(['scale', `statefulset/${sts}`, '--replicas=0'], {
            kubeContext,
            namespace: ctx.namespace,
            allowNonZeroExit: true,
            stdio: substdio,
          });
          await kubectl.run(['wait', '--for=delete', `pod/${sts}-0`, '--timeout=120s'], {
            kubeContext,
            namespace: ctx.namespace,
            allowNonZeroExit: true,
            stdio: substdio,
          });
          await kubectl.run(['delete', 'pvc', pvc, '--ignore-not-found'], {
            kubeContext,
            namespace: ctx.namespace,
            stdio: substdio,
          });
          await kubectl.run(['delete', 'secret', pgSecret, '--ignore-not-found'], {
            kubeContext,
            namespace: ctx.namespace,
            stdio: substdio,
          });
          ph.succeed();
        }

        if (ctx.logsProvider === 'opensearch') {
          const osCluster = opensearchClusterName(ctx.release);
          ph = progress.phase('Installing OpenSearch for logs (Helm release)');
          await installLocalOpensearch({
            helm,
            paths,
            clusterName: osCluster,
            helmRelease: opensearchLogsHelmReleaseName(ctx.release),
            namespace: ctx.namespace,
            waitTimeout: ctx.waitTimeout,
            stdio: substdio,
          });
          ph.succeed();

          ph = progress.phase('Confirming OpenSearch StatefulSet is ready');
          await kubectl.rolloutStatusStatefulSet(opensearchMasterStatefulSetName(osCluster), {
            kubeContext,
            namespace: ctx.namespace,
            timeout: ctx.waitTimeout,
            stdio: substdio,
          });
          ph.succeed();
        }

        let awsSecretYaml: string | undefined;
        if (ctx.awsProfile) {
          ph = progress.phase('AWS SSO login and exporting credentials');
          const built = await buildAwsCredentialsSecretYaml({
            proc,
            profile: ctx.awsProfile,
            namespace: ctx.namespace,
            region: ctx.awsRegion,
            skipAwsSsoLogin: ctx.skipAwsSsoLogin,
          });
          awsSecretYaml = built.secretYaml;
          await writeFile0600(paths.awsCredentialsSecretFile, awsSecretYaml);
          ph.succeed(`AWS region ${built.region}`);
        }

        ph = progress.phase('Generating Nango configuration (ConfigMap, Secret, Helm values)');
        let seed: string;
        const existingState = await readState(paths.stateFile);
        if (existingState && !ctx.rotateSecrets) {
          seed = existingState.seed;
        } else {
          seed = randomBytes(32).toString('hex');
          await writeFile0600(paths.seedFile, `${seed}\n`);
        }

        const materialized = await materializeLocalRuntime({
          namespace: ctx.namespace,
          release: ctx.release,
          serverPortLocalhost: ctx.serverPort,
          connectUiPortLocalhost: ctx.connectUiPort,
          seed,
          lowResource: ctx.lowResource,
          imageTag: ctx.withImageTag,
          logsProvider: ctx.logsProvider,
          awsCredentialsSecretName: ctx.awsProfile ? LOCAL_AWS_CREDENTIALS_SECRET_NAME : undefined,
        });

        await writeFile0600(paths.configMapManifestFile, materialized.configMapYaml);
        await writeFile0600(paths.secretManifestFile, materialized.secretYaml);

        let mergedForHelm = materialized.mergedValues;
        for (const vf of ctx.values) {
          const extra = YAML.parse(await readFile(vf, 'utf8')) as Record<string, unknown>;
          mergedForHelm = mergeValues(mergedForHelm, extra);
        }
        const mergedYaml = YAML.stringify(mergedForHelm);
        await writeFile0600(paths.generatedValuesFile, mergedYaml);
        ph.succeed();

        ph = progress.phase('Applying ConfigMap and Secret to the cluster');
        const applyDocs = [materialized.configMapYaml, materialized.secretYaml];
        if (awsSecretYaml) applyDocs.push(awsSecretYaml);
        await kubectl.applyYaml(`${applyDocs.join('\n---\n')}\n`, { kubeContext, namespace: ctx.namespace });
        ph.succeed();

        ph = progress.phase('Fetching Helm chart repository');
        await helm.repoAddIfMissing({ ...getDefaultHelmRepo(), stdio: substdio });
        await helm.repoUpdate({ stdio: substdio });
        ph.succeed();

        ph = progress.phase('Installing Nango with Helm (may take several minutes)');
        const valuesFiles = [paths.generatedValuesFile, ...ctx.values];
        await helm.installOrUpgrade({
          ref: { namespace: ctx.namespace, release: ctx.release },
          chart: ctx.chart,
          chartVersion: ctx.chartVersion,
          valuesFiles,
          set: ctx.set,
          createNamespace: true,
          wait: true,
          timeout: ctx.waitTimeout,
          stdio: substdio,
        });
        ph.succeed('Helm release is deployed');

        ph = progress.phase('Confirming Nango server deployment is ready');
        await kubectl.rolloutStatusDeployment(nangoServerDeploymentName(ctx.release), {
          kubeContext,
          namespace: ctx.namespace,
          timeout: '3m',
          stdio: substdio,
        });
        ph.succeed();

        const now = new Date().toISOString();
        const nextState: LocalState = {
          version: 1,
          clusterRuntime: 'kind',
          clusterName: ctx.clusterName,
          kubeContext,
          namespace: ctx.namespace,
          release: ctx.release,
          chartRef: ctx.chart,
          chartVersion: ctx.chartVersion,
          seed,
          serverLocalPort: ctx.serverPort,
          connectUiLocalPort: ctx.connectUiPort,
          logsProvider: ctx.logsProvider,
          ...(ctx.awsProfile ? { awsProfile: ctx.awsProfile } : {}),
          createdAt: existingState?.createdAt ?? now,
          updatedAt: now,
        };
        await writeState(paths.stateFile, nextState);

        const out = {
          ok: true,
          namespace: ctx.namespace,
          release: ctx.release,
          kubeContext,
          chart: ctx.chart,
          chartVersion: ctx.chartVersion ?? null,
          imageTag: ctx.withImageTag ?? null,
          logsProvider: ctx.logsProvider,
          awsProfile: ctx.awsProfile ?? null,
          serverUrl: `http://127.0.0.1:${ctx.serverPort}`,
          connectUiUrl: `http://127.0.0.1:${ctx.connectUiPort}`,
          portForwardHint: `kubectl --context ${kubeContext} -n ${ctx.namespace} port-forward svc/${nangoServerServiceName(ctx.release)} ${ctx.serverPort}:80`,
          connectUiPortForwardHint: `kubectl --context ${kubeContext} -n ${ctx.namespace} port-forward svc/${nangoServerServiceName(ctx.release)} ${ctx.connectUiPort}:${DEFAULT_CONNECT_UI_POD_PORT}`,
          stateDir: paths.stateDir,
          recreatePostgresData: ctx.recreatePostgresData,
          generated: {
            configMap: paths.configMapManifestFile,
            secret: paths.secretManifestFile,
            values: paths.generatedValuesFile,
            ...(awsSecretYaml ? { awsCredentialsSecret: paths.awsCredentialsSecretFile } : {}),
          },
        };

        if (ctx.json) {
          renderJson(out);
          return;
        }

        process.stderr.write('\n');

        const body = [
          `Namespace: ${ctx.namespace}`,
          `Release: ${ctx.release}`,
          `Kube context: ${kubeContext}`,
          ...(ctx.withImageTag ? [`Image tag: ${ctx.withImageTag}`] : []),
          `Logs provider: ${ctx.logsProvider}`,
          ...(ctx.awsProfile ? [`AWS profile: ${ctx.awsProfile} (refresh: nangoctl local aws sync)`] : []),
          `Server (after port-forward): ${out.serverUrl}`,
          `Connect UI (after port-forward): ${out.connectUiUrl}`,
          `Port-forward (server): ${out.portForwardHint}`,
          `Port-forward (Connect UI): ${out.connectUiPortForwardHint}`,
          `State: ${paths.stateDir}`,
        ];
        if (ctx.recreatePostgresData) {
          body.push('PostgreSQL data volume was deleted and reinitialized on this run.');
        }
        renderHuman({
          title: 'Local Nango install complete',
          body,
        });
      } finally {
        progress.dispose();
      }
    });

  return cmd;
}
