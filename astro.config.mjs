// @ts-check
import { defineConfig } from 'astro/config';
import serviceWorker from './integrations/service-worker.mjs';

// Pure static build served as Cloudflare static assets (see wrangler.jsonc).
// The service worker is generated after the build so it can precache every file.
export default defineConfig({
  site: 'https://workout-timer.jonoba.no',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [serviceWorker()],
});
