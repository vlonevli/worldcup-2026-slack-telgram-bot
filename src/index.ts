import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { setupBot } from './bot';
import { Env } from './db';
import { syncMatches } from './sync';
import { flagsData } from './flagsData';

const app = new Hono<{ Bindings: Env }>();

app.get('/flags/:filename', (c) => {
  const filename = c.req.param('filename');
  const code = filename.replace('.svg', '').toUpperCase();
  const svg = flagsData[code];
  if (!svg) {
    return c.notFound();
  }
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400'
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


