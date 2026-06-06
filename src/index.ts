import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { setupBot } from './bot';
import { Env } from './db';
import { syncMatches } from './sync';

const app = new Hono<{ Bindings: Env }>();

app.post('/webhook', async (c) => {
  try {
    const bot = setupBot(c.env);
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


