/**
 * Values for https://github.com/opensearch-project/helm-charts `opensearch/opensearch`.
 * Single-node, HTTP (in-cluster), security plugin disabled for local kind clusters.
 */
export function buildOpensearchLocalHelmValues(clusterName: string): Record<string, unknown> {
  const masterService = `${clusterName}-master`;
  const ymlLines = [
    `cluster.name: ${clusterName}`,
    'network.host: 0.0.0.0',
    'discovery.type: single-node',
    'plugins.security.disabled: true',
  ];
  return {
    clusterName,
    nodeGroup: 'master',
    masterService,
    singleNode: true,
    replicas: 1,
    protocol: 'http',
    opensearchJavaOpts: '-Xms512M -Xmx512M',
    resources: {
      requests: { cpu: '250m', memory: '1Gi' },
      limits: { cpu: '1', memory: '2Gi' },
    },
    persistence: {
      enabled: true,
      size: '10Gi',
    },
    sysctlInit: { enabled: false },
    config: {
      'opensearch.yml': `${ymlLines.join('\n')}\n`,
    },
    securityConfig: {
      enabled: false,
    },
  };
}
