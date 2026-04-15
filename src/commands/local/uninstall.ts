import { Command } from 'commander';
import { z } from 'zod';

import { createCmd } from '../../core/command.js';
import { getDefaultProfile, type Profile } from '../../core/profile.js';
import { Helm } from '../../core/helm.js';
import { Kubectl } from '../../core/kubectl.js';
import { confirm } from '../../core/prompt.js';
import { renderJson } from '../../core/output/render.js';

const schema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  context: z.string().optional(),
  namespace: z.string().min(1).default(getDefaultProfile().namespace),
  release: z.string().min(1).default(getDefaultProfile().release),
  yes: z.boolean().default(false),
  deleteNamespace: z.boolean().default(false),
  deletePvcs: z.boolean().default(false),
  purgeState: z.boolean().default(false),
});

export function buildLocalUninstallCommand(): Command {
  const uninstall = new Command('uninstall')
    .description('Uninstall local Nango release safely')
    .option('--namespace <ns>', 'Namespace', getDefaultProfile().namespace)
    .option('--release <name>', 'Helm release name', getDefaultProfile().release)
    .option('--context <kubecontext>', 'Kubernetes context')
    .option('--yes', 'Skip confirmation prompts', false)
    .option('--delete-namespace', 'Delete namespace after uninstall', false)
    .option('--delete-pvcs', 'Delete PVCs in namespace (destructive)', false)
    .option('--purge-state', 'Delete local state dir (destructive)', false)
    .action(
      createCmd(schema, async (opts, ctx) => {
        const profile: Profile = {
          ...getDefaultProfile(),
          namespace: opts.namespace,
          release: opts.release,
          kubeContext: opts.context,
        };

        const destructive = Boolean(opts.deleteNamespace || opts.deletePvcs || opts.purgeState);
        if (!opts.yes) {
          const ok = await confirm(
            destructive
              ? `This will uninstall '${profile.release}' and perform destructive cleanup. Continue?`
              : `This will uninstall '${profile.release}' from namespace '${profile.namespace}'. Continue?`
          );
          if (!ok) {
            if (opts.json) renderJson({ ok: true, cancelled: true });
            return;
          }
        }

        const helm = new Helm(ctx.proc, { kubeContext: profile.kubeContext });
        const kubectl = new Kubectl(ctx.proc, { kubeContext: profile.kubeContext });

        await helm.uninstall({ ref: { namespace: profile.namespace, release: profile.release } });

        if (opts.deletePvcs) {
          await kubectl.run(['delete', 'pvc', '--all'], { namespace: profile.namespace, allowNonZeroExit: true });
        }
        if (opts.deleteNamespace) {
          await kubectl.run(['delete', 'namespace', profile.namespace], { skipNamespace: true, allowNonZeroExit: true });
        }

        if (opts.json) {
          renderJson({
            ok: true,
            release: profile.release,
            namespace: profile.namespace,
            deleted: { deletePvcs: opts.deletePvcs, deleteNamespace: opts.deleteNamespace, purgeState: opts.purgeState },
            note: opts.purgeState ? 'purge-state not implemented yet in scaffold' : undefined,
          });
        } else {
          ctx.out.writeLine('Uninstall complete.');
        }
      })
    );

  return uninstall;
}

