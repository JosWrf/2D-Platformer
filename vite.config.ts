import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/**
 * A short mark of which build is running, shown on the title screen.
 *
 * The game ships as one index.html with no hashed file name, so a browser that
 * holds on to it serves an old game that looks exactly like a new one. Without
 * something visible on screen there is no way to tell a bug from a stale tab.
 */
function buildStamp(): string {
  let sha = 'lokal';
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // No git here; the date alone still says something.
  }
  const day = new Date().toISOString().slice(0, 10);
  return `${day} · ${sha}`;
}

/**
 * Packs the emitted JavaScript straight into index.html, so a build is one
 * self-contained file: it runs from GitHub Pages, from a file:// URL or from
 * any static server without an assets folder next to it.
 */
function singleFile(): Plugin {
  return {
    name: 'shadowblade-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const html = files.find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      const entry = files.find((f) => f.type === 'chunk' && f.isEntry);
      if (html?.type !== 'asset' || entry?.type !== 'chunk') return;

      const name = entry.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const script = new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`);
      const preload = new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`, 'g');
      // A "</script>" inside the code would close the tag we are writing it into.
      const code = entry.code.replace(/<\/script>/gi, '<\\/script>');

      html.source = String(html.source)
        .replace(preload, '')
        .replace(script, () => `<script type="module">${code}</script>`);
      delete bundle[entry.fileName];
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Nothing to preload once the script lives in the document.
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  plugins: [singleFile()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
