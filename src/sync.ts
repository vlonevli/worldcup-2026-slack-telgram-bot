import { Env, DBClient, Match } from './db';
import { Bot } from 'grammy';
import { calculateLiveProbability, formatLiveWinProbability } from './probability';

function cleanTeamName(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const aliasMap: { [key: string]: string } = {
  'united states': 'usa',
  'us': 'usa',
  'korea republic': 'south korea',
  'korea rep': 'south korea',
  'south korea': 'south korea',
  'cote divoire': 'ivory coast',
  'cabo verde': 'cape verde',
  'türkiye': 'turkey',
  'congo dr': 'dr congo',
  'czechia': 'czech republic',
  'bosnia herzegovina': 'bosnia and herzegovina'
};

function matchTeams(dbName: string, espnName: string): boolean {
  const cleanDb = cleanTeamName(dbName);
  const cleanEspn = cleanTeamName(espnName);

  const resolvedDb = aliasMap[cleanDb] || cleanDb;
  const resolvedEspn = aliasMap[cleanEspn] || cleanEspn;

  return resolvedDb === resolvedEspn || resolvedDb.includes(resolvedEspn) || resolvedEspn.includes(resolvedDb);
}

function mapEspnStatus(espnStatus: string): string {
  switch (espnStatus) {
    case 'STATUS_SCHEDULED':
      return 'SCHEDULED';
    case 'STATUS_IN_PROGRESS':
    case 'STATUS_FIRST_HALF':
    case 'STATUS_SECOND_HALF':
      return 'IN_PLAY';
    case 'STATUS_HALFTIME':
    case 'STATUS_HALF_TIME':
      return 'PAUSED';
    case 'STATUS_FINAL':
    case 'STATUS_FULL_TIME':
      return 'FINISHED';
    default:
      return 'SCHEDULED';
  }
}

export async function syncMatches(env: Env) {
  const db = new DBClient(env.DB);
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  
  const now = Date.now();
  const next60Min = now + 60 * 60000;
  
  const { results: matches } = await env.DB.prepare(
    `SELECT m.*, t1.flag_icon as t1_flag, t2.flag_icon as t2_flag 
     FROM matches m 
     JOIN teams t1 ON m.team1_name = t1.name 
     JOIN teams t2 ON m.team2_name = t2.name 
     WHERE m.status IN ('SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED')`
  ).all<Match>();

  if (!matches) return;

  // Get ALL active subscriptions — includes private chats, groups, and supergroups
  const subs = await db.getActiveSubscriptions();

  // Helper: send a deduplicated notification to all subscribers in parallel batches
  // Telegram rate limit: ~30 msgs/sec per bot. We use batches of 25 to stay safe.
  async function broadcastOnce(notifyId: string, text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown') {
    if (await db.isNotificationSent(notifyId)) return;
    await db.markNotificationSent(notifyId);

    const BATCH_SIZE = 25;
    for (let i = 0; i < subs.length; i += BATCH_SIZE) {
      const batch = subs.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(sub =>
          bot.api.sendMessage(sub.chat_id, text, { parse_mode: parseMode }).catch(() => {})
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

  if (env.SIMULATION_MODE !== 'true' && shouldCallApi) {
    let processedByEspn = false;

    // 1. Try to fetch and process using ESPN Scoreboard API (Real-time, Free, No Auth/TLS blocks)
    try {
      const today = new Date();
      const format = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
      };
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const dateParam = `${format(yesterday)}-${format(tomorrow)}`;

      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateParam}`;
      const espnRes = await fetch(espnUrl);

      if (espnRes.ok) {
        const espnData: any = await espnRes.json();
        const espnEvents = espnData.events || [];

        if (espnEvents.length > 0) {
          for (const dbMatch of matches) {
            // Find corresponding match in ESPN events
            const espnEvent = espnEvents.find((event: any) => {
              const comp = event.competitions?.[0];
              if (!comp) return false;
              const homeCompetitor = comp.competitors?.find((c: any) => c.homeAway === 'home');
              const awayCompetitor = comp.competitors?.find((c: any) => c.homeAway === 'away');
              const homeName = homeCompetitor?.team?.name || homeCompetitor?.team?.displayName;
              const awayName = awayCompetitor?.team?.name || awayCompetitor?.team?.displayName;

              return matchTeams(dbMatch.team1_name, homeName) && matchTeams(dbMatch.team2_name, awayName);
            });

            if (espnEvent) {
              const comp = espnEvent.competitions[0];
              const homeCompetitor = comp.competitors.find((c: any) => c.homeAway === 'home');
              const awayCompetitor = comp.competitors.find((c: any) => c.homeAway === 'away');

              const isDbLive = dbMatch.status === 'IN_PLAY' || dbMatch.status === 'LIVE';
              const status = mapEspnStatus(espnEvent.status?.type?.name);
              
              const hScore = Number(homeCompetitor?.score);
              const aScore = Number(awayCompetitor?.score);
              const score1 = isNaN(hScore) ? (dbMatch.score_team1 ?? 0) : hScore;
              const score2 = isNaN(aScore) ? (dbMatch.score_team2 ?? 0) : aScore;

              const isMatchActive = status === 'IN_PLAY' || status === 'LIVE' || status === 'PAUSED' || status === 'FINISHED';

              // Extract Stats
              const extractStat = (competitor: any, statName: string) => {
                 const stat = competitor?.statistics?.find((s: any) => s.name === statName);
                 return stat ? parseFloat(stat.displayValue || stat.value) || 0 : 0;
              };

              let stats1: any = null;
              let stats2: any = null;

              if (homeCompetitor?.statistics && awayCompetitor?.statistics) {
                 stats1 = {
                    possession: extractStat(homeCompetitor, 'possessionPct'),
                    shots: extractStat(homeCompetitor, 'totalShots'),
                    shotsOnTarget: extractStat(homeCompetitor, 'shotsOnTarget'),
                    corners: extractStat(homeCompetitor, 'cornerKicks'),
                    offsides: extractStat(homeCompetitor, 'offsides'),
                    fouls: extractStat(homeCompetitor, 'foulsCommitted'),
                    saves: extractStat(homeCompetitor, 'saves')
                 };
                 stats2 = {
                    possession: extractStat(awayCompetitor, 'possessionPct'),
                    shots: extractStat(awayCompetitor, 'totalShots'),
                    shotsOnTarget: extractStat(awayCompetitor, 'shotsOnTarget'),
                    corners: extractStat(awayCompetitor, 'cornerKicks'),
                    offsides: extractStat(awayCompetitor, 'offsides'),
                    fouls: extractStat(awayCompetitor, 'foulsCommitted'),
                    saves: extractStat(awayCompetitor, 'saves')
                 };

                 await db.updateMatchStats({
                    match_id: dbMatch.id,
                    team_name: dbMatch.team1_name,
                    possession_pct: stats1.possession,
                    shots_total: stats1.shots,
                    shots_on_target: stats1.shotsOnTarget,
                    corners: stats1.corners,
                    offsides: stats1.offsides,
                    fouls: stats1.fouls,
                    saves: stats1.saves
                 });
                 await db.updateMatchStats({
                    match_id: dbMatch.id,
                    team_name: dbMatch.team2_name,
                    possession_pct: stats2.possession,
                    shots_total: stats2.shots,
                    shots_on_target: stats2.shotsOnTarget,
                    corners: stats2.corners,
                    offsides: stats2.offsides,
                    fouls: stats2.fouls,
                    saves: stats2.saves
                 });
              }

              // Extract live clock early to use in calculations
              const liveClock = espnEvent.status?.displayClock || espnEvent.status?.type?.detail || '';
              const clockIntNum = parseInt(liveClock.replace(/[^0-9]/g, '')) || 0;

              // Pre-calculate live probability for notifications
              const matchEvents = comp.details || espnEvent.details || [];
              const rcs1 = matchEvents.filter((e: any) => e.redCard && e.team?.id === homeCompetitor?.team?.id).length;
              const rcs2 = matchEvents.filter((e: any) => e.redCard && e.team?.id === awayCompetitor?.team?.id).length;
              
              const liveProb = calculateLiveProbability(
                 dbMatch.team1_name, dbMatch.t1_flag || '🏳️', dbMatch.team2_name, dbMatch.t2_flag || '🏳️',
                 score1, score2, rcs1, rcs2, stats1, stats2, liveClock
              );
              const probTextHTML = formatLiveWinProbability(liveProb);

              // Process Events (Cards, Goals, Penalties)
              const recentGoals1: string[] = [];
              const recentGoals2: string[] = [];
              for (const ev of matchEvents) {
                 const clock = ev.clock?.displayValue || String(ev.clock?.value || 0);
                 const typeId = ev.type?.id;
                 const typeText = ev.type?.text || '';
                 const teamId = ev.team?.id;
                 const teamName = teamId === homeCompetitor?.team?.id ? dbMatch.team1_name : (teamId === awayCompetitor?.team?.id ? dbMatch.team2_name : 'Unknown');
                 const athletes = ev.athletesInvolved || [];
                 const playerName = athletes[0]?.shortName || athletes[0]?.displayName || 'Unknown Player';
                 
                 let eventType = '';
                 let detailStr = typeText;
                 let notifyStr = '';

                 const clockInt = parseInt(clock.replace(/[^0-9]/g, '')) || 0;
                 const eventId = `ev_${dbMatch.id}_${clock}_${typeId}_${teamId}_${playerName}`;

                 if (ev.scoringPlay) {
                    eventType = 'GOAL';
                    if (ev.penaltyKick) detailStr = 'Penalty Kick';
                    if (ev.ownGoal) detailStr = 'Own Goal';
                    if (teamName === dbMatch.team1_name) recentGoals1.push(`${playerName} (${clock})`);
                    if (teamName === dbMatch.team2_name) recentGoals2.push(`${playerName} (${clock})`);
                 } else if (ev.redCard) {
                    eventType = 'RED_CARD';
                    notifyStr = `🟥 <b>RED CARD!</b>\n\n<b>${playerName}</b> (${clock}) has been sent off for <b>${teamName}</b>!\n\n${probTextHTML}`;
                 } else if (ev.yellowCard) {
                    eventType = 'YELLOW_CARD';
                    notifyStr = `🟨 *YELLOW CARD*\n\n*${playerName}* (${clock}) - *${teamName}*`;
                 }

                 if (eventType) {
                    await db.addMatchEvent({
                       id: eventId,
                       match_id: dbMatch.id,
                       type: eventType,
                       minute: clockInt,
                       player_name: playerName,
                       team_name: teamName,
                       detail: detailStr,
                       created_at: Date.now()
                    });
                    
                    if (isMatchActive && notifyStr) {
                       // Ensure we don't spam if the bot restarts mid-match
                       const parseMode = eventType === 'RED_CARD' ? 'HTML' : 'Markdown';
                       await broadcastOnce(`notif_${eventId}`, notifyStr, parseMode);
                    }
                 }
              }

              // Check if score changed (Goal!) — deduplicated per goal
              if (isMatchActive) {
                const prevScore1 = dbMatch.score_team1 ?? 0;
                const prevScore2 = dbMatch.score_team2 ?? 0;

                if (score1 > prevScore1) {
                  const scorerInfo = recentGoals1.length > 0 ? `\n👤 Scorer: ${recentGoals1[recentGoals1.length - 1]}` : '';
                  const text = `⚽ <b>GOAL!</b>\n\n🟦 ${dbMatch.team1_name} scored against ${dbMatch.team2_name}!${scorerInfo}\n\nScore: <b>${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}</b>\n\n${probTextHTML}`;
                  await broadcastOnce(`goal_${dbMatch.id}_${score1}_${score2}`, text, 'HTML');
                }
                if (score2 > prevScore2) {
                  const scorerInfo = recentGoals2.length > 0 ? `\n👤 Scorer: ${recentGoals2[recentGoals2.length - 1]}` : '';
                  const text = `⚽ <b>GOAL!</b>\n\n🟦 ${dbMatch.team2_name} scored against ${dbMatch.team1_name}!${scorerInfo}\n\nScore: <b>${dbMatch.team1_name} ${score1} - ${score2} ${dbMatch.team2_name}</b>\n\n${probTextHTML}`;
                  await broadcastOnce(`goal_${dbMatch.id}_${score1}_${score2}`, text, 'HTML');
                }
              }

              // Status transitions — all deduplicated
              if (dbMatch.status === 'SCHEDULED' && isMatchActive) {
                 const text = `⏱️ *KICKOFF!*\n\nThe match between *${dbMatch.team1_name}* and *${dbMatch.team2_name}* has started!\n🏟️ ${dbMatch.ground}`;
                 await broadcastOnce(`kickoff_${dbMatch.id}`, text);
              } else if (dbMatch.status === 'PAUSED' && (status === 'IN_PLAY' || status === 'LIVE')) {
                 const text = `▶️ *SECOND HALF STARTED*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
                 await broadcastOnce(`secondhalf_${dbMatch.id}`, text);
              } else if (isDbLive && status === 'PAUSED') {
                 let text = `⏸️ *HALF TIME*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
                 if (stats1 && stats2) {
                    text += `\n\n📊 *Match Stats:*\nPossession: ${stats1.possession}% - ${stats2.possession}%\nShots: ${stats1.shots} - ${stats2.shots}\nCorners: ${stats1.corners} - ${stats2.corners}\nFouls: ${stats1.fouls} - ${stats2.fouls}`;
                 }
                 await broadcastOnce(`halftime_${dbMatch.id}`, text);
              } else if ((isDbLive || dbMatch.status === 'PAUSED') && status === 'FINISHED') {
                 const f1 = dbMatch.t1_flag || '🏳️';
                 const f2 = dbMatch.t2_flag || '🏳️';
                 let text = `🏁 <b>FULL TIME</b>\n\n`;
                 text += `${f1} ${dbMatch.team1_name} <b>${score1} - ${score2}</b> ${dbMatch.team2_name} ${f2}\n\n`;
                 if (stats1 && stats2) {
                    text += `📊 Match Stats\n`;
                    text += `<blockquote>Possession ${stats1.possession}% - ${stats2.possession}%\n`;
                    text += `Shots  ${stats1.shots} - ${stats2.shots}\n`;
                    text += `Corners  ${stats1.corners} - ${stats2.corners}\n`;
                    text += `Fouls  ${stats1.fouls} - ${stats2.fouls}</blockquote>`;
                 }
                 await broadcastOnce(`fulltime_${dbMatch.id}`, text, 'HTML');
              }


              // Update database if changed
              if (dbMatch.status !== status || dbMatch.score_team1 !== score1 || dbMatch.score_team2 !== score2 || dbMatch.live_clock !== liveClock) {
                 await db.updateMatch({ ...dbMatch, status, score_team1: score1, score_team2: score2, live_clock: liveClock });
                 
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
          processedByEspn = true;
          console.log('Successfully synced matches via ESPN');
        }
      }
    } catch (espnError) {
      console.error('ESPN Sync Error:', espnError);
    }

    // 2. Fallback to football-data.org if ESPN failed or didn't process matches
    if (!processedByEspn && env.FOOTBALL_DATA_API_KEY) {
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

            const dbMatch = matchMap.get(`${t1Code}:${t2Code}`);
            if (dbMatch) {
              const isDbLive = dbMatch.status === 'IN_PLAY' || dbMatch.status === 'LIVE';
              const status = apiMatch.status;

              const s1 = apiMatch.score?.regularTime?.home ?? apiMatch.score?.fullTime?.home;
              const s2 = apiMatch.score?.regularTime?.away ?? apiMatch.score?.fullTime?.away;
              
              const score1 = s1 ?? dbMatch.score_team1 ?? 0;
              const score2 = s2 ?? dbMatch.score_team2 ?? 0;

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

              if (dbMatch.status === 'SCHEDULED' && isMatchActive) {
                 const text = `⏱️ *KICKOFF!*\n\nThe match between *${dbMatch.team1_name}* and *${dbMatch.team2_name}* has started!\n🏟️ ${dbMatch.ground}`;
                 await broadcastOnce(`kickoff_${dbMatch.id}`, text);
              } else if (dbMatch.status === 'PAUSED' && (status === 'IN_PLAY' || status === 'LIVE')) {
                 const text = `▶️ *SECOND HALF STARTED*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
                 await broadcastOnce(`secondhalf_${dbMatch.id}`, text);
              } else if (isDbLive && status === 'PAUSED') {
                 const text = `⏸️ *HALF TIME*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
                 await broadcastOnce(`halftime_${dbMatch.id}`, text);
              } else if ((isDbLive || dbMatch.status === 'PAUSED') && status === 'FINISHED') {
                 const text = `🏁 *FULL TIME*\n\n${dbMatch.team1_name} *${score1} - ${score2}* ${dbMatch.team2_name}`;
                 await broadcastOnce(`fulltime_${dbMatch.id}`, text);
              }

              if (dbMatch.status !== status || dbMatch.score_team1 !== score1 || dbMatch.score_team2 !== score2) {
                 await db.updateMatch({ ...dbMatch, status, score_team1: score1, score_team2: score2 });
                 
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
  }

  // Simulation fallback
  if (env.SIMULATION_MODE === 'true') {
     // Optional: Simulate goal events randomly for LIVE matches for testing purposes
  }
}
