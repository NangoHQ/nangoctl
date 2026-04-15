import { getLocalPaths } from './paths.js';

/** Localhost port for `kubectl port-forward` → Nango server Service (HTTP). */
export const DEFAULT_LOCAL_SERVER_PORT = 4280;
/** Localhost port for Connect UI (`NANGO_CONNECT_UI_PORT` in the pod, default 3009). */
export const DEFAULT_LOCAL_CONNECT_UI_PORT = 4281;
/** Container port where the server image serves Connect UI (matches Nango `.env.example`). */
export const DEFAULT_CONNECT_UI_POD_PORT = 3009;

/**
 * WORKDIR in official `nangohq/nango` images (`Dockerfile` `WORKDIR /app/nango`).
 * `packages/server/entrypoint.sh` expects this as `pwd` when starting Connect UI.
 */
export const NANGO_IMAGE_APP_ROOT = '/app/nango';

/**
 * Shared PVC mount for server + jobs (integrations and runtime data).
 * Matches Helm `server.persistence.mountPath` / `jobs.persistence.mountPath` when using a shared claim.
 */
export const NANGO_PERSISTENCE_MOUNT_PATH = '/nango/data';

/** Subdirectory under {@link NANGO_PERSISTENCE_MOUNT_PATH} for `providers.yaml` and integration assets. */
export function nangoIntegrationsFullPath(): string {
  return `${NANGO_PERSISTENCE_MOUNT_PATH}/integrations`;
}

export function getDefaultNamespace(): string {
  return 'nango';
}

export function getDefaultRelease(): string {
  return 'nango';
}

export function getDefaultClusterName(): string {
  return 'nango-local';
}

export function getDefaultChartRef(): string {
  return 'nangohq/nango';
}

export function getDefaultHelmRepo(): { name: string; url: string } {
  return { name: 'nangohq', url: 'https://nangohq.github.io/nango-helm-charts' };
}

export function getDefaultProfile(): { namespace: string; release: string; clusterName: string } {
  return {
    namespace: getDefaultNamespace(),
    release: getDefaultRelease(),
    clusterName: getDefaultClusterName(),
  };
}

export async function getDefaultStatePaths() {
  return await getLocalPaths();
}

