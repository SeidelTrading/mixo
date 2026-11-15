// Yönetici uçları (/api/admin/instagram/*): GET → okuma, öteki yöntemler → yazma. Uçlar üç dosyada (state, posts, inbox).
import { makeStateRoutes } from './admin-state.mjs';
import { makePostRoutes } from './admin-posts.mjs';
import { makeInboxRoutes } from './admin-inbox.mjs';

export function makeAdmin(c) {
  const { bad, view } = c;
  const GET = makeStateRoutes(c).GET;
  const POST = { ...makePostRoutes(c).POST, ...makeInboxRoutes(c).POST };
  // GET → okuma uçları; öteki yöntemler → yazma uçları. Eşleşmeyen yol 404.
  async function admin(p, method, body, url) {
    const sub = p.slice('/api/admin/instagram'.length) || '/';
    const handler = (method === 'GET' ? GET : POST)[sub];
    return handler ? handler(body, url, p, sub) : bad(404, 'yok');
  }
  const draftView = po => view(po);
  return { admin, draftView };
}
