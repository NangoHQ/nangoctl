import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/bin/nangoctl.ts'],
    format: ['cjs'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: true,
    dts: false,
    minify: false,
    splitting: false,
    outDir: 'dist'
});

