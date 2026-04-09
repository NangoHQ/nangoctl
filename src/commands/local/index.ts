import { Command } from 'commander';
import { makeLocalInstallCommand } from './install.js';
import { makeLocalStatusCommand } from './status.js';
import { makeLocalLogsCommand } from './logs.js';
import { makeLocalOpenCommand } from './open.js';
import { makeLocalCredentialsCommand } from './credentials.js';
import { makeLocalUninstallCommand } from './uninstall.js';
import { makeLocalDoctorCommand } from './doctor.js';
import { makeLocalConfigCommand } from './config.js';

export function makeLocalCommand(): Command {
  const cmd = new Command('local')
    .description('Run Nango locally (Kubernetes-first)')
    .addCommand(makeLocalInstallCommand())
    .addCommand(makeLocalStatusCommand())
    .addCommand(makeLocalLogsCommand())
    .addCommand(makeLocalOpenCommand())
    .addCommand(makeLocalCredentialsCommand())
    .addCommand(makeLocalUninstallCommand())
    .addCommand(makeLocalDoctorCommand())
    .addCommand(makeLocalConfigCommand());

  return cmd;
}

