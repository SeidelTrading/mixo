import { TOOL_HANDLERS } from './tool-handlers.mjs';
import { getClient } from '../lib/ai.mjs';
import { HISTORY_TURNS, UNTRUSTED_TOOLS, convs } from './assistant-gate.mjs';
import { MODEL } from '../lib/config.mjs';
import { SYSTEM, TOOLS } from './assistant-tools.mjs';

async function runTool(name, input, conv) {
  input = input && typeof input === 'object' ? input : {};
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: 'bilinmeyen araç' };
  }
  return handler(input, conv);
}

export async function assistant(convId, text, owner = null) {
  const client = getClient();
  const conv = convs.get(convId) || { messages: [], t: Date.now(), owner };
  convs.set(convId, conv);
  conv.t = Date.now();
  conv.applied = [];
  conv.newPending = [];
  if (convs.size > 50) convs.delete([...convs].sort((a, b) => a[1].t - b[1].t)[0][0]);
  // Maliyet tavanı: geçmişte yalnız son HISTORY_TURNS tur tutulur (tur sınırından kesilir; araç çağrısı/sonucu çiftleri bölünmez).
  const turnStarts = conv.messages
    .map((m, i) => (m.role === 'user' && typeof m.content === 'string' ? i : -1))
    .filter(i => i >= 0);
  if (turnStarts.length > HISTORY_TURNS)
    conv.messages.splice(0, turnStarts[turnStarts.length - HISTORY_TURNS]);
  const start = conv.messages.length;
  conv.messages.push({ role: 'user', content: text });
  const used = [];
  let reply = '';
  try {
    for (let i = 0; i < 12; i++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM,
        tools: TOOLS,
        messages: conv.messages,
      });
      conv.messages.push({ role: 'assistant', content: res.content });
      reply =
        res.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim() || reply;
      if (res.stop_reason === 'refusal') {
        reply = 'Bu isteğe yanıt veremiyorum.';
        break;
      }
      if (res.stop_reason === 'pause_turn') continue;
      if (res.stop_reason !== 'tool_use') {
        if (res.stop_reason === 'max_tokens') reply += '\n\n(Yanıt uzunluk sınırına takıldı.)';
        break;
      }
      const results = [];
      for (const b of res.content)
        if (b.type === 'tool_use') {
          if (UNTRUSTED_TOOLS.has(b.name)) conv.tainted = true; // bu andan sonra bu konuşmadaki yazmalar onay ister
          let out;
          try {
            out = await runTool(b.name, b.input, conv);
          } catch (e) {
            out = { error: String(e.message || e) };
          }
          used.push(b.name);
          results.push({
            type: 'tool_result',
            tool_use_id: b.id,
            content: JSON.stringify(out),
            is_error: !!(/** @type {any} */ (out)?.error),
          });
        }
      conv.messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    conv.messages.length = start;
    throw e;
  } // yarım kalan turu geçmişten çıkar
  return {
    reply: reply || '(yanıt boş)',
    tools: used,
    applied: conv.applied.map(c => ({ id: c.id, summary: c.summary })),
    pending: conv.newPending.map(p => ({ id: p.id, text: p.text, count: p.count ?? p.ids.length })),
  };
}
