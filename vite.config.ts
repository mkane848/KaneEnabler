import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'));

export default defineConfig({
  plugins: [react()],
  // Baked in at build time so the About modal can show a version without
  // shipping the rest of package.json (scripts, devDependencies) to the client.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
