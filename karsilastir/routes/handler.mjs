import { html, text } from '../lib/http.mjs';
import { handleAdmin } from './admin.mjs';
import { handlePublic } from './public.mjs';

export function createHandler(ctx) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST')
        return text(res, 405, 'Method not allowed');
      let done = false;
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))
        done = await handleAdmin(ctx, req, res, url);
      else if (req.method === 'POST') done = false;
      else done = handlePublic(ctx, req, res, url);
      if (!done && !res.writableEnded) text(res, 404, 'Not found');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) html(res, e.status || 500, e.status === 413 ? 'Too large' : 'Server error');
    }
  };
}
