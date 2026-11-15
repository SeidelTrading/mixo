import { send } from '../lib/http.mjs';
import { limited } from '../lib/auth.mjs';
import { assistant } from '../services/assistant.mjs';
import { AI_DAILY, takeAiQuota } from '../services/assistant-gate.mjs';
import Anthropic from '@anthropic-ai/sdk';

// Yapay zekâ asistanı ucu.
// Eşleşmeyen istekte hiçbir şey yazmadan döner; yanıt yazıldıysa işleyici zinciri durur (bkz. handler.mjs).
export async function adminAssistantRoutes(c) {
  const { res, p, ip, body, me } = c;
  if (p === '/api/admin/assistant') {
    const text = String(body.text || '')
        .trim()
        .slice(0, 4000),
      cid = `${me.id}:${String(body.conversation || '').slice(0, 40) || 'default'}`;
    if (!text) return send(res, 400, { error: 'Mesaj boş.' });
    if (limited('ai' + ip, 20, 60e3)) return send(res, 429, { error: 'Çok hızlı. Biraz bekleyin.' });
    if (!takeAiQuota())
      return send(res, 429, {
        error: `Asistanın günlük istek sınırı (${AI_DAILY}) doldu. Yarın yeniden deneyin.`,
      });
    try {
      return send(res, 200, await assistant(cid, text, me.id));
    } catch (e) {
      if (
        e instanceof Anthropic.AuthenticationError ||
        /apiKey|authToken|credentials/i.test(e?.message || '')
      )
        return send(res, 503, {
          error: 'AI asistanı yapılandırılmamış: sunucuda ANTHROPIC_API_KEY tanımlı değil ya da geçersiz.',
        });
      if (e instanceof Anthropic.RateLimitError)
        return send(res, 429, { error: 'Claude API hız sınırına takıldı. Biraz sonra yeniden deneyin.' });
      if (e instanceof Anthropic.APIError) {
        console.error('assistant', e.status, e.message);
        return send(res, 502, { error: `Claude API hatası (${e.status ?? 'bağlantı'}).` });
      }
      throw e;
    }
  }
}
