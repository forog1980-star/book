import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function syncDocsBuildPlugin() {
  return {
    name: 'sync-docs-build',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const docsDir = path.resolve(__dirname, 'docs');
        const distAssetsDir = path.join(distDir, 'assets');
        const docsAssetsDir = path.join(docsDir, 'assets');

        if (!fs.existsSync(distDir) || !fs.existsSync(docsDir)) return;

        for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) {
          const srcFile = path.join(distDir, file);
          if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(docsDir, file));
          }
        }

        if (fs.existsSync(distAssetsDir)) {
          fs.mkdirSync(docsAssetsDir, { recursive: true });
          for (const existing of fs.readdirSync(docsAssetsDir)) {
            if (existing.startsWith('index-')) {
              fs.rmSync(path.join(docsAssetsDir, existing), { force: true });
            }
          }
          for (const built of fs.readdirSync(distAssetsDir)) {
            if (built.startsWith('index-')) {
              fs.copyFileSync(
                path.join(distAssetsDir, built),
                path.join(docsAssetsDir, built)
              );
            }
          }
        }
      } catch {
        // Non-fatal if docs directory is read-only
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), syncDocsBuildPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
