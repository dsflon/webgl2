import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** dev サーバーでリポジトリルートの works.json / thumbs / 作品HTML を配信する */
function serveRepoRoot(): Plugin {
  return {
    name: 'serve-repo-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const m = /^\/(works\.json|thumbs\/[\w.-]+\.(?:jpg|jpeg|png|webp)|[\w-]+\.html)$/.exec(
          url ?? '',
        );
        if (!m || m[1] === undefined) return next();
        const file = resolve(repoRoot, decodeURIComponent(m[1]));
        if (!file.startsWith(repoRoot) || !existsSync(file)) return next();
        const ext = file.split('.').pop() ?? '';
        const mime: Record<string, string> = {
          json: 'application/json',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          html: 'text/html; charset=utf-8',
        };
        res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}

/**
 * ビルド時に works.json から <noscript> 用の実体リンク一覧を index.html に埋め込む。
 * JS 無効環境・クローラー向け(仕様 §7.3 / §10)。実行時の sr-only nav とは別系統。
 */
function injectNoscriptNav(): Plugin {
  return {
    name: 'inject-noscript-nav',
    transformIndexHtml(html) {
      const works = JSON.parse(readFileSync(resolve(repoRoot, 'works.json'), 'utf-8')) as Array<{
        file: string;
        title: string;
        date: string;
      }>;
      const items = works
        .map((w) => `<li><a href="${w.file}">${escapeHtml(w.title)} (${w.date})</a></li>`)
        .join('\n        ');
      return html.replace('<!--WORKS_NOSCRIPT-->', items);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default defineConfig({
  plugins: [serveRepoRoot(), injectNoscriptNav()],
  base: './',
  build: {
    outDir: '..',
    emptyOutDir: false, // ルートには既存の作品HTML等があるため絶対に空にしない
    assetsDir: 'assets/top',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/top/[name]-[hash].js',
        chunkFileNames: 'assets/top/[name]-[hash].js',
        assetFileNames: 'assets/top/[name]-[hash][extname]',
      },
    },
  },
});
