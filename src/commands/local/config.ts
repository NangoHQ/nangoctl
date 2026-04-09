import type { Command } from 'commander';

import { getStateDir } from '../../core/paths.js';
import { renderJsonOrHuman } from '../../core/output/render.js';

export function registerLocalConfigCommand(local: Command) {
  local
    .command('config')
    .description('Show local config paths and effective defaults')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { json?: boolean }) => {
      const stateDir = getStateDir();
      renderJsonOrHuman(
        { stateDir },
        () => {
          process.stdout.write(`State directory: ${stateDir}\n`);
        },
        { json: Boolean(opts.json) }
      );
    });
}

