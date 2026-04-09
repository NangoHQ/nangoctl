import { ExecaError } from 'execa';
import { Proc } from './proc.js';
import { PreflightError } from './errors.js';

export interface HelmReleaseRef {
    namespace: string;
    release: string;
}

export class Helm {
    constructor(private readonly proc: Proc) {}

    async preflight(): Promise<void> {
        const res = await this.proc.run({ cmd: 'helm', args: ['version'], quiet: true, allowNonZeroExit: true });
        if (res.exitCode !== 0) {
            throw new PreflightError('Missing prerequisite: helm', {
                hint: 'Install Helm 3+ and ensure `helm` is on your PATH.',
            });
        }
    }

    async repoAddIfMissing(opts: { name: string; url: string }): Promise<void> {
        const list = await this.proc.run({ cmd: 'helm', args: ['repo', 'list', '-o', 'json'], quiet: true });
        try {
            const repos = JSON.parse(list.stdout || '[]') as Array<{ name: string; url: string }>;
            if (repos.some((r) => r.name === opts.name)) return;
        } catch {
            // fallthrough: attempt add anyway
        }

        await this.proc.run({ cmd: 'helm', args: ['repo', 'add', opts.name, opts.url] });
    }

    async repoUpdate(): Promise<void> {
        await this.proc.run({ cmd: 'helm', args: ['repo', 'update'] });
    }

    async installOrUpgrade(opts: {
        ref: HelmReleaseRef;
        chart: string;
        chartVersion?: string;
        valuesFiles?: string[];
        set?: string[];
        createNamespace?: boolean;
        wait?: boolean;
        timeout?: string;
    }): Promise<void> {
        const args = [
            'upgrade',
            '--install',
            opts.ref.release,
            opts.chart,
            '--namespace',
            opts.ref.namespace,
        ];
        if (opts.createNamespace) args.push('--create-namespace');
        if (opts.chartVersion) args.push('--version', opts.chartVersion);
        for (const vf of opts.valuesFiles ?? []) args.push('-f', vf);
        for (const s of opts.set ?? []) args.push('--set', s);
        if (opts.wait) args.push('--wait');
        if (opts.timeout) args.push('--timeout', opts.timeout);

        try {
            await this.proc.run({ cmd: 'helm', args });
        } catch (e) {
            const ee = e as ExecaError;
            const stderr = typeof ee?.stderr === 'string' ? ee.stderr : undefined;
            throw new Error(stderr || 'Helm install/upgrade failed');
        }
    }

    async status(opts: { ref: HelmReleaseRef }): Promise<{ raw: string }> {
        const res = await this.proc.run({
            cmd: 'helm',
            args: ['status', opts.ref.release, '--namespace', opts.ref.namespace],
            allowNonZeroExit: true,
            quiet: true,
        });
        return { raw: res.stdout || res.stderr || '' };
    }

    async uninstall(opts: { ref: HelmReleaseRef; keepHistory?: boolean }): Promise<void> {
        const args = ['uninstall', opts.ref.release, '--namespace', opts.ref.namespace];
        if (opts.keepHistory) args.push('--keep-history');
        await this.proc.run({ cmd: 'helm', args, allowNonZeroExit: true });
    }
}

