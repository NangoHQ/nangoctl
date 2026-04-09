import { Command } from 'commander';
import { registerVersionCommand } from './commands/version.js';
import { makeLocalCommand } from './commands/local/index.js';

export function buildCli(): Command {
    const program = new Command();

    program
        .name('nangoctl')
        .description('Run and manage Nango locally in Kubernetes')
        .option('--json', 'JSON output')
        .option('--verbose', 'Verbose output');

    registerVersionCommand(program);
    program.addCommand(makeLocalCommand());

    return program;
}

export async function run(argv: string[]): Promise<void> {
    const program = buildCli();
    await program.parseAsync(argv);
}

