import { Command } from 'commander';
import { z } from 'zod';

import { PreflightError } from '../../core/errors.js';
import { runPreflightChecks } from '../../core/preflight.js';
import { getDefaultContext } from '../../core/context.js';
import { renderHuman } from '../../core/output/render.js';

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
  waitTimeout: z.string().min(1),
  lowResource: z.boolean()
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
    .option('--wait-timeout <dur>', 'Wait timeout (e.g. 10m)', '10m')
    .option('--low-resource', 'Use low-resource defaults', false)
    .action(async (opts) => {
      const global = getDefaultContext(cmd);
      const parsed = InstallFlagsSchema.safeParse({
        json: global.json,
        verbose: global.verbose,
        namespace: opts.namespace,
        release: opts.release,
        context: opts.context,
        chart: opts.chart,
        chartVersion: opts.chartVersion,
        values: opts.values,
        set: opts.set,
        access: opts.access,
        serverPort: opts.serverPort,
        createCluster: opts.createCluster,
        clusterRuntime: opts.clusterRuntime,
        waitTimeout: opts.waitTimeout,
        lowResource: opts.lowResource
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const ctx = parsed.data;
      await runPreflightChecks({
        requireDocker: ctx.clusterRuntime === 'kind' && ctx.createCluster,
        requireHelm: true,
        requireKubectl: true,
        requireKind: ctx.clusterRuntime === 'kind' && ctx.createCluster
      });

      renderHuman({
        title: 'Not implemented yet',
        body: [
          'This is the scaffold for `nangoctl local install`.',
          'Next steps will: create/ensure kind cluster, generate local config+secrets, and helm install/upgrade the Nango chart.',
          `Target namespace: ${ctx.namespace}`,
          `Release: ${ctx.release}`,
          `Chart: ${ctx.chart}${ctx.chartVersion ? `@${ctx.chartVersion}` : ''}`
        ]
      });
    });

  return cmd;
}

