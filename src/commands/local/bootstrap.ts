import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';

import { createCmd } from '../../core/command.js';
import { runLocalBootstrap } from '../../core/bootstrap/runBootstrap.js';
import { NangoctlError } from '../../core/errors.js';
import { JsonOut, StdoutOut } from '../../core/output/output.js';

const schema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  noDocker: z.boolean().default(false),
  /** Commander sets `docker` to false when the user passes `--no-docker`. */
  docker: z.boolean().optional(),
});

function printError(e: NangoctlError): void {
  process.stderr.write(`${chalk.red(e.message)}\n`);
  for (const h of e.hints) {
    process.stderr.write(`  ${h}\n`);
  }
}

export function buildLocalBootstrapCommand(): Command {
  return new Command('bootstrap')
    .description(
      'Install missing prerequisites for local Kubernetes (Docker, kubectl, Helm, kind). Automated on macOS + Homebrew and Linux + snap; partial automation on Windows (winget).'
    )
    .option('--dry-run', 'Print commands without running them', false)
    .option('--no-docker', 'Only install CLI tools (kubectl, Helm, kind), skip Docker', false)
    .option('--json', 'Machine-readable report', false)
    .action(
      createCmd(schema, async (opts, ctx) => {
        try {
          const noDocker = opts.noDocker || opts.docker === false;
          const report = await runLocalBootstrap({
            proc: ctx.proc,
            dryRun: opts.dryRun,
            noDocker,
          });

          if (opts.json) {
            (ctx.out as JsonOut).write({
              platform: report.platform,
              dryRun: report.dryRun,
              noDocker: report.noDocker,
              before: report.before,
              after: report.after ?? null,
              commandsRun: report.commandsRun,
              notes: report.notes,
            });
            return;
          }

          const out = ctx.out as StdoutOut;
          out.writeLine(chalk.bold.cyan('nangoctl local bootstrap'));
          out.writeLine('');
          out.writeLine(`${chalk.dim('Platform:')} ${report.platform}`);
          out.writeLine(`${chalk.dim('Before:')} ${formatPresence(report.before)}`);
          if (report.after) {
            out.writeLine(`${chalk.dim('After:')} ${formatPresence(report.after)}`);
          }
          if (report.commandsRun.length > 0) {
            out.writeLine('');
            out.writeLine(chalk.dim(opts.dryRun ? 'Would run:' : 'Ran:'));
            for (const c of report.commandsRun) {
              out.writeLine(`  ${c}`);
            }
          }
          if (report.notes.length > 0) {
            out.writeLine('');
            for (const n of report.notes) {
              out.writeLine(n);
            }
          }
        } catch (e) {
          if (e instanceof NangoctlError) {
            if (opts.json) {
              (ctx.out as JsonOut).write({
                error: {
                  code: e.code,
                  message: e.message,
                  hints: e.hints,
                },
              });
            } else {
              printError(e);
            }
            process.exitCode = 1;
            return;
          }
          throw e;
        }
      })
    );
}

function formatPresence(p: Record<string, boolean>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${v ? 'ok' : 'missing'}`)
    .join(', ');
}
