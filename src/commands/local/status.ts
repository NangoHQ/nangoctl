import { Command } from 'commander';

import { getDefaultNamespace, getDefaultRelease } from '../../core/defaults.js';
import { renderHuman } from '../../core/output/render.js';

export function buildLocalStatusCommand(): Command {
  return new Command('status')
    .description('Show local Nango status (cluster, helm release, pods)')
    .option('--namespace <ns>', 'Namespace', getDefaultNamespace())
    .option('--release <name>', 'Helm release name', getDefaultRelease())
    .option('--context <kubecontext>', 'Kubernetes context (advanced)')
    .option('--watch', 'Watch status (poll)', false)
    .action(async (opts) => {
      renderHuman({
        title: 'Not implemented yet',
        body: [
          'This is the scaffold for `nangoctl local status`.',
          `Target namespace: ${opts.namespace}`,
          `Release: ${opts.release}`,
          opts.watch ? '(watch mode will be added later)' : '',
        ].filter(Boolean),
      });
    });
}

