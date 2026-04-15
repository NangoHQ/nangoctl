import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

import { buildCli } from '../../../src/cli.js';
import { Kubectl } from '../../../src/core/kubectl.js';

describe('local logs command wiring', () => {
  let spy: MockInstance<(typeof Kubectl.prototype)['logsBySelector']>;

  beforeEach(() => {
    spy = vi.spyOn(Kubectl.prototype, 'logsBySelector').mockImplementation(async () => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('invokes kubectl with set-based selector for --service all', async () => {
    const program = buildCli();
    program.exitOverride();

    await program.parseAsync(
      ['local', 'logs', '-s', 'all', '--namespace', 'my-ns', '--no-follow'],
      { from: 'user' }
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'my-ns',
        selector: 'app.kubernetes.io/component in (server,persist,orchestrator,jobs,runner)',
        follow: false,
      })
    );
  });
});
