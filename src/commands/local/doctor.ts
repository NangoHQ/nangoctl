import { Command } from 'commander';
import { z } from 'zod';
import { runDoctor } from '../../core/flows/doctor.js';
import { CommandError } from '../../core/errors.js';
import { parseDurationMs } from '../../core/time.js';

const DoctorOptionsSchema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  namespace: z.string().min(1).default('nango'),
  release: z.string().min(1).default('nango'),
  context: z.string().optional(),
  kubeconfig: z.string().optional(),
  timeoutMs: z.number().int().positive().default(parseDurationMs('5m'))
});

export function buildLocalDoctorCommand(): Command {
  const cmd = new Command('doctor')
    .description('Diagnose common local runtime issues (cluster, Helm release, pods)')
    .option('--namespace <ns>', 'Kubernetes namespace', 'nango')
    .option('--release <name>', 'Helm release name', 'nango')
    .option('--context <kubecontext>', 'kubectl context override')
    .option('--kubeconfig <path>', 'kubeconfig path override')
    .option('--timeout <duration>', 'Timeout (e.g. 30s, 5m)', '5m')
    .option('--json', 'Machine readable output', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (opts) => {
      const parsed = DoctorOptionsSchema.safeParse({
        ...opts,
        timeoutMs: parseDurationMs(String(opts.timeout))
      });
      if (!parsed.success) {
        throw new CommandError(parsed.error.message);
      }
      await runDoctor(parsed.data);
    });

  return cmd;
}

