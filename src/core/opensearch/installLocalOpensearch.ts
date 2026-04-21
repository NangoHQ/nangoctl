import path from 'node:path';
import YAML from 'yaml';

import { OPENSEARCH_CHART_VERSION, getOpensearchHelmRepo } from '../defaults.js';
import { Helm } from '../helm.js';
import { type LocalPaths, writeFile0600 } from '../paths.js';
import { buildOpensearchLocalHelmValues } from './helmValues.js';

/**
 * Deploy OpenSearch from `opensearch/opensearch` (single-node) before Nango so the ConfigMap can reference it.
 */
export async function installLocalOpensearch(opts: {
  helm: Helm;
  paths: LocalPaths;
  clusterName: string;
  helmRelease: string;
  namespace: string;
  waitTimeout: string;
  stdio: 'inherit' | 'pipe';
}): Promise<void> {
  const values = buildOpensearchLocalHelmValues(opts.clusterName);
  const vf = path.join(opts.paths.stateDir, 'opensearch.generated.values.yaml');
  await writeFile0600(vf, YAML.stringify(values));

  await opts.helm.repoAddIfMissing({ ...getOpensearchHelmRepo(), stdio: opts.stdio });
  await opts.helm.repoUpdate({ stdio: opts.stdio });

  await opts.helm.installOrUpgrade({
    ref: { namespace: opts.namespace, release: opts.helmRelease },
    chart: 'opensearch/opensearch',
    chartVersion: OPENSEARCH_CHART_VERSION,
    valuesFiles: [vf],
    createNamespace: false,
    wait: true,
    timeout: opts.waitTimeout,
    stdio: opts.stdio,
  });
}
