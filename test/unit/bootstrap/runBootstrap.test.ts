import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { CliError } from '../../../src/core/errors.js';
import type { ProcRunner } from '../../../src/core/proc.js';

vi.mock('../../../src/core/preflight.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/core/preflight.js')>();
  return {
    ...mod,
    getToolPresence: vi.fn(),
  };
});

import { getToolPresence } from '../../../src/core/preflight.js';
import { runLocalBootstrap } from '../../../src/core/bootstrap/runBootstrap.js';

function mockProc(partial: ProcRunner['run']): ProcRunner {
  return { run: vi.fn(partial) } as unknown as ProcRunner;
}

describe('runLocalBootstrap', () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    vi.mocked(getToolPresence).mockReset();
  });

  it('returns early when all tools are present', async () => {
    vi.mocked(getToolPresence).mockResolvedValue({
      docker: true,
      kubectl: true,
      helm: true,
      kind: true,
    });

    const report = await runLocalBootstrap({
      proc: mockProc(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      dryRun: false,
      noDocker: false,
    });

    expect(report.commandsRun).toHaveLength(0);
    expect(report.notes.some((n) => n.includes('already'))).toBe(true);
  });

  it('darwin + Homebrew: dry-run plans brew install for missing CLI tools', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    vi.mocked(getToolPresence).mockResolvedValue({
      docker: true,
      kubectl: false,
      helm: false,
      kind: false,
    });

    const proc = mockProc(async (cmd: string, args: string[]) => {
      if (cmd === 'brew' && args[0] === '--version') {
        return { stdout: 'Homebrew 4', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const report = await runLocalBootstrap({ proc, dryRun: true, noDocker: false });

    expect(report.commandsRun.some((c) => c.includes('brew install'))).toBe(true);
    expect(report.commandsRun.some((c) => c.includes('kubernetes-cli'))).toBe(true);
    expect(report.commandsRun.some((c) => c.includes('kind'))).toBe(true);
    expect(report.commandsRun.some((c) => c.includes('helm'))).toBe(true);
  });

  it('darwin: throws when Homebrew is missing and not dry-run', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    vi.mocked(getToolPresence).mockResolvedValue({
      docker: true,
      kubectl: false,
      helm: true,
      kind: true,
    });

    const proc = mockProc(async (cmd: string) => {
      if (cmd === 'brew') {
        return { stdout: '', stderr: 'not found', exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await expect(runLocalBootstrap({ proc, dryRun: false, noDocker: false })).rejects.toThrow(CliError);
  });

  it('linux + snap: dry-run lists snap installs when snap exists', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    vi.mocked(getToolPresence).mockResolvedValue({
      docker: true,
      kubectl: false,
      helm: true,
      kind: true,
    });

    const proc = mockProc(async (cmd: string, args: string[]) => {
      if (cmd === 'snap' && args[0] === 'version') {
        return { stdout: 'snap', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const report = await runLocalBootstrap({ proc, dryRun: true, noDocker: false });

    expect(report.commandsRun.some((c) => c.includes('sudo snap install kubectl'))).toBe(true);
    expect(report.commandsRun.some((c) => c.includes('--classic'))).toBe(true);
  });

  it('unsupported OS throws CliError', async () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });

    vi.mocked(getToolPresence).mockResolvedValue({
      docker: false,
      kubectl: true,
      helm: true,
      kind: true,
    });

    const proc = mockProc(async () => ({ stdout: '', stderr: '', exitCode: 0 }));

    await expect(runLocalBootstrap({ proc, dryRun: true, noDocker: false })).rejects.toMatchObject({
      code: 'BOOTSTRAP_UNSUPPORTED',
    });
  });
});
