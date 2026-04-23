import type { Kubectl } from './kubectl.js';
import { nangoComponentDeploymentName, type NangoWorkloadComponent } from './helm/names.js';

const WORKLOADS: NangoWorkloadComponent[] = ['server', 'persist', 'orchestrator', 'jobs', 'runner'];

/**
 * `kubectl rollout restart` for every Nango workload Deployment so pods reload
 * ConfigMap/Secret-backed env (Kubernetes does not hot-reload env from volume updates).
 */
export async function restartNangoDeployments(opts: {
  kubectl: Kubectl;
  release: string;
  kubeContext?: string;
  namespace: string;
  stdio: 'inherit' | 'pipe';
}): Promise<void> {
  for (const w of WORKLOADS) {
    const dep = nangoComponentDeploymentName(opts.release, w);
    await opts.kubectl.run(['rollout', 'restart', `deployment/${dep}`], {
      kubeContext: opts.kubeContext,
      namespace: opts.namespace,
      stdio: opts.stdio,
    });
  }
}
