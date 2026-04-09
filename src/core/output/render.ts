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

