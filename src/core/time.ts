import { CliError } from './errors.js';

// Minimal duration parser for CLI flags.
// Supports: 30s, 5m, 2h, 1d (case-insensitive). Defaults to ms if pure number.
export function parseDurationMs(input: string): number {
  const raw = String(input).trim();
  if (!raw) throw new CliError('DURATION_INVALID', 'Duration is required');

  const m = raw.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) throw new CliError('DURATION_INVALID', `Invalid duration: ${raw}`);

  const n = Number(m[1]);
  const unit = (m[2] ?? 'ms').toLowerCase();
  const mult =
    unit === 'ms'
      ? 1
      : unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : unit === 'd'
              ? 86_400_000
              : null;

  if (!mult) throw new CliError('DURATION_INVALID', `Invalid duration unit: ${unit}`);
  return n * mult;
}

