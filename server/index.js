/**
 * Local development entry point. Listens on a port and serves the static site
 * itself.
 *
 * In production on Vercel this file is not used: `api/index.js` hands the same
 * Express app to the platform as a serverless function, and the files in
 * public/ are served from the CDN instead of by Express.
 */

import app, { summary } from './app.js';

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`\n  NinoRepair → http://localhost:${PORT}`);
  for (const line of summary()) console.log(`  ${line}`);
  console.log('');
});
