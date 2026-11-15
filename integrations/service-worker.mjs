// Astro integration that writes dist/sw.js after the build.
// It lists every built file so the app works fully offline, and derives the cache
// version from the file contents, so each deploy that changes anything gets a new cache.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Files that must not be precached: server config, crawler hints and the worker itself.
const SKIP = new Set(['sw.js', '_headers', '_redirects', 'robots.txt', '404.html']);

/** @returns {import('astro').AstroIntegration} */
export default function serviceWorker() {
  return {
    name: 'service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const entries = await readdir(root, { recursive: true, withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile())
          .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
          .filter((f) => !SKIP.has(f))
          .sort();

        const hash = createHash('sha256');
        for (const f of files) {
          hash.update(f);
          hash.update(await readFile(join(root, f)));
        }
        const version = hash.digest('hex').slice(0, 12);
        // index.html is served at "/" (html_handling: auto-trailing-slash).
        const urls = files.map((f) => (f === 'index.html' ? '/' : `/${f}`));

        const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
        const sw = template
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(urls, null, 2));
        await writeFile(join(root, 'sw.js'), sw);
        logger.info(`sw.js: ${urls.length} files precached, version ${version}`);
      },
    },
  };
}
