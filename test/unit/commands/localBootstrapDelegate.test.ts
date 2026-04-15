import { describe, expect, it, vi, beforeEach } from 'vitest';

const runLocalBootstrapMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    platform: 'darwin',
    dryRun: true,
    noDocker: false,
    before: { docker: true, kubectl: true, helm: true, kind: true },
    commandsRun: [],
    notes: ['Docker, kubectl, Helm, and kind are already available.'],
  })
);

vi.mock('../../../src/core/bootstrap/runBootstrap.js', () => ({
  runLocalBootstrap: runLocalBootstrapMock,
}));

import { buildCli } from '../../../src/cli.js';

describe('local bootstrap command wiring', () => {
  beforeEach(() => {
    runLocalBootstrapMock.mockClear();
  });

  it('passes --dry-run and --no-docker to runLocalBootstrap', async () => {
    const program = buildCli();
    program.exitOverride();

    await program.parseAsync(['local', 'bootstrap', '--dry-run', '--no-docker'], { from: 'user' });

    expect(runLocalBootstrapMock).toHaveBeenCalledTimes(1);
    expect(runLocalBootstrapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        noDocker: true,
      })
    );
  });
});
