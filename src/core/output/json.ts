import type { JsonValue } from '../types.js';

export type JsonMode = boolean;

export function printJson(value: JsonValue): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

