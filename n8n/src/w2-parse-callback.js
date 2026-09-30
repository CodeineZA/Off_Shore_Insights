// n8n Code node — W2 "Parse button press". Input: Telegram Trigger callback_query update.
// Only whitelisted Telegram user IDs may act (the trigger also filters; this is the 2nd check).
const ALLOWED = ['6688393980']; // TELEGRAM_ALLOWED_USER_IDS
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const q = $json.callback_query || {};
const from = q.from || {};
const m = String(q.data || '').match(/^(ok|upd):(\d+)$/);
return { json: {
  allowed: ALLOWED.includes(String(from.id)) && !!m,
  fn: m ? (m[1] === 'ok' ? 'confirm_flag' : 'flag_needs_update') : null,
  flag_id: m ? Number(m[2]) : null,
  reviewer: 'telegram:' + (from.username || from.id),
  callback_id: q.id,
  chat_id: q.message?.chat?.id,
  message_id: q.message?.message_id,
  original_html: esc(q.message?.text || ''),
} };
