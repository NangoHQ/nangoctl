import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: { 'bin/nangoctl': 'src/bin/nangoctl.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
  splitting: false,
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  async onSuccess() {
    const src = path.join(process.cwd(), 'values', 'local.defaults.yaml');
    const destDir = path.join(process.cwd(), 'dist', 'values');
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, path.join(destDir, 'local.defaults.yaml'));
  },
});
