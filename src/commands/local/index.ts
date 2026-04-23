import { Command } from 'commander';
import { buildLocalBootstrapCommand } from './bootstrap.js';
import { buildLocalInstallCommand } from './install.js';
import { buildLocalStatusCommand } from './status.js';
import { buildLocalLogsCommand } from './logs.js';
import { buildLocalOpenCommand } from './open.js';
import { buildLocalCloseCommand } from './close.js';
import { buildLocalCredentialsCommand } from './credentials.js';
import { buildLocalUninstallCommand } from './uninstall.js';
import { buildLocalConfigCommand } from './config.js';
import { buildLocalAwsCommand } from './awsSync.js';

export function makeLocalCommand(): Command {
  return new Command('local')
    .description('Run Nango locally (Kubernetes-first)')
    .addCommand(buildLocalBootstrapCommand())
    .addCommand(buildLocalInstallCommand())
    .addCommand(buildLocalStatusCommand())
    .addCommand(buildLocalLogsCommand())
    .addCommand(buildLocalOpenCommand())
    .addCommand(buildLocalCloseCommand())
    .addCommand(buildLocalCredentialsCommand())
    .addCommand(buildLocalUninstallCommand())
    .addCommand(buildLocalConfigCommand())
    .addCommand(buildLocalAwsCommand());
}

export function registerLocalCommands(program: Command): void {
  program.addCommand(makeLocalCommand());
}
