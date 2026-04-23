/** Kubernetes Service name for the Nango server (`*.names.service` → `{fullname}-server-svc`). */
export function nangoServerServiceName(releaseName: string): string {
  return `${helmCommonFullname(releaseName)}-server-svc`;
}

/**
 * PVC name for server data (`server.names.fullname` in nango-helm-charts → `{commonFullname}-server`).
 */
export function nangoServerPersistenceClaimName(releaseName: string): string {
  return `${helmCommonFullname(releaseName)}-server`;
}

/** Nango chart workload Deployments use `{commonFullname}-{component}`. */
export type NangoWorkloadComponent = 'server' | 'persist' | 'orchestrator' | 'jobs' | 'runner';

export function nangoComponentDeploymentName(releaseName: string, component: NangoWorkloadComponent): string {
  return `${helmCommonFullname(releaseName)}-${component}`;
}

/** Deployment name for the server workload (`server.names.fullname` in nango-helm-charts). */
export function nangoServerDeploymentName(releaseName: string): string {
  return nangoComponentDeploymentName(releaseName, 'server');
}

/**
 * Mirrors `common.names.fullname` from Nango Helm charts (bitnami common templates).
 * When the sanitized release name contains the chart name, the fullname is the release name only.
 */
export function helmCommonFullname(releaseName: string, chartName = 'nango'): string {
  const rel = releaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let full: string;
  if (rel.includes(chartName)) {
    full = rel;
  } else {
    full = `${rel}-${chartName}`;
  }
  return full.slice(0, 63).replace(/-+$/g, '');
}

/** In-cluster HTTP URL for Nango component Services (`*-svc`), matching chart `*.names.service` helpers. */
export function nangoComponentServiceUrl(
  commonFullname: string,
  component: 'server' | 'persist' | 'orchestrator' | 'jobs' | 'runner',
  namespace: string
): string {
  return `http://${commonFullname}-${component}-svc.${namespace}.svc.cluster.local`;
}

/** Sanitized Helm release name (matches chart `regexReplaceAll` normalization for labels). */
export function helmReleaseSanitized(releaseName: string): string {
  return releaseName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Bitnami elasticsearch subchart exposes `{{ .Release.Name }}-elasticsearch` on port 9200. */
export function elasticsearchHttpUrl(helmReleaseName: string, namespace: string): string {
  const rel = helmReleaseSanitized(helmReleaseName);
  return `http://${rel}-elasticsearch.${namespace}.svc.cluster.local:9200`;
}

/**
 * OpenSearch Helm sub-release name (separate from the main Nango release).
 * Example: `nango` → `nango-logs-opensearch`.
 */
export function opensearchLogsHelmReleaseName(mainRelease: string): string {
  const rel = helmReleaseSanitized(mainRelease);
  return `${rel}-logs-opensearch`.slice(0, 53).replace(/-+$/g, '');
}

/**
 * `clusterName` passed to the OpenSearch Helm chart (must stay in sync with `opensearch.yml` and Services).
 * Example: `nango` → `nango-opensearch-logs`.
 */
export function opensearchClusterName(mainRelease: string): string {
  const rel = helmReleaseSanitized(mainRelease);
  return `${rel}-opensearch-logs`.replace(/--+/g, '-').slice(0, 63).replace(/-+$/g, '');
}

/** OpenSearch chart exposes the REST Service as `{clusterName}-master` for the default master nodeGroup. */
export function opensearchHttpUrl(clusterName: string, namespace: string): string {
  return `http://${clusterName}-master.${namespace}.svc.cluster.local:9200`;
}

export function opensearchMasterStatefulSetName(clusterName: string): string {
  return `${clusterName}-master`;
}
