import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = import.meta.dirname;

/**
 * Copy runtime assets that must NOT go through Vite's HTML/JS pipeline:
 *  - widgets/*  : the OBS widget windows. They are loaded by URL AND read raw by
 *                 the Rust backend (resolve_resource) as default content, so they
 *                 must stay byte-identical — never bundled/hashed.
 *  - locales/*  : fetched at runtime via fetch('./locales/<lang>.json').
 *  - icon.ico   : referenced as a window/runtime asset.
 *
 * In dev these are served straight from `src/` (the Vite root); this hook only
 * runs for `vite build`, mirroring them into the dist output.
 */
function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    closeBundle() {
      const out = resolve(projectRoot, 'dist');
      const copies = [
        ['src/widgets', 'widgets'],
        ['src/locales', 'locales'],
        ['src/icon.ico', 'icon.ico'],
      ];
      for (const [from, to] of copies) {
        const src = resolve(projectRoot, from);
        if (existsSync(src)) cpSync(src, resolve(out, to), { recursive: true });
      }
    },
  };
}

// Only the main app (index.html) goes through Vite/bundling. The widget windows
// stay as standalone files (see copyRuntimeAssets). Tauri serves the dev server
// on a fixed port and ships the built output from ../dist (see tauri.conf.json).
export default defineConfig({
  root: 'src',
  publicDir: false,
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // Single entry: Vite uses <root>/index.html (src/index.html) by default.
    // The widget windows are not Vite entries — they're copied verbatim above.
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  plugins: [copyRuntimeAssets()],
});
