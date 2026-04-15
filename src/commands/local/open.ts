import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { z } from 'zod';

import {
  DEFAULT_CONNECT_UI_POD_PORT,
  DEFAULT_LOCAL_CONNECT_UI_PORT,
  DEFAULT_LOCAL_SERVER_PORT,
} from '../../core/defaults.js';
import { getGlobalCliOptions } from '../../core/context.js';
import { PreflightError } from '../../core/errors.js';
import { nangoServerServiceName } from '../../core/helm/names.js';
import { getLocalPaths, writeFile0600 } from '../../core/paths.js';
import {
  runForegroundPortForwardMulti,
  startDetachedPortForwardMulti,
  stopPortForwardFromPidFile,
} from '../../core/portForward.js';
import { createCommandLogger, renderJson } from '../../core/output/render.js';
import { readState } from '../../core/state.js';

const OpenFlagsSchema = z.object({
  json: z.boolean(),
  verbose: z.boolean(),
  namespace: z.string().min(1).optional(),
  release: z.string().min(1).optional(),
  context: z.string().optional(),
  stateDir: z.string().optional(),
  serverPort: z.coerce.number().int().min(1).max(65535).optional(),
  connectUiPort: z.coerce.number().int().min(1).max(65535).optional(),
  noBrowser: z.boolean(),
  openConnect: z.boolean(),
  detach: z.boolean(),
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
    .description(
      'Port-forward the Nango server Service (API + Connect UI). Runs in the foreground until Ctrl+C unless you pass --detach'
    )
    .option('--namespace <ns>', 'Kubernetes namespace (default: from install state)')
    .option('--release <name>', 'Helm release name (default: from install state)')
    .option('--context <name>', 'Kube context (default: from install state)')
    .option('--state-dir <path>', 'Override state directory (advanced)')
    .option(
      '--server-port <port>',
      `Localhost port for the server (default: from install state or ${DEFAULT_LOCAL_SERVER_PORT})`
    )
    .option(
      '--connect-ui-port <port>',
      `Localhost port for Connect UI (default: from install state or ${DEFAULT_LOCAL_CONNECT_UI_PORT})`
    )
    .option(
      '--detach',
      'Run port-forward in the background and exit (stop with: nangoctl local close)',
      false
    )
    .option('--no-browser', 'Only start port-forward; do not open a browser', false)
    .option('--open-connect', 'Also open Connect UI in the browser', false)
    .option('--json', 'Machine-readable output (also runs in the background like --detach)', false)
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
        serverPort: opts.serverPort !== undefined ? Number(opts.serverPort) : undefined,
        connectUiPort: opts.connectUiPort !== undefined ? Number(opts.connectUiPort) : undefined,
        noBrowser: Boolean(opts.noBrowser),
        openConnect: Boolean(opts.openConnect),
        detach: Boolean(opts.detach),
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

      const serverPort = flags.serverPort ?? state?.serverLocalPort ?? DEFAULT_LOCAL_SERVER_PORT;
      const connectUiPort = flags.connectUiPort ?? state?.connectUiLocalPort ?? DEFAULT_LOCAL_CONNECT_UI_PORT;

      const serviceName = nangoServerServiceName(release);
      const resource = `svc/${serviceName}`;
      const serverUrl = `http://127.0.0.1:${serverPort}`;
      const connectUrl = `http://127.0.0.1:${connectUiPort}`;

      const detach = flags.detach || flags.json;
      const pfSpec = {
        namespace,
        resource,
        kubeContext,
        mappings: [
          { localPort: serverPort, remotePort: 80 },
          { localPort: connectUiPort, remotePort: DEFAULT_CONNECT_UI_POD_PORT },
        ],
      };

      const kubectlHint = `kubectl --context ${kubeContext} -n ${namespace} port-forward ${resource} ${serverPort}:80 ${connectUiPort}:${DEFAULT_CONNECT_UI_POD_PORT}`;

      if (detach) {
        await stopPortForwardFromPidFile(paths.portForwardPidFile);

        const pid = await startDetachedPortForwardMulti(pfSpec);
        await writeFile0600(paths.portForwardPidFile, `${pid}\n`);

        if (flags.json) {
          renderJson({
            ok: true,
            action: 'open',
            mode: 'detach',
            pid,
            pidFile: paths.portForwardPidFile,
            closeHint: 'nangoctl local close',
            serverUrl,
            connectUrl,
            namespace,
            release,
            kubeContext,
            service: serviceName,
            portForward: {
              server: { localPort: serverPort, remotePort: 80, resource },
              connectUi: { localPort: connectUiPort, remotePort: DEFAULT_CONNECT_UI_POD_PORT, resource },
            },
          });
        } else {
          log.info(`Port-forward (background, pid ${pid}): ${kubectlHint}`);
          log.info(`Server: ${serverUrl}`);
          log.info(`Connect UI: ${connectUrl}`);
          log.info(`Stop with: nangoctl local close`);
        }

        if (!flags.noBrowser) {
          setTimeout(() => {
            if (!flags.json) {
              log.info(`Opening ${serverUrl}`);
            }
            openUrlInBrowser(serverUrl);
            if (flags.openConnect) {
              if (!flags.json) {
                log.info(`Opening ${connectUrl}`);
              }
              openUrlInBrowser(connectUrl);
            }
          }, 400);
        } else if (!flags.json) {
          log.info('Browser launch skipped (--no-browser).');
        }

        return;
      }

      // Foreground: one kubectl process; Ctrl+C stops port-forwarding.
      if (!flags.noBrowser) {
        setTimeout(() => {
          log.info(`Opening ${serverUrl}`);
          openUrlInBrowser(serverUrl);
          if (flags.openConnect) {
            log.info(`Opening ${connectUrl}`);
            openUrlInBrowser(connectUrl);
          }
        }, 600);
      } else {
        log.info('Browser launch skipped (--no-browser).');
      }

      if (!flags.json) {
        log.info(`Port-forward (foreground; Ctrl+C to stop): ${kubectlHint}`);
        log.info(`Server: ${serverUrl}`);
        log.info(`Connect UI: ${connectUrl}`);
      }

      await runForegroundPortForwardMulti(pfSpec);
    });

  return cmd;
}
