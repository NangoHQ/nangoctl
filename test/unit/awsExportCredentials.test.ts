import { describe, expect, it } from 'vitest';

import { runAwsExportCredentials } from '../../src/core/aws/exportCredentials.js';
import { ProcRunner } from '../../src/core/proc.js';

describe('runAwsExportCredentials', () => {
  it('parses process-format JSON from stdout', async () => {
    const proc = {
      async run(cmd: string, args: string[]) {
        if (cmd === 'aws' && args[0] === 'configure' && args[1] === 'export-credentials' && args.includes('process')) {
          return {
            stdout: JSON.stringify({
              Version: 1,
              AccessKeyId: 'AKIATEST',
              SecretAccessKey: 'secret',
              SessionToken: 'token',
            }),
            stderr: '',
            exitCode: 0,
          };
        }
        throw new Error(`unexpected: ${cmd} ${args.join(' ')}`);
      },
    } as unknown as ProcRunner;

    const creds = await runAwsExportCredentials(proc, 'p');
    expect(creds.AccessKeyId).toBe('AKIATEST');
    expect(creds.SecretAccessKey).toBe('secret');
    expect(creds.SessionToken).toBe('token');
  });

  it('falls back to env format when process stdout is not JSON', async () => {
    let call = 0;
    const proc = {
      async run(cmd: string, args: string[]) {
        if (cmd !== 'aws' || args[1] !== 'export-credentials') throw new Error('unexpected');
        call += 1;
        if (args.includes('process')) {
          return { stdout: 'not json\n', stderr: '', exitCode: 0 };
        }
        if (args.includes('env')) {
          return {
            stdout: 'export AWS_ACCESS_KEY_ID=AKIAENV\nexport AWS_SECRET_ACCESS_KEY=sec\n',
            stderr: '',
            exitCode: 0,
          };
        }
        throw new Error('unexpected');
      },
    } as unknown as ProcRunner;

    const creds = await runAwsExportCredentials(proc, 'p');
    expect(creds.AccessKeyId).toBe('AKIAENV');
    expect(creds.SecretAccessKey).toBe('sec');
    expect(call).toBe(2);
  });
});
