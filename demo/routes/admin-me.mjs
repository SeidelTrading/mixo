import { send } from '../lib/http.mjs';
import { store } from '../lib/store.mjs';
import { ROLES } from '../lib/auth.mjs';

// Oturum durumu.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminMeRoutes(c) {
  const { res, p, auth } = c;
  if (p === '/api/admin/me')
    return send(res, 200, {
      admin: !!auth,
      configured: store.users.activeAdmins() > 0,
      user: auth
        ? { username: auth.user.username, role: auth.user.role, roleLabel: ROLES[auth.user.role] }
        : null,
    });
}
