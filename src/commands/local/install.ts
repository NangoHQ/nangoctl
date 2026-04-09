import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import YAML from 'yaml';
import { z } from 'zod';

import { PreflightError } from '../../core/errors.js';
import { runPreflightChecks } from '../../core/preflight.js';
import { getGlobalCliOptions } from '../../core/context.js';
import { renderHuman, renderJson } from '../../core/output/render.js';
import { getDefaultClusterName, getDefaultHelmRepo } from '../../core/defaults.js';
import { getLocalPaths, ensureStateDir, writeFile0600 } from '../../core/paths.js';
import { readState, writeState, type LocalState } from '../../core/state.js';
import { ProcRunner } from '../../core/proc.js';
import { Kubectl } from '../../core/kubectl.js';
import { Helm } from '../../core/helm.js';
import { kindEnsureCluster } from '../../core/kind.js';
import { materializeLocalRuntime, defaultKubeContextForKind } from '../../core/local/materialize.js';
import { mergeValues } from '../../core/values/mergeValues.js';

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
  createCluster: z.boolean(),
  clusterRuntime: z.enum(['kind']),
  clusterName: z.string().min(1),
  waitTimeout: z.string().min(1),
  lowResource: z.boolean(),
  stateDir: z.string().optional(),
  rotateSecrets: z.boolean(),
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
    .option('--server-port <port>', 'Localhost port for server', '4280')
    .option('--create-cluster', 'Create local cluster if missing', true)
    .option('--no-create-cluster', 'Do not create local cluster')
    .option('--cluster-runtime <runtime>', 'Local cluster runtime', 'kind')
    .option('--cluster-name <name>', 'kind cluster name', getDefaultClusterName())
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--wait-timeout <dur>', 'Wait timeout (e.g. 10m)', '10m')
    .option('--low-resource', 'Use low-resource defaults', false)
    .option('--rotate-secrets', 'Regenerate local secrets (destructive)', false)
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Verbose output', false)
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
        createCluster: opts.createCluster,
        clusterRuntime: opts.clusterRuntime,
        clusterName: opts.clusterName,
        waitTimeout: opts.waitTimeout,
        lowResource: opts.lowResource,
        stateDir: opts.stateDir,
        rotateSecrets: Boolean(opts.rotateSecrets),
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const ctx = parsed.data;
      await runPreflightChecks({
        requireDocker: ctx.clusterRuntime === 'kind' && ctx.createCluster,
        requireHelm: true,
        requireKubectl: true,
        requireKind: ctx.clusterRuntime === 'kind' && ctx.createCluster,
      });

      const paths = await getLocalPaths(ctx.stateDir);
      await ensureStateDir(paths);

      const proc = new ProcRunner();
      const kubeContext = ctx.context ?? defaultKubeContextForKind(ctx.clusterName);

      if (ctx.clusterRuntime === 'kind') {
        await kindEnsureCluster({
          clusterName: ctx.clusterName,
          createIfMissing: ctx.createCluster,
          logger: {
            debug: (m: string) => {
              if (ctx.verbose) process.stderr.write(`${m}\n`);
            },
            info: (m: string) => process.stderr.write(`${m}\n`),
          },
        });
      }

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
        seed,
        lowResource: ctx.lowResource,
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

      const kubectl = new Kubectl(proc, { kubeContext, namespace: ctx.namespace });
      const helm = new Helm(proc, { kubeContext });

      await kubectl.preflight();
      await helm.preflight();

      await kubectl.ensureNamespace(ctx.namespace, { kubeContext });

      const combinedApply = `${materialized.configMapYaml}\n---\n${materialized.secretYaml}\n`;
      await kubectl.applyYaml(combinedApply, { kubeContext, namespace: ctx.namespace });

      await helm.repoAddIfMissing(getDefaultHelmRepo());
      await helm.repoUpdate();

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
      });

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
        serverUrl: `http://127.0.0.1:${ctx.serverPort}`,
        portForwardHint: `kubectl --context ${kubeContext} -n ${ctx.namespace} port-forward svc/${ctx.release}-nango-server-svc ${ctx.serverPort}:80`,
        stateDir: paths.stateDir,
        generated: {
          configMap: paths.configMapManifestFile,
          secret: paths.secretManifestFile,
          values: paths.generatedValuesFile,
        },
      };

      if (ctx.json) {
        renderJson(out);
        return;
      }

      renderHuman({
        title: 'Local Nango install complete',
        body: [
          `Namespace: ${ctx.namespace}`,
          `Release: ${ctx.release}`,
          `Kube context: ${kubeContext}`,
          `Open (after port-forward): ${out.serverUrl}`,
          `Port-forward: ${out.portForwardHint}`,
          `State: ${paths.stateDir}`,
        ],
      });
    });

  return cmd;
}
