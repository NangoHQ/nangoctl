export class NangoctlError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  public readonly hints: string[];

  constructor(params: { code: string; message: string; cause?: unknown; hints?: string[] }) {
    super(params.message);
    this.name = this.constructor.name;
    this.code = params.code;
    this.cause = params.cause;
    this.hints = params.hints ?? [];
  }
}

export class PreflightError extends NangoctlError {
  constructor(message: string, hints: string[] = [], cause?: unknown) {
    super({ code: 'PREFLIGHT_FAILED', message, hints, cause });
  }
}

export class ProcError extends NangoctlError {
  public readonly command: string;
  public readonly exitCode?: number;
  public readonly stderr?: string;

  constructor(params: {
    message: string;
    command: string;
    exitCode?: number;
    stderr?: string;
    hints?: string[];
    cause?: unknown;
  }) {
    super({ code: 'PROC_FAILED', message: params.message, hints: params.hints, cause: params.cause });
    this.command = params.command;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
  }
}

