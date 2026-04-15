import { describe, expect, it } from 'vitest';

import { logsLabelSelector } from '../../../src/commands/local/logs.js';

describe('local logs label selector', () => {
  it('uses equality for a single component', () => {
    expect(logsLabelSelector('server')).toBe('app.kubernetes.io/component=server');
    expect(logsLabelSelector('jobs')).toBe('app.kubernetes.io/component=jobs');
  });

  it('uses set-based selector for `all`', () => {
    expect(logsLabelSelector('all')).toBe(
      'app.kubernetes.io/component in (server,persist,orchestrator,jobs,runner)'
    );
  });
});
