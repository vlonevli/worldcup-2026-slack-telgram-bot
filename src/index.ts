import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { setupBot } from './bot';
import { Env } from './db';
import { syncMatches } from './sync';
import { flagsData } from './flagsData';

const app = new Hono<{ Bindings: Env }>();

app.get('/flags/:filename', (c) => {
  const filename = c.req.param('filename');
  const code = filename.replace('.png', '').toUpperCase();
  const base64 = flagsData[code];
  if (!base64) {
    return c.notFound();
  }

  // Decode base64 to binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return c.body(bytes, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=604800' // 1 week cache
  });
});

app.get('/release-stuck', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.text('No token configured', 500);

  // 1. Delete Webhook and drop pending updates
  const deleteUrl = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`;
  const deleteRes = await fetch(deleteUrl);
  const deleteJson = await deleteRes.json();

  // 2. Set Webhook again
  const webhookUrl = new URL(c.req.url).origin + '/webhook';
  const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`;
  const setRes = await fetch(setUrl);
  const setJson = await setRes.json();

  return c.json({
    message: "Stuck users should now be released. Webhook reset successfully.",
    deleteWebhookResult: deleteJson,
    setWebhookResult: setJson
  });
});

app.post('/webhook', async (c) => {
  try {
    const origin = new URL(c.req.url).origin;
    const bot = setupBot(c.env, origin);
    const handler = webhookCallback(bot, 'cloudflare-mod');
    return await handler(c.req.raw);
  } catch (e: any) {
    console.error("WEBHOOK ERROR:", e.message, e.stack);
    return c.text(`Error: ${e.message}`, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncMatches(env));
  }
};


