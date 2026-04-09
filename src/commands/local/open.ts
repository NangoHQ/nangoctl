import { Command } from 'commander';
import { jsonFlag, verboseFlag } from '../../core/flags.js';
import { renderJson, renderText } from '../../core/output/render.js';

export function registerLocalOpen(parent: Command): void {
  parent
    .command('open')
    .description('Open the local Nango UI/API in your browser')
    .addOption(verboseFlag())
    .addOption(jsonFlag())
    .option('--server-port <port>', 'Localhost port to open', '4280')
    .action(async (opts) => {
      if (opts.json) {
        renderJson({ ok: true, action: 'open', url: `http://localhost:${opts.serverPort}` });
        return;
      }

      renderText(`Open: http://localhost:${opts.serverPort}`);
      renderText('Note: `nangoctl local open` will start/ensure port-forward in MVP implementation.');
    });
}

