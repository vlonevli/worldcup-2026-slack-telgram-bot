export interface PreMatchFactors {
  elo1: number;
  elo2: number;
  form1: number;
  form2: number;
  squad1: number;
  squad2: number;
  inj1: number;
  inj2: number;
  home1: boolean;
  home2: boolean;
}

export interface WinProbability {
  win1: number;
  draw: number;
  win2: number;
  t1Flag: string;
  t2Flag: string;
  team1Name: string;
  team2Name: string;
  preMatchFactors?: PreMatchFactors;
}

interface TeamStats {
  elo: number;
  form: number;
  squadValue: number;
  injuries: number;
}

const TEAM_STATS: Record<string, TeamStats> = {
  'Argentina': { elo: 2140, form: 90, squadValue: 95, injuries: 10 },
  'France': { elo: 2110, form: 88, squadValue: 98, injuries: 15 },
  'Brazil': { elo: 2080, form: 82, squadValue: 94, injuries: 25 },
  'England': { elo: 2070, form: 85, squadValue: 100, injuries: 10 },
  'Spain': { elo: 2060, form: 89, squadValue: 92, injuries: 20 },
  'Portugal': { elo: 2050, form: 86, squadValue: 90, injuries: 10 },
  'Germany': { elo: 2040, form: 84, squadValue: 88, injuries: 15 },
  'Netherlands': { elo: 2020, form: 82, squadValue: 85, injuries: 20 },
  'Italy': { elo: 2010, form: 83, squadValue: 86, injuries: 15 },
  'Uruguay': { elo: 2000, form: 85, squadValue: 80, injuries: 10 },
  'Croatia': { elo: 1980, form: 80, squadValue: 75, injuries: 20 },
  'Belgium': { elo: 1970, form: 75, squadValue: 78, injuries: 25 },
  'Morocco': { elo: 1950, form: 82, squadValue: 72, injuries: 10 },
  'Colombia': { elo: 1940, form: 88, squadValue: 74, injuries: 10 },
  'Senegal': { elo: 1910, form: 78, squadValue: 68, injuries: 15 },
  'Japan': { elo: 1900, form: 80, squadValue: 65, injuries: 5 },
  'USA': { elo: 1880, form: 75, squadValue: 62, injuries: 10 },
  'Switzerland': { elo: 1870, form: 76, squadValue: 64, injuries: 15 },
  'Mexico': { elo: 1860, form: 70, squadValue: 60, injuries: 20 },
  'Denmark': { elo: 1850, form: 72, squadValue: 63, injuries: 10 },
  'South Korea': { elo: 1840, form: 74, squadValue: 58, injuries: 10 },
  'Australia': { elo: 1820, form: 70, squadValue: 50, injuries: 10 },
  'Canada': { elo: 1800, form: 72, squadValue: 55, injuries: 5 },
  'Ecuador': { elo: 1790, form: 75, squadValue: 60, injuries: 15 },
  'Cameroon': { elo: 1780, form: 68, squadValue: 52, injuries: 20 },
  'Ghana': { elo: 1770, form: 65, squadValue: 54, injuries: 20 },
  'Wales': { elo: 1760, form: 64, squadValue: 50, injuries: 15 },
  'Poland': { elo: 1750, form: 65, squadValue: 55, injuries: 20 },
  'Iran': { elo: 1740, form: 70, squadValue: 48, injuries: 10 },
  'Serbia': { elo: 1730, form: 68, squadValue: 58, injuries: 20 },
  'Saudi Arabia': { elo: 1700, form: 65, squadValue: 45, injuries: 15 }
};

function getTeamStats(teamName: string): TeamStats {
  if (TEAM_STATS[teamName]) {
    return TEAM_STATS[teamName];
  }
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return {
    elo: 1600 + (Math.abs(hash) % 200),
    form: 50 + (Math.abs(hash) % 30),
    squadValue: 40 + (Math.abs(hash) % 30),
    injuries: 10 + (Math.abs(hash) % 20)
  };
}

export function calculatePreMatchChances(team1: string, team2: string): { w1: number; d: number; w2: number; scoreDiff: number, factors: PreMatchFactors } {
  const s1 = getTeamStats(team1);
  const s2 = getTeamStats(team2);
  
  const home1 = ['USA', 'Canada', 'Mexico'].includes(team1);
  const home2 = ['USA', 'Canada', 'Mexico'].includes(team2);

  // Weights: ELO 45%, Form 25%, Squad 10%, Injuries 10%, Home Adv 10%
  const eloDiff = (s1.elo - s2.elo) / 8; // Max ~40 pts diff
  const formDiff = (s1.form - s2.form) * 0.4; // Max ~40 pts diff
  const squadDiff = (s1.squadValue - s2.squadValue) * 0.2; // Max ~20 pts diff
  const injDiff = (s2.injuries - s1.injuries) * 0.2; // Higher injuries is bad, so s2-s1

  let homeDiff = 0;
  if (home1 && !home2) homeDiff = 15;
  if (home2 && !home1) homeDiff = -15;

  const totalScore = (eloDiff * 0.45) + (formDiff * 0.25) + (homeDiff * 0.10) + (squadDiff * 0.10) + (injDiff * 0.10);

  let w1 = 38 + (totalScore * 2.5);
  let w2 = 38 - (totalScore * 2.5);
  let d = 24 - (Math.abs(totalScore) * 0.5);

  w1 = Math.max(5, w1);
  w2 = Math.max(5, w2);
  d = Math.max(5, Math.min(35, d));

  const sum = w1 + d + w2;
  return {
    w1: Math.round((w1 / sum) * 100),
    d: Math.round((d / sum) * 100),
    w2: Math.round((w2 / sum) * 100),
    scoreDiff: Math.round(totalScore),
    factors: {
      elo1: s1.elo, elo2: s2.elo,
      form1: s1.form, form2: s2.form,
      squad1: s1.squadValue, squad2: s2.squadValue,
      inj1: s1.injuries, inj2: s2.injuries,
      home1, home2
    }
  };
}

export function calculateLiveProbability(
  team1: string, t1Flag: string,
  team2: string, t2Flag: string,
  score1: number, score2: number,
  redCards1: number, redCards2: number,
  stats1: any, stats2: any,
  minuteStr: string
): WinProbability {
  // 1. Calculate Pre-Match Score
  const preMatch = calculatePreMatchChances(team1, team2);

  // Parse minute
  const mMatch = minuteStr.match(/\d+/);
  let minute = mMatch ? parseInt(mMatch[0], 10) : 0;
  if (minute > 90) minute = 90; // clamp for formula purposes

  // 2. Weights based on minute (0 to 90)
  // user formula:
  // min 0: 90% pre, 10% live
  // min 90: 5% pre, 95% live
  const liveWeight = 10 + (85 * (minute / 90));
  const preWeight = 100 - liveWeight;

  // 3. Live Factors (Out of 100 total live impact points per team)
  // 45% Goal Diff, 20% Time Remaining, 15% Red Cards, 10% xG, 5% Poss, 5% Shots
  
  // Evaluate Goal Difference Impact
  const gd = score1 - score2;
  // If gd > 0, team1 benefits. The closer to 90 mins, the more impact the GD has.
  let liveScore1 = 50; 
  let liveScore2 = 50;

  // Time multiplier for goals (goals matter more later in the game)
  const timeFactor = 0.5 + (0.5 * (minute / 90)); 
  
  // Goal Difference (45% weight scale)
  liveScore1 += gd * 15 * timeFactor;
  liveScore2 -= gd * 15 * timeFactor;

  // Red Cards (15%)
  const rcDiff = redCards2 - redCards1; // If team2 has more reds, team1 benefits
  liveScore1 += rcDiff * 8;
  liveScore2 -= rcDiff * 8;

  // Pseudo-xG / Shots on Target (10% + 5%)
  const s1 = stats1?.shots_on_target || 0;
  const s2 = stats2?.shots_on_target || 0;
  if (s1 + s2 > 0) {
     const shotPct = s1 / (s1 + s2);
     liveScore1 += (shotPct - 0.5) * 15;
     liveScore2 -= (shotPct - 0.5) * 15;
  }

  // Possession (5%)
  const p1 = stats1?.possession_pct || 50;
  const p2 = stats2?.possession_pct || 50;
  liveScore1 += (p1 - 50) * 0.1;
  liveScore2 += (p2 - 50) * 0.1;

  // Map liveScore to percentage
  let liveW1 = 38 + (liveScore1 - 50);
  let liveW2 = 38 + (liveScore2 - 50);
  let liveD = 100 - liveW1 - liveW2;

  // At min 90, if gd != 0, draw goes to 0
  if (minute >= 89 && gd !== 0) {
      liveD = 0;
      if (gd > 0) { liveW1 = 100; liveW2 = 0; }
      else { liveW1 = 0; liveW2 = 100; }
  } else if (minute >= 89 && gd === 0) {
      liveW1 = 0; liveW2 = 0; liveD = 100;
  }

  liveW1 = Math.max(0, Math.min(100, liveW1));
  liveD = Math.max(0, Math.min(100, liveD));
  liveW2 = Math.max(0, Math.min(100, liveW2));

  // 4. Blend PreMatch and Live
  let finalW1 = (preMatch.w1 * (preWeight / 100)) + (liveW1 * (liveWeight / 100));
  let finalD = (preMatch.d * (preWeight / 100)) + (liveD * (liveWeight / 100));
  let finalW2 = (preMatch.w2 * (preWeight / 100)) + (liveW2 * (liveWeight / 100));

  // Final normalize
  const fSum = finalW1 + finalD + finalW2;
  
  return {
    win1: Math.round((finalW1 / fSum) * 100),
    draw: Math.round((finalD / fSum) * 100),
    win2: Math.round((finalW2 / fSum) * 100),
    t1Flag,
    t2Flag,
    team1Name: team1,
    team2Name: team2,
    preMatchFactors: preMatch.factors
  };
}

export function formatWinProbability(prob: WinProbability): string {
  return `📊 *Win Probability*\n> ${prob.t1Flag} ${prob.team1Name.padEnd(12, ' ')} ${prob.win1}%\n> 🤝 Draw         ${prob.draw}%\n> ${prob.t2Flag} ${prob.team2Name.padEnd(12, ' ')} ${prob.win2}%`;
}

export function formatLiveWinProbability(prob: WinProbability): string {
  // HTML formatting for /wclive and broadcasts
  return `📊 <b>Win Probability</b>\n<blockquote>${prob.t1Flag} ${prob.team1Name} ${prob.win1}%\n🤝 Draw ${prob.draw}%\n${prob.t2Flag} ${prob.team2Name} ${prob.win2}%</blockquote>`;
}
