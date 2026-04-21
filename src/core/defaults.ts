import { getLocalPaths } from './paths.js';

/** Localhost port for `kubectl port-forward` → Nango server Service (HTTP). */
export const DEFAULT_LOCAL_SERVER_PORT = 4280;
/** Localhost port for Connect UI (`NANGO_CONNECT_UI_PORT` in the pod, default 3009). */
export const DEFAULT_LOCAL_CONNECT_UI_PORT = 4281;

/**
 * Default Helm `--wait` timeout for `local install` (how long the **client** waits for resources to become Ready).
 * Typical healthy installs finish sooner; use `--wait-timeout` only when you are sure slowness is from pulls/scheduling,
 * not from a stuck pod (crash loops / failing probes need `kubectl` inspection, not a longer timeout).
 */
export const DEFAULT_LOCAL_INSTALL_WAIT_TIMEOUT = '10m';
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

/** Helm repo for https://opensearch-project.github.io/helm-charts */
export function getOpensearchHelmRepo(): { name: string; url: string } {
  return { name: 'opensearch', url: 'https://opensearch-project.github.io/helm-charts/' };
}

/**
 * Pinned chart version for reproducible local installs (`opensearch/opensearch`).
 * Must match a `version` listed for chart `opensearch` in the official repo index:
 * https://opensearch-project.github.io/helm-charts/index.yaml
 * (not the OpenSearch app/Docker tag — chart SemVer is currently in the 3.x line.)
 */
export const OPENSEARCH_CHART_VERSION = '3.6.0';

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

