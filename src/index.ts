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


