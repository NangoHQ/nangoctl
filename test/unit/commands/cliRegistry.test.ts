import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';

import { buildCli } from '../../../src/cli.js';

function directSubcommandNames(cmd: Command): string[] {
  return cmd.commands.map((c) => c.name());
}

describe('CLI command registry', () => {
  it('registers top-level commands', () => {
    const program = buildCli();
    expect(directSubcommandNames(program).sort()).toEqual(['local', 'version']);
  });

  it('registers all `local` subcommands', () => {
    const program = buildCli();
    const local = program.commands.find((c) => c.name() === 'local');
    expect(local).toBeDefined();
    const names = directSubcommandNames(local!).sort();
    expect(names).toEqual([
      'bootstrap',
      'close',
      'config',
      'credentials',
      'install',
      'logs',
      'open',
      'status',
      'uninstall',
    ]);
  });

  it('registers global CLI flags on the root program', () => {
    const program = buildCli();
    const longFlags = program.options.map((o) => o.long).filter(Boolean);
    expect(longFlags).toContain('--json');
    expect(longFlags).toContain('--verbose');
  });
});
