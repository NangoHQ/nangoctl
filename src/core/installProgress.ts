import ora, { type Ora } from 'ora';

export type InstallPhaseHandle = {
  succeed: (detail?: string) => void;
  fail: (message: string) => void;
};

export type InstallProgress = {
  /** Human-friendly install header (non-JSON, non-verbose). */
  header: () => void;
  /** Start a phase; call succeed() or fail() when done. */
  phase: (label: string) => InstallPhaseHandle;
  /** Stop any active spinner (call on error paths). */
  dispose: () => void;
};

/**
 * Progress UI for `local install`: quiet JSON → no-op; verbose → section lines; default → ora spinners on stderr.
 */
export function createInstallProgress(opts: { json: boolean; verbose: boolean }): InstallProgress {
  if (opts.json) {
    const noop: InstallPhaseHandle = {
      succeed: () => {},
      fail: () => {},
    };
    return {
      header: () => {},
      phase: () => noop,
      dispose: () => {},
    };
  }

  if (opts.verbose) {
    return {
      header: () => {
        process.stderr.write('\n━━ Nango local install ━━\n\n');
      },
      phase(label: string) {
        process.stderr.write(`▸ ${label}\n`);
        return {
          succeed: (detail?: string) => {
            if (detail) process.stderr.write(`  ${detail}\n`);
          },
          fail: (message: string) => {
            process.stderr.write(`  ✗ ${message}\n`);
          },
        };
      },
      dispose: () => {},
    };
  }

  let spinner: Ora | null = null;

  return {
    header: () => {
      process.stderr.write('\n');
    },
    phase(label: string) {
      spinner?.stop();
      spinner = ora({ text: label, stream: process.stderr, color: 'cyan' }).start();
      return {
        succeed: (detail?: string) => {
          const text = detail ? `${label} — ${detail}` : label;
          spinner?.succeed(text);
          spinner = null;
        },
        fail: (message: string) => {
          spinner?.fail(message);
          spinner = null;
        },
      };
    },
    dispose: () => {
      spinner?.stop();
      spinner = null;
    },
  };
}
