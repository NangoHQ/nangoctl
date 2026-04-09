import { Command } from 'commander';
import { z } from 'zod';
import { getGlobalCliOptions } from '../../core/context.js';
import { renderHuman } from '../../core/output/render.js';

const optsSchema = z.object({
  json: z.boolean().default(false),
  showSecrets: z.boolean().default(false)
});

export function buildLocalCredentialsCommand(): Command {
  const cmd = new Command('credentials')
    .description('Show local bootstrap/admin credentials')
    .option('--show-secrets', 'Print secret values (explicit)', false)
    .action(async (rawOpts) => {
      const global = getGlobalCliOptions(cmd);
      const opts = optsSchema.parse({ json: global.json, showSecrets: Boolean(rawOpts.showSecrets) });

      // MVP scaffold: once install writes state+secrets, this command will read from state dir and/or Kubernetes Secret.
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: true, note: 'Not implemented yet' }) + '\n');
        return;
      }
      renderHuman({
        title: 'Not implemented yet',
        body: ['This is the scaffold for `nangoctl local credentials`.']
      });
    });

  return cmd;
}

