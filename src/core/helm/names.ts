/** Kubernetes Service name for the Nango server (`*.names.service` → `{fullname}-server-svc`). */
export function nangoServerServiceName(releaseName: string): string {
  return `${helmCommonFullname(releaseName)}-server-svc`;
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
