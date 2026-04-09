import { Command } from 'commander';
import { z } from 'zod';
import { createCmd } from '../../core/command.js';
import { getDefaultProfile, type Profile } from '../../core/profile.js';
import { Helm } from '../../core/helm.js';
import { Kubectl } from '../../core/kubectl.js';
import { renderStatus } from '../../core/status.js';

const schema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  namespace: z.string().default(getDefaultProfile().namespace),
  release: z.string().default(getDefaultProfile().release),
  context: z.string().optional(),
  watch: z.boolean().default(false)
});

export function registerLocalStatus(parent: Command) {
  parent
    .command('status')
    .description('Show local Nango status (cluster, helm release, pods)')
    .option('--namespace <ns>', 'Namespace', getDefaultProfile().namespace)
    .option('--release <name>', 'Helm release name', getDefaultProfile().release)
    .option('--context <kubecontext>', 'Kubernetes context')
    .option('--watch', 'Watch status (poll)', false)
    .action(
      createCmd(schema, async (opts, ctx) => {
        const profile: Profile = {
          ...getDefaultProfile(),
          namespace: opts.namespace,
          release: opts.release,
          kubeContext: opts.context
        };

        const kubectl = new Kubectl(ctx.proc, { kubeContext: profile.kubeContext });
        const helm = new Helm(ctx.proc, { kubeContext: profile.kubeContext });

        const snapshot = await renderStatus({ kubectl, helm, profile, json: opts.json });
        ctx.out.write(snapshot);

        if (opts.watch) {
          ctx.out.writeLine('\n(watch mode not implemented in scaffold)');
        }
      })
    );
}

