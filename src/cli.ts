import { Command } from 'commander';
import { registerVersionCommand } from './commands/version.js';
import { registerLocalCommands } from './commands/local/index.js';

export function buildCli(): Command {
    const program = new Command();

    program
        .name('nangoctl')
        .description('Run and manage Nango locally in Kubernetes')
        .option('--json', 'JSON output')
        .option('--verbose', 'Verbose output');

    registerVersionCommand(program);
    registerLocalCommands(program);

    return program;
}

