import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { cpSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';

const projectRoot = import.meta.dirname;

// Widget windows whose logic lives in a sibling .ts (authored as TS for type
// safety) but must ship as a SINGLE self-contained .html: the windows are loaded
// by URL AND read raw by Rust (resolve_resource) / injected via document.write,
// so no external/hashed assets are allowed. In dev the .html references the .ts
// directly (Vite serves it); for `vite build` we bundle the .ts with esbuild and
// inline it back into the .html, then drop the loose .ts from dist.
const INLINE_TARGETS = [
  { html: 'dist/widgets/design1.html', ts: 'src/widgets/design1.ts', ref: './design1.ts' },
  { html: 'dist/widgets/design2.html', ts: 'src/widgets/design2.ts', ref: './design2.ts' },
  { html: 'dist/widgets/custom1.html', ts: 'src/widgets/custom1.ts', ref: './custom1.ts' },
  { html: 'dist/widgets/custom2.html', ts: 'src/widgets/custom2.ts', ref: './custom2.ts' },
  { html: 'dist/templates/custom2.html', ts: 'src/templates/custom2.ts', ref: '/templates/custom2.ts' },
];
const DIST_TS_TO_REMOVE = [
  'dist/widgets/design1.ts', 'dist/widgets/design2.ts',
  'dist/widgets/custom1.ts', 'dist/widgets/custom2.ts',
  'dist/templates/custom2.ts',
];

function inlineWidgetScripts() {
  for (const { html, ts, ref } of INLINE_TARGETS) {
    const htmlPath = resolve(projectRoot, html);
    const tsPath = resolve(projectRoot, ts);
    if (!existsSync(htmlPath) || !existsSync(tsPath)) continue;

    const bundled = buildSync({
      entryPoints: [tsPath],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'esnext',
      write: false,
    }).outputFiles[0].text;

    // Guard against a literal </script> inside the bundle terminating the tag.
    const safe = bundled.replace(/<\/script>/g, '<\\/script>');
    const tag = `<script type="module" src="${ref}"></script>`;
    const source = readFileSync(htmlPath, 'utf8');
    if (!source.includes(tag)) {
      throw new Error(`inlineWidgetScripts: script tag not found in ${html}`);
    }
    writeFileSync(htmlPath, source.replace(tag, `<script type="module">\n${safe}\n</script>`));
  }
  for (const f of DIST_TS_TO_REMOVE) {
    const p = resolve(projectRoot, f);
    if (existsSync(p)) rmSync(p);
  }
}

/**
 * Copy runtime assets that must NOT go through Vite's HTML/JS pipeline:
 *  - widgets/*  : the OBS widget windows (loaded by URL, read raw by Rust).
 *  - templates/*: default custom-widget content (read raw, document.write'd).
 *  - locales/*  : fetched at runtime via fetch('./locales/<lang>.json').
 *  - icon.ico   : referenced as a window/runtime asset.
 *
 * In dev these are served straight from `src/`; this hook only runs for
 * `vite build`, mirroring them into dist, then inlining the widget .ts scripts
 * so the .html outputs stay self-contained.
 */
function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    closeBundle() {
      const out = resolve(projectRoot, 'dist');
      const copies = [
        ['src/widgets', 'widgets'],
        ['src/templates', 'templates'],
        ['src/locales', 'locales'],
        ['src/icon.ico', 'icon.ico'],
      ];
      for (const [from, to] of copies) {
        const src = resolve(projectRoot, from);
        if (existsSync(src)) cpSync(src, resolve(out, to), { recursive: true });
      }
      inlineWidgetScripts();
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
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  plugins: [svelte({ preprocess: vitePreprocess() }), copyRuntimeAssets()],
});
