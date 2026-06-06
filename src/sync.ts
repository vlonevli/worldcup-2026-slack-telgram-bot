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

  const subs = await db.getActiveSubscriptions();

  for (const m of matches) {
    if (m.kickoff_utc > now && m.kickoff_utc <= next60Min && m.status === 'SCHEDULED') {
      const notifyId = `60m_${m.id}`;
      if (!(await db.isNotificationSent(notifyId))) {
        await db.markNotificationSent(notifyId);
        const text = `⏳ *Upcoming Match in 60 mins!*\n\n⚽ ${m.team1_name} vs ${m.team2_name}\n🕒 ${m.time_str}\n🏟️ ${m.ground}`;
        for (const sub of subs) {
          try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch (e) {}
        }
      }
    }
  }

  // Fetch from football-data.org if API key is provided and SIMULATION_MODE is not true
  if (env.FOOTBALL_DATA_API_KEY && env.SIMULATION_MODE !== 'true') {
    try {
      const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches?status=LIVE,IN_PLAY,PAUSED,FINISHED', {
        headers: { 'X-Auth-Token': env.FOOTBALL_DATA_API_KEY }
      });
      if (response.ok) {
        const data: any = await response.json();
        const apiMatches = data.matches || [];
        
        for (const apiMatch of apiMatches) {
          const t1Code = apiMatch.homeTeam?.tla;
          const t2Code = apiMatch.awayTeam?.tla;
          const status = apiMatch.status;
          const score1 = apiMatch.score?.fullTime?.home ?? 0;
          const score2 = apiMatch.score?.fullTime?.away ?? 0;

          // Find the match in our DB using the FIFA codes (tla)
          // We can do this efficiently by checking if the score/status changed
          const { results: dbMatches } = await env.DB.prepare(
            `SELECT m.* FROM matches m 
             JOIN teams t1 ON m.team1_name = t1.name 
             JOIN teams t2 ON m.team2_name = t2.name 
             WHERE t1.fifa_code = ? AND t2.fifa_code = ?`
          ).bind(t1Code, t2Code).all<Match>();

          const dbMatch = dbMatches && dbMatches[0];
          if (dbMatch) {
            // Check if score changed (Goal!)
            if (dbMatch.status !== 'SCHEDULED' && status === 'IN_PLAY') {
              if (dbMatch.score_team1 !== null && score1 > dbMatch.score_team1) {
                const text = `⚽ *GOAL!*\n\n${dbMatch.team1_name} scored against ${dbMatch.team2_name}!\n\nScore: ${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}`;
                for (const sub of subs) { try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch(e){} }
              }
              if (dbMatch.score_team2 !== null && score2 > dbMatch.score_team2) {
                const text = `⚽ *GOAL!*\n\n${dbMatch.team2_name} scored against ${dbMatch.team1_name}!\n\nScore: ${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}`;
                for (const sub of subs) { try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch(e){} }
              }
            }

            // Status transitions (Kickoff, Halftime, Fulltime)
            if (dbMatch.status === 'SCHEDULED' && status === 'IN_PLAY') {
               const text = `⏱️ *KICKOFF!*\n\nThe match between ${dbMatch.team1_name} and ${dbMatch.team2_name} has started!`;
               for (const sub of subs) { try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch(e){} }
            } else if (dbMatch.status === 'IN_PLAY' && status === 'PAUSED') {
               const text = `⏸️ *HALF TIME*\n\n${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}`;
               for (const sub of subs) { try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch(e){} }
            } else if ((dbMatch.status === 'IN_PLAY' || dbMatch.status === 'PAUSED') && status === 'FINISHED') {
               const text = `🏁 *FULL TIME*\n\n${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}`;
               for (const sub of subs) { try { await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'Markdown' }); } catch(e){} }
            }

            // Update database if changed
            if (dbMatch.status !== status || dbMatch.score_team1 !== score1 || dbMatch.score_team2 !== score2) {
               await db.updateMatch({ ...dbMatch, status, score_team1: score1, score_team2: score2 });
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
