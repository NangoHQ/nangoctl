import type { Command } from 'commander';

import { z } from 'zod';
import { kubectl } from '../../core/kubectl.js';
import { CLIError } from '../../core/errors.js';
import { output } from '../../core/output/output.js';
import { resolveLocalContext } from '../../core/local/context.js';

const LogsOptsSchema = z.object({
  service: z.enum(['server', 'persist', 'orchestrator', 'jobs', 'runner', 'all']).default('server'),
  follow: z.boolean().default(true),
  since: z.string().optional(),
  tail: z.number().int().positive().optional(),
  namespace: z.string().optional(),
  context: z.string().optional(),
  json: z.boolean().optional()
});

export function registerLocalLogsCommand(local: Command) {
  local
    .command('logs')
    .description('Stream logs for local Nango services')
    .option('-s, --service <name>', 'Service: server|persist|orchestrator|jobs|runner|all', 'server')
    .option('-f, --follow', 'Follow logs', true)
    .option('--no-follow', 'Do not follow logs')
    .option('--since <duration>', 'Only return logs newer than a relative duration like 1h, 5m')
    .option('--tail <n>', 'Lines of recent log file to display', (v) => Number(v))
    .action(async (rawOpts) => {
      const opts = LogsOptsSchema.safeParse(rawOpts);
      if (!opts.success) throw new CLIError('Invalid options', { cause: opts.error });
      const ctx = await resolveLocalContext({ namespace: opts.data.namespace, context: opts.data.context });

      const selector =
        opts.data.service === 'all'
          ? 'app.kubernetes.io/component'
          : `app.kubernetes.io/component=${opts.data.service}`;

      const args = ['logs', '-n', ctx.namespace, '-l', selector];
      if (opts.data.follow) args.push('-f');
      if (opts.data.since) args.push('--since', opts.data.since);
      if (opts.data.tail) args.push('--tail', String(opts.data.tail));

      output.info(`Tailing logs in namespace ${ctx.namespace} (${opts.data.service})`);
      await kubectl(args, { context: ctx.kubeContext, stdio: 'inherit' });
    });
}

