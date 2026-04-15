import { execa, type Options as ExecaOptions } from 'execa';
import { ProcError } from './errors.js';

export type ProcResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

export type ProcRunOptions = {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: 'inherit' | 'pipe';
    /** Pipe stdin from this string (e.g. kubectl apply -f -) */
    stdin?: string;
    redact?: Array<string>;
    quiet?: boolean;
    allowNonZeroExit?: boolean;
};

export class ProcRunner {
    public constructor(private readonly baseEnv: Record<string, string | undefined> = process.env) {}

    async run(cmd: string, args: string[], opts: ProcRunOptions = {}): Promise<ProcResult> {
        const execaOpts: ExecaOptions = {
            cwd: opts.cwd,
            env: { ...this.baseEnv, ...opts.env },
            stdio: opts.stdio ?? (opts.quiet ? 'ignore' : 'pipe'),
            input: opts.stdin,
        };

        try {
            const res = await execa(cmd, args, execaOpts);
            const out = typeof res.stdout === 'string' ? res.stdout : String(res.stdout ?? '');
            const errOut = typeof res.stderr === 'string' ? res.stderr : String(res.stderr ?? '');
            return { stdout: out, stderr: errOut, exitCode: res.exitCode ?? 0 };
        } catch (err: any) {
            const stdout = typeof err?.stdout === 'string' ? err.stdout : String(err?.stdout ?? '');
            const stderr = typeof err?.stderr === 'string' ? err.stderr : String(err?.stderr ?? '');
            const exitCode = err?.exitCode ?? 1;
            if (opts.allowNonZeroExit) {
                return { stdout, stderr, exitCode };
            }
            throw new ProcError({
                message: `${cmd} failed`,
                command: this.redact(`${cmd} ${args.join(' ')}`, opts.redact),
                exitCode,
                stderr: this.redact((stderr || stdout || String(err)).slice(0, 8000), opts.redact),
                cause: err,
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
