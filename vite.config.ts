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
        const distAssetsDir = path.join(distDir, 'assets');
        if (!fs.existsSync(distDir)) return;

        const targetDirs = [
          path.resolve(__dirname, 'docs'),
          path.resolve(__dirname, 'خروجی نرم\u200cافزار'),
        ];

        for (const targetDir of targetDirs) {
          if (!fs.existsSync(targetDir)) continue;
          const targetAssetsDir = path.join(targetDir, 'assets');

          for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) {
            const srcFile = path.join(distDir, file);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, path.join(targetDir, file));
            }
          }

          const distFontsDir = path.join(distDir, 'fonts');
          const targetFontsDir = path.join(targetDir, 'fonts');
          if (fs.existsSync(distFontsDir)) {
            fs.mkdirSync(targetFontsDir, { recursive: true });
            for (const f of fs.readdirSync(distFontsDir)) {
              fs.copyFileSync(path.join(distFontsDir, f), path.join(targetFontsDir, f));
            }
          }

          if (fs.existsSync(distAssetsDir)) {
            fs.mkdirSync(targetAssetsDir, { recursive: true });
            for (const existing of fs.readdirSync(targetAssetsDir)) {
              if (existing.startsWith('index-') || existing.startsWith('Vazirmatn-')) {
                fs.rmSync(path.join(targetAssetsDir, existing), { force: true });
              }
            }
            for (const built of fs.readdirSync(distAssetsDir)) {
              if (built.startsWith('index-') || built.startsWith('Vazirmatn-')) {
                fs.copyFileSync(
                  path.join(distAssetsDir, built),
                  path.join(targetAssetsDir, built)
                );
              }
            }
          }
        }
      } catch {
        // Non-fatal if target directories are read-only
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
