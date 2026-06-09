import { Bot, Keyboard, InlineKeyboard } from 'grammy';
import { Env, DBClient, Match } from './db';

// Main Reply Keyboard
const mainKeyboard = new Keyboard()
  .text('🏆 Matches Today').text('🗓️ Next Match').row()
  .text('📊 Standings').text('📡 Live Matches').row()
  .text('🌟Team Profile')
  .resized();

// Inline Keyboard for Groups A-L
const groupsKeyboard = new InlineKeyboard()
  .text('Group A', 'group_standings:A').text('Group B', 'group_standings:B').text('Group C', 'group_standings:C').row()
  .text('Group D', 'group_standings:D').text('Group E', 'group_standings:E').text('Group F', 'group_standings:F').row()
  .text('Group G', 'group_standings:G').text('Group H', 'group_standings:H').text('Group I', 'group_standings:I').row()
  .text('Group J', 'group_standings:J').text('Group K', 'group_standings:K').text('Group L', 'group_standings:L');

async function handleToday(ctx: any, db: DBClient) {
  const matches = await db.getMatchesToday();
  if (matches.length === 0) {
    await ctx.reply('No matches scheduled for today.');
    return;
  }
  let text = '🏆 *Matches Today:*\n\n';
  matches.forEach(m => {
    const score = m.score_team1 !== null ? `(${m.score_team1} - ${m.score_team2})` : 'vs';
    text += `⚽ *${m.team1_name}* ${score} *${m.team2_name}*\n🕒 ${m.time_str} | 🏟️ ${m.ground}\n\n`;
  });
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function handleNext(ctx: any, db: DBClient) {
  const now = Date.now();
  const m = await db.getNextMatch();
  if (!m) {
    await ctx.reply('No upcoming matches scheduled.');
    return;
  }

  const diffMs = m.kickoff_utc - now;
  let countdownText = '';
  if (diffMs > 0) {
    const diffMins = Math.floor(diffMs / 60000);
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    const minutes = diffMins % 60;

    const parts = [];
    if (days > 0) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
    }
    if (hours > 0 || days > 0) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

    let timeStr = '';
    if (parts.length === 1) {
      timeStr = parts[0];
    } else if (parts.length === 2) {
      timeStr = `${parts[0]} and ${parts[1]}`;
    } else {
      timeStr = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
    }

    countdownText = `\n⏳ *Starts in:* ${timeStr} remaining`;
  }

  const text = `🗓️ *Next Upcoming Match:*\n\n⚽ *${m.team1_name}* vs *${m.team2_name}*\n🕒 ${m.time_str}\n🏟️ ${m.ground}${countdownText}`;
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function handleLive(ctx: any, db: DBClient) {
  const matches = await db.getLiveMatches();

  if (!matches || matches.length === 0) {
    await ctx.reply('📡 No matches are currently live.');
    return;
  }

  let text = '📡 *Live Matches:*\n\n';
  matches.forEach((m: Match) => {
    const statusText = m.status === 'PAUSED' ? 'Halftime' : 'Live';
    text += `⚽ *${m.team1_name}* ${m.score_team1 ?? 0} - ${m.score_team2 ?? 0} *${m.team2_name}*\n🕒 Status: ${statusText} | 🏟️ ${m.ground}\n\n`;
  });
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

function visualLength(str: string): number {
  let temp = str;
  // 1. Replace subdivision flags (England, Scotland, Wales, etc.) with 2 spaces.
  temp = temp.replace(/\uD83C\uDFF4(?:[\uDB40-\uDBFF][\uDC00-\uDFFF])+/g, '  ');
  // 2. Replace all remaining surrogate pairs (emojis/flags) with 1 space.
  temp = temp.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ');
  return temp.length;
}

function padEndVisual(str: string, targetLen: number): string {
  const currentLen = visualLength(str);
  if (currentLen >= targetLen) return str;
  return str + ' '.repeat(targetLen - currentLen);
}

function formatStandingsRow(flag: string, pos: string, team: string, p: string, w: string, d: string, l: string, gd: string, pts: string): string {
  let row = '';
  row += flag;

  // pos starts at 3
  row = padEndVisual(row, 3) + pos;

  // team starts at 5
  row = padEndVisual(row, 5) + team;

  // p starts at 16
  row = padEndVisual(row, 16) + p;

  // w starts at 18
  row = padEndVisual(row, 18) + w;

  // d starts at 20
  row = padEndVisual(row, 20) + d;

  // l starts at 22
  row = padEndVisual(row, 22) + l;

  // gd starts at 24
  row = padEndVisual(row, 24) + gd;

  // pts starts at 28
  row = padEndVisual(row, 28) + pts;

  return row;
}

function formatStandingsText(group: string, teams: any[]): string {
  // Sort teams: points descending, then goal_difference descending, then goals_for descending
  teams.sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);

  let text = `🏆 *Group ${group} Standings*\n\n`;

  // Format header using our alignment function, starting with 2 spaces representing the flag column
  const header = formatStandingsRow('  ', '#', 'Team', 'P', 'W', 'D', 'L', 'GD', 'Pts');
  text += `\`${header}\`\n`;

  teams.forEach((t, i) => {
    const flag = t.flag_icon || '🏳️';
    const pos = String(i + 1);
    const displayName = t.team_name.substring(0, 10);
    const p = String(t.played);
    const w = String(t.wins);
    const d = String(t.draws);
    const l = String(t.losses);
    const gd = String(t.goal_difference);
    const pts = String(t.points);

    const row = formatStandingsRow(flag, pos, displayName, p, w, d, l, gd, pts);
    text += `\`${row}\`\n`;
  });

  return text;
}

async function handleGroupTable(ctx: any, db: DBClient, group: string) {
  const standings = await db.getStandingsByGroup(group);
  if (!standings || standings.length === 0) {
    await ctx.reply(`Could not find standings for Group ${group}.`);
    return;
  }

  const text = formatStandingsText(group, standings);
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

const LORE_MAP: Record<string, string> = {
  'Germany': 'Germany has a rich football history with four World Cup titles (1954, 1974, 1990, 2014) and is known for their tactical discipline and tournament endurance.',
  'Brazil': 'Brazil is the most successful national team in World Cup history, with five titles (1958, 1962, 1970, 1994, 2002), famous for their "samba football" and legendary players.',
  'Argentina': 'Argentina are the three-time World Cup champions (1978, 1986, 2022), powered historically by Diego Maradona and Lionel Messi with passionate attacking play.',
  'France': 'France are two-time World Cup winners (1998, 2018), consistently boasting elite youth development and world-class speed and flair.',
  'Italy': 'Italy is a four-time World Cup champion (1934, 1938, 1982, 2006), famous for their legendary defensive masterclass (Catenaccio) and tactical intelligence.',
  'England': 'England, the 1966 World Cup champions, boast the world\'s most popular domestic league and a squad filled with world-class talent hunting for their second title.',
  'Spain': 'Spain won the World Cup in 2010 with their legendary "tiki-taka" passing style, dominating possession and controlling the tempo of global football.',
  'Uruguay': 'Uruguay are two-time World Cup champions (1930, 1950), renowned for their "garra charrúa" (tenacity and fighting spirit) on the international stage.',
  'Mexico': 'Mexico is a dominant force in CONCACAF and a regular World Cup participant, famous for their vibrant fans and energetic high-press play.',
  'Croatia': 'Croatia has consistently punched above their weight, finishing as runners-up in 2018 and third in 1998 and 2022, led by their legendary midfield generation.'
};

async function getTeamProfileText(db: DBClient, countryQuery: string): Promise<string> {
  const team = await db.getTeamByNameOrCode(countryQuery);
  if (!team) {
    return `❌ Could not find a team matching "${countryQuery}". Please check the spelling or FIFA code.`;
  }

  const stats = await db.getTeamStats(team.name);
  const posInfo = await db.getTeamGroupPosition(team.name, team.group_name);
  const lastMatch = await db.getTeamLastMatch(team.name);
  const nextMatch = await db.getTeamNextMatch(team.name);

  // Get lore
  const lore = LORE_MAP[team.name] ||
    `Representing ${team.confed} from ${team.continent}, ${team.name} enters the World Cup 2026 placed in ${team.group_name}, ready to compete against the best teams in the world.`;

  // Format Ordinal position (e.g. 1st, 2nd, 3rd, 4th)
  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const posText = `${getOrdinal(posInfo.position)} of ${posInfo.totalTeams} in ${team.group_name}`;

  // Format Last Match
  let lastMatchText = 'None';
  if (lastMatch) {
    const scoreText = lastMatch.score_team1 !== null ? `*${lastMatch.score_team1} - ${lastMatch.score_team2}*` : 'vs';
    lastMatchText = `⚽ *${lastMatch.team1_name}* ${scoreText} *${lastMatch.team2_name}*\n📅 *Date:* ${lastMatch.date}\n🕒 *Time:* ${lastMatch.time_str} | Finished`;
  }

  // Format Next Match
  let nextMatchText = 'None';
  if (nextMatch) {
    const scoreText = nextMatch.score_team1 !== null ? `*${nextMatch.score_team1} - ${nextMatch.score_team2}*` : 'vs';

    // Calculate countdown
    const now = Date.now();
    const diffMs = nextMatch.kickoff_utc - now;
    let countdownText = '';
    if (diffMs > 0) {
      const diffMins = Math.floor(diffMs / 60000);
      const days = Math.floor(diffMins / 1440);
      const hours = Math.floor((diffMins % 1440) / 60);
      const minutes = diffMins % 60;

      const parts = [];
      if (days > 0) {
        parts.push(`${days} day${days > 1 ? 's' : ''}`);
      }
      if (hours > 0 || days > 0) {
        parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
      }
      parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

      let timeStr = '';
      if (parts.length === 1) {
        timeStr = parts[0];
      } else if (parts.length === 2) {
        timeStr = `${parts[0]} and ${parts[1]}`;
      } else {
        timeStr = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
      }
      countdownText = `\n⏳ *Starts in:* ${timeStr} remaining`;
    }

    nextMatchText = `⚽ *${nextMatch.team1_name}* ${scoreText} *${nextMatch.team2_name}*\n📅 *Date:* ${nextMatch.date}\n🕒 *Time:* ${nextMatch.time_str} | 🏟️ ${nextMatch.ground}${countdownText}`;
  }

  return `🏆 *${team.flag_icon} ${team.name} (${team.fifa_code}) Info*

🌍 *Continent:* ${team.continent}
📡 *Confederation:* ${team.confed}
📊 *Group:* ${team.group_name}

📖 *Lore:*
${lore}

📈 *Tournament Stats:*
• *Matches Played:* ${stats.played}
• *Wins:* ${stats.wins}
• *Goals Scored:* ${stats.goals}
• *Red Cards:* ${stats.redCards}
• *Current Position:* ${posText}

⏮️ *Last Match:*
${lastMatchText}

⏭️ *Next Match:*
${nextMatchText}`;
}

async function handleState(ctx: any, db: DBClient, countryQuery: string) {
  if (!countryQuery) {
    await ctx.reply('Please specify a country name or FIFA code.\nExample: `/state Germany` or `/state GER`', { parse_mode: 'Markdown' });
    return;
  }

  const message = await getTeamProfileText(db, countryQuery);
  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export function setupBot(env: Env, origin?: string) {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN || '1234:dummy');

  bot.command('start', async (ctx) => {
    const db = new DBClient(env.DB);
    if (['private', 'group', 'supergroup', 'channel'].includes(ctx.chat.type)) {
      await db.addSubscription(ctx.chat.id, ctx.chat.type, ctx.chat.title || ctx.chat.first_name || 'Unknown');
      await ctx.reply(
        "🏆 Welcome to World Cup 2026 Bot!\n\nStay updated with live scores, match schedules, group standings, team statistics, and real-time tournament updates throughout FIFA World Cup 2026.\n\nUse the menu below to get started and follow every moment of the tournament.\nuse inline mode for fast search by typing bot username + space + country name eg. @WorldC26bot Germany",
        { reply_markup: mainKeyboard }
      );
    }
  });

  // Direct commands mapping
  bot.command('wctoday', async (ctx) => {
    const db = new DBClient(env.DB);
    await handleToday(ctx, db);
  });

  bot.command('wcnext', async (ctx) => {
    const db = new DBClient(env.DB);
    await handleNext(ctx, db);
  });

  bot.command('wclive', async (ctx) => {
    const db = new DBClient(env.DB);
    await handleLive(ctx, db);
  });

  bot.command('wctable', async (ctx) => {
    const group = ctx.match?.trim()?.toUpperCase();
    if (!group) {
      await ctx.reply('Choose a group to view standings:', { reply_markup: groupsKeyboard });
      return;
    }
    const db = new DBClient(env.DB);
    await handleGroupTable(ctx, db, group);
  });

  bot.command(['state', 'stats'], async (ctx) => {
    const db = new DBClient(env.DB);
    const query = ctx.match?.trim();
    await handleState(ctx, db, query);
  });

  // Inline callback query handler for standings
  bot.callbackQuery(/^group_standings:(.+)$/, async (ctx) => {
    const group = ctx.match[1];
    const db = new DBClient(env.DB);
    await ctx.answerCallbackQuery();
    await handleGroupTable(ctx, db, group);
  });

  // Handle plain text messages (reply keyboard buttons)
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    const db = new DBClient(env.DB);

    if (text === '🏆 Matches Today') {
      await handleToday(ctx, db);
    } else if (text === '🗓️ Next Match') {
      await handleNext(ctx, db);
    } else if (text === '📊 Standings') {
      await ctx.reply('Choose a group to view standings:', { reply_markup: groupsKeyboard });
    } else if (text === '📡 Live Matches') {
      await handleLive(ctx, db);
    } else if (text === '🌟Team Profile') {
      await ctx.reply('Please send the country name or FIFA code (e.g. Germany or GER) to view its info and stats.');
    } else {
      // Check if the text matches a country name/code
      const team = await db.getTeamByNameOrCode(text);
      if (team) {
        await handleState(ctx, db, team.name);
      } else {
        await next();
      }
    }
  });

  // Inline query handler
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query;
    const db = new DBClient(env.DB);
    const teams = await db.searchTeamsForInline(query);

    const results = await Promise.all(teams.map(async (t, index) => {
      const messageText = await getTeamProfileText(db, t.name);
      return {
        type: 'article',
        id: String(index),
        title: `${t.flag_icon} ${t.name} (${t.fifa_code})`,
        description: `Points: ${t.points} | GD: ${t.gd}`,
        thumbnail_url: origin ? `${origin}/flags/${t.fifa_code}.svg` : undefined,
        thumbnail_width: 64,
        thumbnail_height: 64,
        input_message_content: {
          message_text: messageText,
          parse_mode: 'Markdown'
        }
      };
    }));

    await ctx.answerInlineQuery(results as any, { cache_time: 10 });
  });

  return bot;
}
