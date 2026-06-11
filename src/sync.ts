import { Env, DBClient, Match } from './db';
import { Bot } from 'grammy';

export async function syncMatches(env: Env) {
  const db = new DBClient(env.DB);
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  
  const now = Date.now();
  const next60Min = now + 60 * 60000;
  
  const { results: matches } = await env.DB.prepare(
    `SELECT * FROM matches WHERE status IN ('SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED')`
  ).all<Match>();

  if (!matches) return;

  // Get ALL active subscriptions — includes private chats, groups, and supergroups
  const subs = await db.getActiveSubscriptions();

  // Helper: send a deduplicated notification to all subscribers in parallel batches
  // Telegram rate limit: ~30 msgs/sec per bot. We use batches of 25 to stay safe.
  async function broadcastOnce(notifyId: string, text: string) {
    if (await db.isNotificationSent(notifyId)) return;
    await db.markNotificationSent(notifyId);

    const BATCH_SIZE = 25;
    for (let i = 0; i < subs.length; i += BATCH_SIZE) {
      const batch = subs.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(sub =>
          bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }).catch(() => {})
        )
      );
    }
  }

  for (const m of matches) {
    // 60-minute advance reminder
    if (m.kickoff_utc > now && m.kickoff_utc <= next60Min && m.status === 'SCHEDULED') {
      const text = `⏳ *Upcoming Match in 60 mins!*\n\n⚽ ${m.team1_name} vs ${m.team2_name}\n🕒 ${m.time_str}\n🏟️ ${m.ground}`;
      await broadcastOnce(`60m_${m.id}`, text);
    }
  }

  // Only call football-data.org API when it's actually needed:
  // - A match in our DB is currently LIVE/IN_PLAY/PAUSED, OR
  // - A match is SCHEDULED and kickoff is within 15 minutes (to catch the transition)
  // This saves API quota — no calls when nothing is happening.
  const next15Min = now + 15 * 60000;
  const hasLiveMatches = matches.some(m => m.status === 'LIVE' || m.status === 'IN_PLAY' || m.status === 'PAUSED');
  const hasImminentMatch = matches.some(m => m.status === 'SCHEDULED' && m.kickoff_utc <= next15Min && m.kickoff_utc >= now - 180 * 60000);
  const shouldCallApi = hasLiveMatches || hasImminentMatch;

  if (env.FOOTBALL_DATA_API_KEY && env.SIMULATION_MODE !== 'true' && shouldCallApi) {
    try {
      // Pre-load all matches with FIFA codes in ONE query (eliminates N per-match DB calls)
      const { results: allDbMatches } = await env.DB.prepare(
        `SELECT m.*, t1.fifa_code AS t1_code, t2.fifa_code AS t2_code
         FROM matches m
         JOIN teams t1 ON m.team1_name = t1.name
         JOIN teams t2 ON m.team2_name = t2.name
         WHERE m.status IN ('SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED')`
      ).all<Match & { t1_code: string; t2_code: string }>();

      // Build lookup map: "HOME_TLA:AWAY_TLA" -> dbMatch
      const matchMap = new Map<string, Match>();
      for (const m of (allDbMatches || [])) {
        matchMap.set(`${(m as any).t1_code}:${(m as any).t2_code}`, m);
      }

      const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches?status=LIVE,IN_PLAY,PAUSED,FINISHED', {
        headers: { 'X-Auth-Token': env.FOOTBALL_DATA_API_KEY }
      });
      if (response.ok) {
        const data: any = await response.json();
        const apiMatches = data.matches || [];
        
        for (const apiMatch of apiMatches) {
          const t1Code = apiMatch.homeTeam?.tla;
          const t2Code = apiMatch.awayTeam?.tla;

          // In-memory lookup instead of DB query per match
          const dbMatch = matchMap.get(`${t1Code}:${t2Code}`);
          if (dbMatch) {
            const isDbLive = dbMatch.status === 'IN_PLAY' || dbMatch.status === 'LIVE';
            const status = apiMatch.status;

            // Prefer regularTime then fullTime to avoid 0-0 overrides if API drops fullTime temporarily
            // Fallback to the database score if the API returns null during an active or finished match
            const s1 = apiMatch.score?.regularTime?.home ?? apiMatch.score?.fullTime?.home;
            const s2 = apiMatch.score?.regularTime?.away ?? apiMatch.score?.fullTime?.away;
            
            const score1 = s1 ?? dbMatch.score_team1 ?? 0;
            const score2 = s2 ?? dbMatch.score_team2 ?? 0;

            // Check if score changed (Goal!) — deduplicated per goal
            const isMatchActive = status === 'IN_PLAY' || status === 'LIVE' || status === 'PAUSED' || status === 'FINISHED';
            if (isMatchActive) {
              const prevScore1 = dbMatch.score_team1 ?? 0;
              const prevScore2 = dbMatch.score_team2 ?? 0;

              if (score1 > prevScore1) {
                const text = `⚽ *GOAL!*\n\n🟦 ${dbMatch.team1_name} scored against ${dbMatch.team2_name}!\n\nScore: *${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}*`;
                await broadcastOnce(`goal_${dbMatch.id}_${score1}_${score2}`, text);
              }
              if (score2 > prevScore2) {
                const text = `⚽ *GOAL!*\n\n🟦 ${dbMatch.team2_name} scored against ${dbMatch.team1_name}!\n\nScore: *${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}*`;
                await broadcastOnce(`goal_${dbMatch.id}_${score1}_${score2}`, text);
              }
            }

            // Status transitions — all deduplicated
            if (dbMatch.status === 'SCHEDULED' && isMatchActive) {
               const text = `⏱️ *KICKOFF!*\n\nThe match between *${dbMatch.team1_name}* and *${dbMatch.team2_name}* has started!\n🏟️ ${dbMatch.ground}`;
               await broadcastOnce(`kickoff_${dbMatch.id}`, text);
            } else if (isDbLive && status === 'PAUSED') {
               const text = `⏸️ *HALF TIME*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
               await broadcastOnce(`halftime_${dbMatch.id}`, text);
            } else if ((isDbLive || dbMatch.status === 'PAUSED') && status === 'FINISHED') {
               const text = `🏁 *FULL TIME*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
               await broadcastOnce(`fulltime_${dbMatch.id}`, text);
            }

            // Update database if changed
            if (dbMatch.status !== status || dbMatch.score_team1 !== score1 || dbMatch.score_team2 !== score2) {
               await db.updateMatch({ ...dbMatch, status, score_team1: score1, score_team2: score2 });
               
               // Automatically recalculate and update standings when a match finishes
               if (status === 'FINISHED') {
                 const t1 = await db.getTeamByNameOrCode(dbMatch.team1_name);
                 if (t1) {
                   await db.calculateAndUpdateStandings(t1.group_name);
                 }
               }
            }
          }
        }
      } else {
        console.error('Failed to fetch from football-data.org:', response.status);
      }
    } catch (error) {
      console.error('API Error:', error);
    }
  }

  // Simulation fallback
  if (env.SIMULATION_MODE === 'true') {
     // Optional: Simulate goal events randomly for LIVE matches for testing purposes
  }
}
