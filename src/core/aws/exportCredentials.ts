import { z } from 'zod';

import { PreflightError } from '../errors.js';
import type { ProcRunner } from '../proc.js';

const ExportSchema = z.object({
  AccessKeyId: z.string(),
  SecretAccessKey: z.string(),
  SessionToken: z.string().optional(),
});

export type ExportedAwsCredentials = z.infer<typeof ExportSchema>;

export async function assertAwsCliAvailable(proc: ProcRunner): Promise<void> {
  const r = await proc.run('aws', ['--version'], { stdio: 'pipe', allowNonZeroExit: true });
  if (r.exitCode !== 0) {
    throw new PreflightError('AWS CLI not found on PATH (required for `--aws-profile`).', [
      'Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
    ]);
  }
}

export async function runAwsSsoLogin(proc: ProcRunner, profile: string): Promise<void> {
  await proc.run('aws', ['sso', 'login', '--profile', profile], { stdio: 'inherit' });
}

export async function runAwsConfigureGetRegion(proc: ProcRunner, profile: string): Promise<string | undefined> {
  const r = await proc.run('aws', ['configure', 'get', 'region', '--profile', profile], {
    stdio: 'pipe',
    allowNonZeroExit: true,
  });
  if (r.exitCode !== 0) return undefined;
  const line = r.stdout.trim();
  return line.length > 0 ? line : undefined;
}

function parseEnvExportCredentials(stdout: string): ExportedAwsCredentials | null {
  const lines = stdout.split(/\r?\n/);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(?:export\s+)?(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)=(.*)$/);
    if (m) map[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  if (!map.AWS_ACCESS_KEY_ID || !map.AWS_SECRET_ACCESS_KEY) return null;
  const out = ExportSchema.safeParse({
    AccessKeyId: map.AWS_ACCESS_KEY_ID,
    SecretAccessKey: map.AWS_SECRET_ACCESS_KEY,
    SessionToken: map.AWS_SESSION_TOKEN,
  });
  return out.success ? out.data : null;
}

/**
 * Resolves short-lived keys for the profile. Uses `--format process` (JSON on stdout) because some
 * AWS CLI builds reject `--format json` (only `process`, `env`, etc. are valid).
 */
export async function runAwsExportCredentials(proc: ProcRunner, profile: string): Promise<ExportedAwsCredentials> {
  const r = await proc.run('aws', ['configure', 'export-credentials', '--profile', profile, '--format', 'process'], {
    stdio: 'pipe',
  });
  const raw = r.stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    const envParsed = parseEnvExportCredentials(raw);
    if (envParsed) return envParsed;

    const rEnv = await proc.run('aws', ['configure', 'export-credentials', '--profile', profile, '--format', 'env'], {
      stdio: 'pipe',
    });
    const fromEnv = parseEnvExportCredentials(rEnv.stdout);
    if (fromEnv) return fromEnv;

    const hint = (r.stderr || r.stdout || rEnv.stderr || rEnv.stdout || 'No output').trim();
    throw new PreflightError(
      '`aws configure export-credentials` did not return usable credentials (expected JSON from `--format process` or `export VAR=…` from `--format env`).',
      [hint.slice(0, 2000)]
    );
  }
  const out = ExportSchema.safeParse(parsed);
  if (!out.success) {
    throw new PreflightError(`AWS credentials export missing expected fields: ${out.error.message}`, [
      'Try: aws sso login --profile <name>',
    ]);
  }
  return out.data;
}
