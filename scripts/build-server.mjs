// Bundles the Node server (and the shared package it imports) into a single ESM file.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: ['apps/server/src/index.ts'],
  outfile: 'apps/server/dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  packages: 'external',
  // @phantom/shared is a workspace package containing TypeScript source, so it must be bundled.
  plugins: [{
    name: 'bundle-shared',
    setup(b) {
      b.onResolve({ filter: /^@phantom\/shared$/ }, () => ({ path: fileURLToPath(new URL('../apps/shared/src/index.ts', import.meta.url)) }));
    },
  }],
  logLevel: 'info',
});
