import { Command } from 'commander';
import chalk from 'chalk';
import { z } from 'zod';

import { createCmd } from '../../core/command.js';
import { CliError } from '../../core/errors.js';
import { getDefaultNamespace, getDefaultRelease } from '../../core/defaults.js';
import { Helm } from '../../core/helm.js';
import { Kubectl } from '../../core/kubectl.js';
import {
  formatLocalStatusHuman,
  gatherLocalStatus,
  localStatusToJson,
} from '../../core/local/gatherLocalStatus.js';
import { JsonOut, StdoutOut } from '../../core/output/output.js';
import { getLocalPaths } from '../../core/paths.js';
import { readState } from '../../core/state.js';
import { parseDurationMs } from '../../core/time.js';

const StatusSchema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  namespace: z.string().min(1).default(getDefaultNamespace()),
  release: z.string().min(1).default(getDefaultRelease()),
  context: z.string().optional(),
  watch: z.boolean().default(false),
  interval: z.string().default('3s'),
  stateDir: z.string().optional(),
});

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function buildLocalStatusCommand(): Command {
  return new Command('status')
    .description('Show local Nango status (Helm release, Deployments, Services, Pods, image tags)')
    .option('--namespace <ns>', 'Kubernetes namespace', getDefaultNamespace())
    .option('--release <name>', 'Helm release name', getDefaultRelease())
    .option('--context <kubecontext>', 'kubectl context override')
    .option('--state-dir <dir>', 'Override nangoctl state directory (see NANGOCTL_STATE_DIR)')
    .option('--watch', 'Refresh until Ctrl+C', false)
    .option('--interval <duration>', 'Poll interval with --watch (e.g. 3s, 5m)', '3s')
    .option('--json', 'Print machine-readable JSON', false)
    .option('--verbose', 'Reserved for future extra diagnostics', false)
    .action(
      createCmd(StatusSchema, async (opts, ctx) => {
        if (opts.watch && opts.json) {
          throw new CliError('STATUS_WATCH_JSON', 'Use --watch without --json (watch mode is human-only).');
        }

        const intervalMs = parseDurationMs(opts.interval);
        if (intervalMs < 1000) {
          throw new CliError('STATUS_INTERVAL_TOO_SHORT', 'Minimum --interval is 1s.');
        }

        const paths = await getLocalPaths(opts.stateDir);

        const kubectl = new Kubectl(ctx.proc, { kubeContext: opts.context, namespace: opts.namespace });
        const helm = new Helm(ctx.proc, { kubeContext: opts.context });

        const runOnce = async () => {
          const state = await readState(paths.stateFile);
          return await gatherLocalStatus({
            kubectl,
            helm,
            namespace: opts.namespace,
            release: opts.release,
            statePath: paths.stateFile,
            state,
          });
        };

        if (opts.watch) {
          process.stderr.write(
            chalk.dim(`Watching (Ctrl+C to exit); interval ${opts.interval}\n\n`)
          );
          for (;;) {
            const report = await runOnce();
            (ctx.out as StdoutOut).write(formatLocalStatusHuman(report));
            await sleep(intervalMs);
            (ctx.out as StdoutOut).write(
              '\n' + chalk.dim(`── refreshed ${new Date().toISOString()} ──\n\n`)
            );
          }
        }

        const report = await runOnce();
        if (opts.json) {
          (ctx.out as JsonOut).write(localStatusToJson(report));
        } else {
          (ctx.out as StdoutOut).write(formatLocalStatusHuman(report));
        }
      })
    );
}
