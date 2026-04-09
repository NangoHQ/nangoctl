import { Command } from 'commander';
import { z } from 'zod';

import { createCmd } from '../../core/command.js';
import { parseDurationMs } from '../../core/time.js';
import { getDefaultProfile } from '../../core/defaults.js';
import { createOutput } from '../../core/output/output.js';
import { Helm } from '../../core/helm.js';
import { Kubectl } from '../../core/kubectl.js';

const DoctorOptionsSchema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  namespace: z.string().min(1).default(getDefaultProfile().namespace),
  release: z.string().min(1).default(getDefaultProfile().release),
  context: z.string().optional(),
  timeoutMs: z.number().int().positive().default(parseDurationMs('5m'))
});

export function buildLocalDoctorCommand(): Command {
  const cmd = new Command('doctor')
    .description('Diagnose common local runtime issues (cluster, Helm release, pods)')
    .option('--namespace <ns>', 'Kubernetes namespace', getDefaultProfile().namespace)
    .option('--release <name>', 'Helm release name', getDefaultProfile().release)
    .option('--context <kubecontext>', 'kubectl context override')
    .option('--timeout <duration>', 'Timeout (e.g. 30s, 5m)', '5m')
    .action(
      createCmd(DoctorOptionsSchema, async (opts, ctx) => {
        const out = createOutput({ json: opts.json });
        // Minimal “doctor” stub that demonstrates plumbing and provides immediate value.
        const kubectl = new Kubectl(ctx.proc, { kubeContext: opts.context, namespace: opts.namespace });
        const helm = new Helm(ctx.proc, { kubeContext: opts.context });

        out.writeLine(`Namespace: ${opts.namespace}`);
        out.writeLine(`Release: ${opts.release}`);

        const helmStatus = await helm.status({ ref: { namespace: opts.namespace, release: opts.release } });
        ctx.out.writeLine('\nHelm status:');
        ctx.out.writeLine(helmStatus.raw.trim() || '(empty)');

        ctx.out.writeLine('\nPods:');
        const pods = await kubectl.getPodsWide();
        ctx.out.writeLine(pods.trim() || '(none)');

        ctx.out.writeLine('\nNext: this command will be extended to surface failing pods/events and common misconfigurations.');
      })
    );

  return cmd;
}

