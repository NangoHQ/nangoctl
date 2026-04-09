import { Command } from 'commander';
import { z } from 'zod';
import { createCommandLogger } from '../../core/output/render.js';
import { LocalContext } from '../../core/context.js';
import { loadLocalState } from '../../core/state.js';

const optsSchema = z.object({
  json: z.boolean().optional(),
  showSecrets: z.boolean().optional(),
});

export function buildLocalCredentialsCommand(): Command {
  return new Command('credentials')
    .description('Show local bootstrap/admin credentials')
    .option('--show-secrets', 'Print secret values (explicit)')
    .action(async (rawOpts) => {
      const opts = optsSchema.parse({
        json: Boolean(rawOpts.json),
        showSecrets: Boolean(rawOpts.showSecrets),
      });

      const ctx = await LocalContext.load();
      const log = createCommandLogger({ json: opts.json });

      const state = await loadLocalState(ctx.stateDir);

      // MVP: show persisted identifiers; secret fetching from Kubernetes is added in later iteration.
      log.info({
        message: 'Local credentials',
        data: {
          stateDir: ctx.stateDir,
          namespace: state?.namespace ?? ctx.namespace,
          release: state?.release ?? ctx.release,
          admin: state?.secrets?.admin ?? null,
          note: opts.showSecrets
            ? 'Secret materialization/reading from Kubernetes will be implemented in local-config-secrets-design.'
            : 'Use --show-secrets to print secret values once implemented.',
        },
      });
    });
}

