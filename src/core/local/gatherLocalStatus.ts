import chalk from 'chalk';

import type { Helm } from '../helm.js';
import type { Kubectl } from '../kubectl.js';
import type { LocalState } from '../state.js';

export type HelmStatusSummary = {
  status: string;
  revision: number;
  chart: string;
  appVersion?: string;
  updated?: string;
};

export type DeploymentStatusRow = {
  name: string;
  ready: string;
  images: string[];
};

export type ServiceStatusRow = {
  name: string;
  type: string;
  clusterIP: string;
  ports: string;
  /** Ready endpoint addresses (best-effort from Endpoints). */
  endpoints: string;
};

export type PodStatusRow = {
  name: string;
  ready: string;
  phase: string;
  restarts: number;
  images: string[];
};

export type LocalStatusReport = {
  namespace: string;
  release: string;
  kubeContext?: string;
  statePath: string;
  state: LocalState | null;
  /** When state exists but kubeContext differs from current kubectl context. */
  contextMismatch: boolean;
  helm: HelmStatusSummary | null;
  helmMissing: boolean;
  clusterError: string | null;
  deployments: DeploymentStatusRow[];
  services: ServiceStatusRow[];
  pods: PodStatusRow[];
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

export function parseHelmStatusJson(raw: unknown): HelmStatusSummary | null {
  const o = asRecord(raw);
  if (!o) return null;
  const info = asRecord(o.info);
  const status = typeof info?.status === 'string' ? info.status : 'unknown';
  const revision = typeof o.version === 'number' ? o.version : Number(o.version ?? 0) || 0;
  const chart = parseHelmChartField(o.chart);
  let appVersion: string | undefined;
  const ch = o.chart;
  if (ch !== null && typeof ch === 'object' && !Array.isArray(ch)) {
    const meta = asRecord((ch as { metadata?: unknown }).metadata);
    if (typeof meta?.appVersion === 'string') appVersion = meta.appVersion;
  }
  let updated: string | undefined;
  const lastDeployed = info?.last_deployed ?? info?.last_deployed_time;
  if (typeof lastDeployed === 'string') updated = lastDeployed;
  return { status, revision, chart, appVersion, updated };
}

function parseHelmChartField(chart: unknown): string {
  if (typeof chart === 'string') return chart;
  const o = asRecord(chart);
  if (!o) return 'unknown';
  const meta = asRecord(o.metadata);
  if (meta && typeof meta.name === 'string' && typeof meta.version === 'string') {
    return `${meta.name}-${meta.version}`;
  }
  return 'unknown';
}

function listItems(data: unknown): unknown[] {
  const o = asRecord(data);
  const items = o?.items;
  return Array.isArray(items) ? items : [];
}

function metaName(obj: unknown): string | undefined {
  const o = asRecord(obj);
  const m = asRecord(o?.metadata);
  return typeof m?.name === 'string' ? m.name : undefined;
}

function deploymentRow(obj: unknown): DeploymentStatusRow | null {
  const o = asRecord(obj);
  if (o?.kind !== 'Deployment') return null;
  const name = metaName(o);
  if (!name) return null;
  const status = asRecord(o.status) ?? {};
  const spec = asRecord(o.spec) ?? {};
  const desired = Number(status.replicas ?? spec.replicas ?? 0);
  const ready = Number(status.readyReplicas ?? 0);
  const tpl = asRecord(spec.template);
  const podSpec = asRecord(tpl?.spec);
  const containers = Array.isArray(podSpec?.containers) ? (podSpec!.containers as unknown[]) : [];
  const images = containers
    .map((c) => asRecord(c)?.image)
    .filter((img): img is string => typeof img === 'string');
  const readyStr = desired > 0 ? `${ready}/${desired}` : `${ready}/0`;
  return { name, ready: readyStr, images };
}

function formatServicePorts(obj: unknown): string {
  const o = asRecord(obj);
  const spec = asRecord(o?.spec);
  const ports = Array.isArray(spec?.ports) ? (spec!.ports as unknown[]) : [];
  const parts = ports.map((p) => {
    const pr = asRecord(p);
    const port = pr?.port;
    const proto = typeof pr?.protocol === 'string' ? pr.protocol : 'TCP';
    return typeof port === 'number' ? `${port}/${proto}` : '';
  });
  return parts.filter(Boolean).join(', ') || '—';
}

function serviceRow(obj: unknown, endpointsByName: Map<string, number>): ServiceStatusRow | null {
  const o = asRecord(obj);
  if (o?.kind !== 'Service') return null;
  const name = metaName(o);
  if (!name) return null;
  const spec = asRecord(o?.spec);
  const typ = typeof spec?.type === 'string' ? spec.type : 'ClusterIP';
  const clusterIP = typeof spec?.clusterIP === 'string' ? spec.clusterIP : '—';
  const ports = formatServicePorts(o);
  const n = endpointsByName.get(name) ?? 0;
  const endpoints = n > 0 ? `${n} ready` : 'none';
  return { name, type: typ, clusterIP, ports, endpoints };
}

function endpointAddressCount(obj: unknown): { name: string; count: number } | null {
  const o = asRecord(obj);
  if (o?.kind !== 'Endpoints') return null;
  const name = metaName(o);
  if (!name) return null;
  const subsets = Array.isArray(o.subsets) ? (o.subsets as unknown[]) : [];
  let count = 0;
  for (const s of subsets) {
    const sub = asRecord(s);
    const addrs = Array.isArray(sub?.addresses) ? (sub.addresses as unknown[]) : [];
    count += addrs.length;
  }
  return { name, count };
}

function podRow(obj: unknown): PodStatusRow | null {
  const o = asRecord(obj);
  if (o?.kind !== 'Pod') return null;
  const name = metaName(o);
  if (!name) return null;
  const status = asRecord(o.status);
  const phase = typeof status?.phase === 'string' ? status.phase : 'Unknown';
  const cs = Array.isArray(status?.containerStatuses) ? (status!.containerStatuses as unknown[]) : [];
  const total = cs.length;
  const readyCount = cs.filter((c) => asRecord(c)?.ready === true).length;
  const restarts = cs.reduce<number>((acc, c) => acc + Number(asRecord(c)?.restartCount ?? 0), 0);
  const spec = asRecord(o.spec);
  const containers = Array.isArray(spec?.containers) ? (spec!.containers as unknown[]) : [];
  const images = containers
    .map((c) => asRecord(c)?.image)
    .filter((img): img is string => typeof img === 'string');
  return {
    name,
    ready: total > 0 ? `${readyCount}/${total}` : '0/0',
    phase,
    restarts,
    images,
  };
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

function truncateImage(img: string, max: number): string {
  if (img.length <= max) return img;
  return `${img.slice(0, Math.max(0, max - 1))}…`;
}

export function buildLocalStatusReport(params: {
  kubeContext: string | undefined;
  state: LocalState | null;
  statePath: string;
  namespace: string;
  release: string;
  helmJson: unknown | null;
  kubeList: unknown | null;
  clusterError: string | null;
}): LocalStatusReport {
  const contextMismatch = Boolean(
    params.state?.kubeContext && params.kubeContext && params.state.kubeContext !== params.kubeContext
  );

  const helm = params.helmJson ? parseHelmStatusJson(params.helmJson) : null;
  const helmMissing = params.helmJson === null && !params.clusterError;

  const endpointsByName = new Map<string, number>();
  const deployments: DeploymentStatusRow[] = [];
  const services: ServiceStatusRow[] = [];
  const pods: PodStatusRow[] = [];

  if (params.kubeList && !params.clusterError) {
    for (const item of listItems(params.kubeList)) {
      const ep = endpointAddressCount(item);
      if (ep) endpointsByName.set(ep.name, ep.count);
    }
    for (const item of listItems(params.kubeList)) {
      const d = deploymentRow(item);
      if (d) deployments.push(d);
      const p = podRow(item);
      if (p) pods.push(p);
    }
    for (const item of listItems(params.kubeList)) {
      const s = serviceRow(item, endpointsByName);
      if (s) services.push(s);
    }
  }

  return {
    namespace: params.namespace,
    release: params.release,
    kubeContext: params.kubeContext,
    statePath: params.statePath,
    state: params.state,
    contextMismatch,
    helm,
    helmMissing,
    clusterError: params.clusterError,
    deployments: sortByName(deployments),
    services: sortByName(services),
    pods: sortByName(pods),
  };
}

export async function gatherLocalStatus(params: {
  kubectl: Kubectl;
  helm: Helm;
  namespace: string;
  release: string;
  statePath: string;
  state: LocalState | null;
}): Promise<LocalStatusReport> {
  const kubeContext = await params.kubectl.currentContext();
  const helmJson = await params.helm.tryStatusJson({
    ref: { namespace: params.namespace, release: params.release },
  });

  const res = await params.kubectl.getJson(
    ['get', 'pods,svc,deployments.apps,endpoints', '-o', 'json'],
    { namespace: params.namespace }
  );

  const clusterError = res.ok ? null : res.error;
  const kubeList = res.ok ? res.data : null;

  return buildLocalStatusReport({
    kubeContext,
    state: params.state,
    statePath: params.statePath,
    namespace: params.namespace,
    release: params.release,
    helmJson,
    kubeList,
    clusterError,
  });
}

function colWidths(headers: string[], rows: string[][]): number[] {
  const w = headers.map((h, i) => {
    const longest = rows.reduce((m, r) => Math.max(m, (r[i] ?? '').length), headers[i].length);
    return Math.min(longest, 72);
  });
  return w;
}

function rowLine(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i] ?? 8)).join('  ');
}

export function formatLocalStatusHuman(report: LocalStatusReport): string {
  const lines: string[] = [];
  const title = chalk.bold.cyan('Nango local status');
  lines.push(title);
  lines.push(
    [
      `${chalk.dim('Namespace:')} ${report.namespace}`,
      `${chalk.dim('Release:')} ${report.release}`,
      report.kubeContext ? `${chalk.dim('Context:')} ${report.kubeContext}` : `${chalk.dim('Context:')} (unknown)`,
    ].join('  ')
  );

  if (report.contextMismatch && report.state?.kubeContext) {
    lines.push(
      chalk.yellow(
        `Warning: state file context "${report.state.kubeContext}" differs from current context "${report.kubeContext ?? ''}".`
      )
    );
  }

  lines.push('');
  lines.push(chalk.bold('State'));
  if (report.state) {
    lines.push(`  ${chalk.dim('path:')} ${report.statePath}`);
    lines.push(
      `  ${chalk.dim('cluster:')} ${report.state.clusterRuntime} / ${report.state.clusterName}  ${chalk.dim('seed:')} ${report.state.seed.slice(0, 8)}…`
    );
    if (report.state.chartVersion) {
      lines.push(`  ${chalk.dim('chart (install):')} ${report.state.chartRef} @ ${report.state.chartVersion}`);
    } else {
      lines.push(`  ${chalk.dim('chart (install):')} ${report.state.chartRef}`);
    }
    const ports: string[] = [];
    if (report.state.serverLocalPort) ports.push(`server PF: ${report.state.serverLocalPort}`);
    if (report.state.connectUiLocalPort) ports.push(`Connect UI PF: ${report.state.connectUiLocalPort}`);
    if (ports.length) lines.push(`  ${chalk.dim('ports:')} ${ports.join('  ')}`);
  } else {
    lines.push(`  ${chalk.dim('(no state file at ' + report.statePath + ')')}`);
  }

  lines.push('');
  lines.push(chalk.bold('Helm release'));
  if (report.clusterError) {
    lines.push(`  ${chalk.red('kubectl:')} ${report.clusterError}`);
  }
  if (report.helm) {
    const h = report.helm;
    lines.push(
      `  ${chalk.dim('status:')} ${h.status}  ${chalk.dim('revision:')} ${h.revision}  ${chalk.dim('chart:')} ${h.chart}`
    );
    if (h.appVersion) lines.push(`  ${chalk.dim('appVersion:')} ${h.appVersion}`);
    if (h.updated) lines.push(`  ${chalk.dim('last deployed:')} ${h.updated}`);
  } else if (!report.clusterError && report.helmMissing) {
    lines.push(`  ${chalk.yellow(`No release "${report.release}" in namespace "${report.namespace}" (or helm status failed).`)}`);
  }

  const imgMax = 56;
  if (!report.clusterError) {
    lines.push('');
    lines.push(chalk.bold('Deployments'));
    if (report.deployments.length === 0) {
      lines.push(`  ${chalk.dim('(none)')}`);
    } else {
      const headers = ['NAME', 'READY', 'IMAGES'];
      const rows = report.deployments.map((d) => [
        d.name,
        d.ready,
        d.images.map((i) => truncateImage(i, imgMax)).join(', ') || '—',
      ]);
      const w = colWidths(headers, rows);
      lines.push('  ' + chalk.dim(rowLine(headers, w)));
      for (const r of rows) lines.push('  ' + rowLine(r, w));
    }

    lines.push('');
    lines.push(chalk.bold('Services'));
    if (report.services.length === 0) {
      lines.push(`  ${chalk.dim('(none)')}`);
    } else {
      const headers = ['NAME', 'TYPE', 'CLUSTER-IP', 'PORTS', 'ENDPOINTS'];
      const rows = report.services.map((s) => [s.name, s.type, s.clusterIP, s.ports, s.endpoints]);
      const w = colWidths(headers, rows);
      lines.push('  ' + chalk.dim(rowLine(headers, w)));
      for (const r of rows) lines.push('  ' + rowLine(r, w));
    }

    lines.push('');
    lines.push(chalk.bold('Pods'));
    if (report.pods.length === 0) {
      lines.push(`  ${chalk.dim('(none)')}`);
    } else {
      const headers = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'IMAGES'];
      const rows = report.pods.map((p) => [
        p.name,
        p.ready,
        p.phase,
        String(p.restarts),
        p.images.map((i) => truncateImage(i, imgMax)).join(', ') || '—',
      ]);
      const w = colWidths(headers, rows);
      lines.push('  ' + chalk.dim(rowLine(headers, w)));
      for (const r of rows) lines.push('  ' + rowLine(r, w));
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** JSON-safe snapshot (dates stay as strings). */
export function localStatusToJson(report: LocalStatusReport): Record<string, unknown> {
  return {
    namespace: report.namespace,
    release: report.release,
    kubeContext: report.kubeContext ?? null,
    statePath: report.statePath,
    state: report.state,
    contextMismatch: report.contextMismatch,
    helm: report.helm,
    helmMissing: report.helmMissing,
    clusterError: report.clusterError,
    deployments: report.deployments,
    services: report.services,
    pods: report.pods,
  };
}
