// Signing in to Кремлёвский Ассистент with Telegram (ticket 18), as a Supabase edge function (Deno), deployed with JWT
// verification off: Telegram calls it too.
//
// - Telegram's updates (the bot's webhook, told apart by its secret header): «/start <id>» from the link the
//   app opened writes down who pressed it under that id.
// - POST {action: 'bot'}: the bot's username, for the app's t.me link.
// - POST {action: 'claim', secret, link?}: the app, with the secret whose SHA-256 is the id, takes the sign-in:
//   a token to trade for a session — or, with `link` and the player's own session, Telegram joins that account.
// - GET ?setup: points the bot's webhook here (once, after deploying). Harmless to call again.
//
// Needs the secret TELEGRAM_BOT_TOKEN; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are the platform's own.

import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A sign-in not taken by the app in this long is forgotten. */
const LIFETIME_MS = 10 * 60 * 1000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (text: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

/** What Telegram sends with every update: derived from the token, so the setup needs nothing else. */
const webhookSecret = () => sha256(`webhook:${TOKEN}`);

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

let botUsername: string | undefined;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500);
  if (request.headers.has('x-telegram-bot-api-secret-token')) return onUpdate(request);

  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.has('setup')) {
    const result = await telegram('setWebhook', {
      url: `${SUPABASE_URL}/functions/v1/telegram-login`,
      secret_token: await webhookSecret(),
      allowed_updates: ['message'],
    });
    return json({ ok: result.ok, description: result.description });
  }

  const body = await request.json().catch(() => ({}));
  if (body.action === 'bot') {
    botUsername ??= (await telegram('getMe', {})).result?.username;
    return json({ username: botUsername });
  }
  if (body.action === 'claim') return claim(request, body);
  return json({ error: 'unknown action' }, 400);
});

/** «/start <id>» from the app's link: who pressed it, under that id. Anything else gets a word on what the bot is. */
async function onUpdate(request: Request) {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret())) return new Response('forbidden', { status: 403 });
  const update = await request.json().catch(() => ({}));
  const message = update.message;
  if (!message?.chat) return new Response('ok');
  const start = /^\/start ([A-Za-z0-9_-]{43})$/.exec(message.text ?? '');
  if (start && message.from && !message.from.is_bot) {
    const from = message.from;
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Игрок';
    // A second «Start» on the same link changes nothing: the first one counts.
    const { error } = await admin.from('telegram_logins').insert({ id: start[1], telegram_id: from.id, name, username: from.username ?? null });
    const text = error && error.code !== '23505' ? 'Не получилось — попробуйте ещё раз из ассистента.' : 'Готово! Вернитесь в Кремлёвский Ассистент — вход завершится сам.';
    await telegram('sendMessage', { chat_id: message.chat.id, text });
  } else {
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: 'Это бот входа в Кремлёвский Ассистент. Откройте ассистент → «Настройки» → «Аккаунт» и нажмите «Войти через Telegram».',
    });
  }
  return new Response('ok');
}

async function claim(request: Request, body: { secret?: unknown; link?: unknown }) {
  if (typeof body.secret !== 'string' || body.secret.length < 32) return json({ error: 'bad secret' }, 400);
  await admin.from('telegram_logins').delete().lt('created_at', new Date(Date.now() - LIFETIME_MS).toISOString());
  const id = await sha256(body.secret);
  const { data: login } = await admin.from('telegram_logins').select('*').eq('id', id).maybeSingle();
  if (!login) return json({ status: 'waiting' });
  await admin.from('telegram_logins').delete().eq('id', id);

  const telegramMeta = { telegram_id: login.telegram_id, telegram_name: login.name, telegram_username: login.username };
  const { data: known } = await admin.from('telegram_accounts').select('user_id').eq('telegram_id', login.telegram_id).maybeSingle();

  // Joining Telegram to the account the player is signed in to in the app.
  if (body.link) {
    const jwt = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const { data } = await admin.auth.getUser(jwt);
    const user = data.user;
    if (!user) return json({ status: 'unauthorized' });
    if (known && known.user_id !== user.id) return json({ status: 'taken' });
    if (!known) {
      const { error } = await admin.from('telegram_accounts').insert({ telegram_id: login.telegram_id, user_id: user.id });
      if (error) return json({ status: 'taken' });
    }
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, ...telegramMeta } });
    return json({ status: 'linked', name: login.name, username: login.username });
  }

  // Signing in: to the account this Telegram belongs to, or to a new one of its own.
  let email: string | undefined;
  if (known) {
    const { data } = await admin.auth.admin.getUserById(known.user_id);
    email = data.user?.email;
  } else {
    // No mail is ever sent: the address only names the account (.invalid is reserved for that).
    email = `telegram-${login.telegram_id}@users.ro-helper.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: login.name, provider: 'telegram', ...telegramMeta },
    });
    if (error || !data.user) return json({ status: 'failed', error: error?.message }, 500);
    await admin.from('telegram_accounts').insert({ telegram_id: login.telegram_id, user_id: data.user.id });
  }
  if (!email) return json({ status: 'failed', error: 'the account has no address to sign in with' }, 500);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link.properties?.hashed_token) return json({ status: 'failed', error: error?.message }, 500);
  return json({ status: 'signed-in', token_hash: link.properties.hashed_token });
}
