import chalk from 'chalk';

export type OutputMode = 'human' | 'json';

export interface RenderCtx {
    mode: OutputMode;
    verbose: boolean;
}

export function humanInfo(msg: string): string {
    return chalk.cyan(msg);
}

export function humanWarn(msg: string): string {
    return chalk.yellow(msg);
}

export function humanError(msg: string): string {
    return chalk.red(msg);
}

export type Logger = {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
};

export function createCommandLogger(opts: { json?: boolean; verbose?: boolean } = {}): Logger {
    const json = Boolean(opts.json);
    const verbose = Boolean(opts.verbose);
    return {
        info: (msg) => {
            if (json) return;
            process.stdout.write(`${humanInfo(msg)}\n`);
        },
        warn: (msg) => {
            if (json) return;
            process.stdout.write(`${humanWarn(msg)}\n`);
        },
        error: (msg) => {
            if (json) return;
            process.stderr.write(`${humanError(msg)}\n`);
        },
        debug: (msg) => {
            if (json || !verbose) return;
            process.stdout.write(`${chalk.gray(msg)}\n`);
        }
    };
}

export function logDebug(msg: string): void {
    if (process.env.NANGOCTL_DEBUG === '1') {
        process.stdout.write(`${chalk.gray(msg)}\n`);
    }
}

export function renderHuman(params: { title: string; body: string[] }): void {
    process.stdout.write(`${params.title}\n`);
    for (const line of params.body) {
        process.stdout.write(`- ${line}\n`);
    }
}

export function renderJson(obj: unknown): void {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

export function renderText(line: string): void {
    process.stdout.write(line + '\n');
}
