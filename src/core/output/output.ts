export class StdoutOut {
  writeLine(line: string): void {
    process.stdout.write(line + '\n');
  }

  write(text: string): void {
    process.stdout.write(text);
  }
}

export class JsonOut {
  write(obj: unknown): void {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  writeLine(line: string): void {
    process.stdout.write(line + '\n');
  }
}

export function createOutput(opts: { json: boolean }): StdoutOut | JsonOut {
  return opts.json ? new JsonOut() : new StdoutOut();
}

// Convenience helpers for ad-hoc logging (prefer ctx.out for command output)
export const output = {
  info: (msg: string) => process.stdout.write(msg + '\n'),
  warn: (msg: string) => process.stdout.write(msg + '\n'),
  error: (msg: string) => process.stderr.write(msg + '\n'),
};
