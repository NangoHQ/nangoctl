import { Command } from 'commander';
import { z } from 'zod';

import { getGlobalCliOptions } from '../../core/context.js';
import { PreflightError } from '../../core/errors.js';
import { readDashboardCredentials } from '../../core/local/readLocalConfigMap.js';
import { getLocalPaths } from '../../core/paths.js';
import { renderHuman, renderJson } from '../../core/output/render.js';

const CredentialsFlagsSchema = z.object({
  json: z.boolean(),
  showSecrets: z.boolean(),
  stateDir: z.string().optional(),
});

export function buildLocalCredentialsCommand(): Command {
  const cmd = new Command('credentials')
    .description('Print NANGO_DASHBOARD_USERNAME and NANGO_DASHBOARD_PASSWORD from the local materialized ConfigMap')
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--show-secrets', 'Print the password in human output (username is always shown)', false)
    .option('--json', 'Machine-readable output', false)
    .action(async (opts) => {
      const global = getGlobalCliOptions(cmd);
      const parsed = CredentialsFlagsSchema.safeParse({
        json: Boolean(opts.json ?? global.json),
        showSecrets: Boolean(opts.showSecrets),
        stateDir: opts.stateDir,
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const flags = parsed.data;
      const paths = await getLocalPaths(flags.stateDir);
      const creds = await readDashboardCredentials(paths);

      if (flags.json) {
        renderJson({
          ok: true,
          NANGO_DASHBOARD_USERNAME: creds.NANGO_DASHBOARD_USERNAME,
          NANGO_DASHBOARD_PASSWORD: creds.NANGO_DASHBOARD_PASSWORD,
        });
        return;
      }

      renderHuman({
        title: 'Nango dashboard (basic auth)',
        body: [
          `NANGO_DASHBOARD_USERNAME: ${creds.NANGO_DASHBOARD_USERNAME}`,
          flags.showSecrets
            ? `NANGO_DASHBOARD_PASSWORD: ${creds.NANGO_DASHBOARD_PASSWORD}`
            : 'NANGO_DASHBOARD_PASSWORD: (hidden; pass --show-secrets to print)',
        ],
      });
    });

  return cmd;
}
