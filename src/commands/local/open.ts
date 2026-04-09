import { Command } from 'commander';
import { renderJson, renderText } from '../../core/output/render.js';

export function buildLocalOpenCommand(): Command {
  return new Command('open')
    .description('Open the local Nango UI/API in your browser')
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Verbose output', false)
    .option('--server-port <port>', 'Localhost port to open', '4280')
    .action(async (opts: { json?: boolean; serverPort?: string }) => {
      if (opts.json) {
        renderJson({ ok: true, action: 'open', url: `http://localhost:${opts.serverPort}` });
        return;
      }

      renderText(`Open: http://localhost:${opts.serverPort}`);
      renderText('Note: `nangoctl local open` will start/ensure port-forward in MVP implementation.');
    });
}

