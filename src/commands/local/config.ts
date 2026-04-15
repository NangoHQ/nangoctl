import { Command } from 'commander';

import { getLocalPaths } from '../../core/paths.js';
import { renderJson, renderText } from '../../core/output/render.js';

export function buildLocalConfigCommand(): Command {
  return new Command('config')
    .description('Show local config paths and effective defaults')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts: { json?: boolean }) => {
      const paths = await getLocalPaths();
      if (opts.json) {
        renderJson({ ok: true, paths });
        return;
      }
      renderText(`State directory: ${paths.stateDir}`);
      renderText(`State file:      ${paths.stateFile}`);
      renderText(`Values overlay:  ${paths.generatedValuesFile}`);
    });
}

