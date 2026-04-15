import { Command } from 'commander';
import { z } from 'zod';

import { getGlobalCliOptions } from '../../core/context.js';
import { PreflightError } from '../../core/errors.js';
import { getLocalPaths } from '../../core/paths.js';
import { stopPortForwardFromPidFile } from '../../core/portForward.js';
import { createCommandLogger, renderJson } from '../../core/output/render.js';

const CloseFlagsSchema = z.object({
  json: z.boolean(),
  verbose: z.boolean(),
  stateDir: z.string().optional(),
});

export function buildLocalCloseCommand(): Command {
  const cmd = new Command('close')
    .description('Stop background kubectl port-forward started by `nangoctl local open --detach`')
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (opts) => {
      const global = getGlobalCliOptions(cmd);
      const parsed = CloseFlagsSchema.safeParse({
        json: Boolean(opts.json ?? global.json),
        verbose: Boolean(opts.verbose ?? global.verbose),
        stateDir: opts.stateDir,
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const flags = parsed.data;
      const log = createCommandLogger({ json: flags.json, verbose: flags.verbose });
      const paths = await getLocalPaths(flags.stateDir);

      const result = await stopPortForwardFromPidFile(paths.portForwardPidFile);

      if (flags.json) {
        renderJson({
          ok: result.ok,
          action: 'close',
          message: result.message,
          pidFile: paths.portForwardPidFile,
        });
        return;
      }

      log.info(result.message);
    });

  return cmd;
}
