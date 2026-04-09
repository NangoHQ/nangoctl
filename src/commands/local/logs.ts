import { Command } from 'commander';
import { z } from 'zod';

import { createCmd } from '../../core/command.js';
import { getDefaultNamespace } from '../../core/defaults.js';
import { Kubectl } from '../../core/kubectl.js';

const schema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  namespace: z.string().default(getDefaultNamespace()),
  context: z.string().optional(),
  service: z.enum(['server', 'persist', 'orchestrator', 'jobs', 'runner', 'all']).default('server'),
  follow: z.boolean().default(true),
  since: z.string().optional(),
  tail: z.coerce.number().int().positive().optional(),
});

export function buildLocalLogsCommand(): Command {
  const cmd = new Command('logs')
    .description('Stream logs for local Nango services')
    .option('--namespace <ns>', 'Namespace', getDefaultNamespace())
    .option('--context <kubecontext>', 'Kubernetes context')
    .option('-s, --service <name>', 'Service: server|persist|orchestrator|jobs|runner|all', 'server')
    .option('-f, --follow', 'Follow logs', true)
    .option('--no-follow', 'Do not follow logs')
    .option('--since <duration>', 'Only return logs newer than a relative duration like 1h, 5m')
    .option('--tail <n>', 'Lines of recent log file to display')
    .action(
      createCmd(schema, async (opts, ctx) => {
        const kubectl = new Kubectl(ctx.proc, { kubeContext: opts.context });

        const selector =
          opts.service === 'all' ? 'app.kubernetes.io/component' : `app.kubernetes.io/component=${opts.service}`;

        ctx.out.writeLine(`Tailing logs in namespace ${opts.namespace} (${opts.service})`);
        await kubectl.logsBySelector({
          namespace: opts.namespace,
          selector,
          follow: opts.follow,
          since: opts.since,
          tail: opts.tail,
        });
      })
    );

  return cmd;
}

