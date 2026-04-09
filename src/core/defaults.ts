import { getLocalPaths } from './paths.js';

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

