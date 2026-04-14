import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { z } from 'zod';

import { getGlobalCliOptions } from '../../core/context.js';
import { PreflightError } from '../../core/errors.js';
import { nangoServerServiceName } from '../../core/helm/names.js';
import { getLocalPaths } from '../../core/paths.js';
import { createCommandLogger, renderJson, renderText } from '../../core/output/render.js';
import { readState } from '../../core/state.js';
import { startDetachedPortForward } from '../../core/portForward.js';

const OpenFlagsSchema = z.object({
  json: z.boolean(),
  verbose: z.boolean(),
  namespace: z.string().min(1).optional(),
  release: z.string().min(1).optional(),
  context: z.string().optional(),
  stateDir: z.string().optional(),
  serverPort: z.coerce.number().int().min(1).max(65535),
  noBrowser: z.boolean(),
});

function openUrlInBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

export function buildLocalOpenCommand(): Command {
  const cmd = new Command('open')
    .description('Port-forward the Nango server Service and open the UI/API in your browser')
    .option('--namespace <ns>', 'Kubernetes namespace (default: from install state)')
    .option('--release <name>', 'Helm release name (default: from install state)')
    .option('--context <name>', 'Kube context (default: from install state)')
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option('--server-port <port>', 'Localhost port for the server', '4280')
    .option('--no-browser', 'Only start port-forward; do not open a browser', false)
    .option('--json', 'Machine-readable output', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (opts) => {
      const global = getGlobalCliOptions(cmd);
      const parsed = OpenFlagsSchema.safeParse({
        json: Boolean(opts.json ?? global.json),
        verbose: Boolean(opts.verbose ?? global.verbose),
        namespace: opts.namespace,
        release: opts.release,
        context: opts.context ?? global.context,
        stateDir: opts.stateDir,
        serverPort: opts.serverPort,
        noBrowser: Boolean(opts.noBrowser),
      });

      if (!parsed.success) {
        throw new PreflightError(`Invalid flags: ${parsed.error.message}`);
      }

      const flags = parsed.data;
      const log = createCommandLogger({ json: flags.json, verbose: flags.verbose });
      const paths = await getLocalPaths(flags.stateDir);
      const state = await readState(paths.stateFile);

      let namespace: string;
      let release: string;
      let kubeContext: string;

      if (state) {
        namespace = flags.namespace ?? state.namespace;
        release = flags.release ?? state.release;
        kubeContext = flags.context ?? state.kubeContext;
      } else {
        if (!flags.namespace || !flags.release || !flags.context) {
          throw new PreflightError(
            'No local install state found, or missing overrides.',
            [
              'Run `nangoctl local install` first, or pass `--namespace`, `--release`, and `--context` together.',
            ]
          );
        }
        namespace = flags.namespace;
        release = flags.release;
        kubeContext = flags.context;
      }

      const serviceName = nangoServerServiceName(release);
      const resource = `svc/${serviceName}`;
      const url = `http://127.0.0.1:${flags.serverPort}`;

      await startDetachedPortForward({
        namespace,
        resource,
        localPort: flags.serverPort,
        remotePort: 80,
        kubeContext,
      });

      if (flags.json) {
        renderJson({
          ok: true,
          action: 'open',
          url,
          namespace,
          release,
          kubeContext,
          service: serviceName,
          portForward: { localPort: flags.serverPort, remotePort: 80, resource },
        });
        return;
      }

      log.info(`Port-forward: kubectl --context ${kubeContext} -n ${namespace} port-forward ${resource} ${flags.serverPort}:80`);
      log.info(`Opening ${url}`);

      if (!flags.noBrowser) {
        openUrlInBrowser(url);
      } else {
        log.info('Browser launch skipped (--no-browser).');
      }

      const stopHint =
        process.platform === 'win32'
          ? 'Stop the background kubectl port-forward from Task Manager or by closing that console.'
          : `Stop the background port-forward, e.g. \`pkill -f "kubectl.*port-forward.*${resource}"\``;
      renderText(stopHint);
    });

  return cmd;
}
