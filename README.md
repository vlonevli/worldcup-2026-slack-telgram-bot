# 🏆 World Cup 2026 Telegram Bot

A highly interactive and real-time Telegram Bot providing fixtures, results, standings, live matches, and detailed team statistics/lore for the FIFA World Cup 2026.

📢 **Live Bot on Telegram:** [t.me/WorldC26bot](https://t.me/WorldC26bot)

---

## ✨ Features

- **🏆 Matches Today:** View scheduled and completed matches for the current day.
- **🗓️ Next Match:** Countdown and details for the upcoming match.
- **📊 Standings:** Interactive inline keyboard showing the tables/standings for Groups A to L.
- **📡 Live Matches:** Get real-time live score updates.
- **🌟 Team Profile:** Retrieve continent, confederation, group, custom team lore, tournament statistics (matches played, wins, goals, red cards), last match, and next match details.

---

## 🛠️ Technology Stack

- **Framework:** [Grammy](https://grammy.dev/) (Telegram Bot Framework)
- **API Router:** [Hono](https://hono.dev/)
- **Serverless Platform:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless SQL Database)
- **Graphics/Rendering:** [Satori](https://github.com/vercel/satori) & [Resvg](https://github.com/RazrFalcon/resvg) (for dynamic image rendering)
- **Language:** TypeScript

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js** (v18 or higher recommended)
- **Cloudflare Wrangler CLI** (installed via npm)
- A **Telegram Bot Token** (obtainable from [@BotFather](https://t.me/BotFather))

### 🔧 Local Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vlonevli/wc26-bot.git
   cd wc26-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Database Initialization:**
   Initialize your local D1 database:
   ```bash
   npx wrangler d1 execute wc26-db --local --file=schema.sql
   ```

4. **Seed Database:**
   Seed local database with initial World Cup data:
   ```bash
   npm run seed
   ```

5. **Set Environment Variables:**
   Create a `.dev.vars` file in the root directory:
   ```env
   TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
   FOOTBALL_DATA_API_KEY="YOUR_FOOTBALL_DATA_API_KEY"
   ```

6. **Run Locally:**
   Start the local wrangler dev environment:
   ```bash
   npm run dev
   ```

---

## 🌐 Deployment to Cloudflare

1. **Create D1 Database in Cloudflare:**
   ```bash
   npx wrangler d1 create wc26-db
   ```
   *Copy the outputted `database_id` and replace the placeholder `database_id` in your [wrangler.toml](file:///f:/BOTS%20AI/wc%2026/wrangler.toml).*

2. **Run Remote Database Schema & Seed:**
   Execute migrations on the remote D1 instance:
   ```bash
   npx wrangler d1 execute wc26-db --remote --file=schema.sql
   node scripts/seed-remote.js
   ```

3. **Set Secrets in Cloudflare:**
   Set production secret tokens:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put FOOTBALL_DATA_API_KEY
   ```

4. **Deploy Bot:**
   Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

---

## 📜 License

This project is licensed under the [MIT License](file:///f:/BOTS%20AI/wc%2026/LICENSE).
