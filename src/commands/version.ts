import { Command } from 'commander';
import { readVersion } from '../core/version.js';

export function registerVersionCommand(program: Command): void {
    program
        .command('version')
        .description('Print nangoctl version')
        .option('--json', 'Output as JSON')
        .action(async (opts: { json?: boolean }) => {
            const version = readVersion();
            if (opts.json) {
                process.stdout.write(JSON.stringify({ version }) + '\n');
                return;
            }
            process.stdout.write(`nangoctl ${version}\n`);
        });
}

