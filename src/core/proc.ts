import { execa, type Options as ExecaOptions } from 'execa';
import { NangoctlError } from './errors.js';

export type ProcResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

export type ProcRunOptions = {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: 'inherit' | 'pipe';
    redact?: Array<string>;
};

export class ProcRunner {
    public constructor(private readonly baseEnv: Record<string, string | undefined> = process.env) {}

    async run(cmd: string, args: string[], opts: ProcRunOptions = {}): Promise<ProcResult> {
        const execaOpts: ExecaOptions = {
            cwd: opts.cwd,
            env: { ...this.baseEnv, ...opts.env },
            stdio: opts.stdio ?? 'pipe'
        };

        try {
            const res = await execa(cmd, args, execaOpts);
            return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.exitCode ?? 0 };
        } catch (err: any) {
            // execa throws on non-zero; capture best-effort output
            const stdout = err?.stdout ?? '';
            const stderr = err?.stderr ?? '';
            const exitCode = err?.exitCode ?? 1;
            throw new NangoctlError(`${cmd} failed`, {
                hint: this.redact(`Command: ${cmd} ${args.join(' ')}`, opts.redact),
                details: this.redact((stderr || stdout || String(err)).slice(0, 8000), opts.redact),
                cause: err
            });
        }
    }

    private redact(text: string, secrets?: Array<string>): string {
        if (!secrets?.length) return text;
        let out = text;
        for (const s of secrets) {
            if (!s) continue;
            out = out.split(s).join('[REDACTED]');
        }
        return out;
    }
}

