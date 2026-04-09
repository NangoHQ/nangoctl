import { Command } from 'commander';
import { z } from 'zod';
import { Helm } from '../../core/helm.js';
import { Kubectl } from '../../core/kubectl.js';
import { confirm } from '../../core/prompt.js';
import { getDefaultContext, getDefaultStateDir, getDefaultNamespace, getDefaultRelease } from '../../core/defaults.js';
import { renderError, renderJson } from '../../core/output/render.js';

const schema = z.object({
  context: z.string().optional(),
  namespace: z.string().optional(),
  release: z.string().optional(),
  yes: z.boolean().optional(),
  deleteNamespace: z.boolean().optional(),
  deletePvcs: z.boolean().optional(),
  purgeState: z.boolean().optional(),
  stateDir: z.string().optional()
});

export function buildLocalUninstallCommand(): Command {
  const cmd = new Command('uninstall')
    .description('Uninstall local Nango release safely')
    .option('--context <kubecontext>', 'Kube context (advanced)', getDefaultContext())
    .option('--namespace <ns>', 'Namespace', getDefaultNamespace())
    .option('--release <name>', 'Helm release name', getDefaultRelease())
    .option('--state-dir <path>', 'State directory (advanced)', getDefaultStateDir())
    .option('--yes', 'Skip confirmation prompts', false)
    .option('--delete-namespace', 'Delete namespace after uninstall', false)
    .option('--delete-pvcs', 'Delete PVCs in namespace (destructive)', false)
    .option('--purge-state', 'Delete local state dir (destructive)', false)
    .option('--json', 'Machine-readable output', false)
    .action(async (opts) => {
      const parsed = schema.safeParse(opts);
      if (!parsed.success) {
        renderError(parsed.error);
        process.exitCode = 2;
        return;
      }

      const { context, namespace, release, yes, deleteNamespace, deletePvcs, purgeState, stateDir } = parsed.data;

      const destructive = Boolean(deleteNamespace || deletePvcs || purgeState);
      if (!yes) {
        const ok = await confirm(
          destructive
            ? `This will uninstall '${release}' and perform destructive cleanup. Continue?`
            : `This will uninstall '${release}' from namespace '${namespace}'. Continue?`
        );
        if (!ok) {
          if (opts.json) {
            renderJson({ ok: true, cancelled: true });
          }
          return;
        }
      }

      const helm = new Helm({ context, namespace });
      const kubectl = new Kubectl({ context, namespace });

      await helm.uninstall({ release });

      if (deletePvcs) {
        await kubectl.deleteAllPvcs();
      }
      if (deleteNamespace) {
        await kubectl.deleteNamespace(namespace);
      }
      if (purgeState && stateDir) {
        await kubectl.deleteLocalPath(stateDir);
      }

      if (opts.json) {
        renderJson({ ok: true, release, namespace, deleted: { deletePvcs, deleteNamespace, purgeState } });
      }
    });

  return cmd;
}

