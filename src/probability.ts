export interface WinProbability {
  win1: number;
  draw: number;
  win2: number;
  t1Flag: string;
  t2Flag: string;
  team1Name: string;
  team2Name: string;
}

const BASE_POWER_RATINGS: Record<string, number> = {
  'Argentina': 94,
  'France': 93,
  'Brazil': 91,
  'England': 90,
  'Spain': 89,
  'Portugal': 88,
  'Germany': 87,
  'Netherlands': 86,
  'Italy': 85,
  'Uruguay': 84,
  'Croatia': 83,
  'Belgium': 82,
  'Morocco': 81,
  'Colombia': 80,
  'Senegal': 79,
  'Japan': 78,
  'USA': 77,
  'Switzerland': 76,
  'Mexico': 75,
  'Denmark': 74,
  'South Korea': 73,
  'Australia': 72,
  'Canada': 70,
  'Ecuador': 69,
  'Cameroon': 68,
  'Ghana': 67,
  'Wales': 66,
  'Poland': 65,
  'Iran': 64,
  'Serbia': 63,
  'Saudi Arabia': 60
};

// Simple pseudo-random hash to give unlisted teams a deterministic rating (between 50 and 70)
function getBaseRating(teamName: string): number {
  if (BASE_POWER_RATINGS[teamName]) {
    return BASE_POWER_RATINGS[teamName];
  }
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 50 + (Math.abs(hash) % 21);
}

export function calculatePreMatchChances(team1: string, team2: string): { w1: number; d: number; w2: number; scoreDiff: number } {
  const p1 = getBaseRating(team1);
  const p2 = getBaseRating(team2);
  
  // Base differences simulated based on power rating difference
  const diff = p1 - p2; // Range roughly -40 to +40

  // We convert the power diff to the "Total Score" the user asked for
  // The user's example: Argentina vs Canada -> +56
  // In our mapping, Argentina(94) - Canada(70) = +24. 
  // Let's multiply by 2.3 to get roughly 55
  const totalScore = diff * 2.3; 

  // Base probabilities
  // A totalScore of 0 means 38% win, 24% draw, 38% win.
  // A totalScore of +56 means ~74% win, 18% draw, 8% win.
  
  // Sigmoid-ish mapping for win chance
  let w1 = 38 + (totalScore * 0.65);
  w1 = Math.max(5, Math.min(95, w1));
  
  // Draw chance peaks at 0 diff (24%), drops as diff increases
  let d = 24 - (Math.abs(totalScore) * 0.12);
  d = Math.max(2, Math.min(35, d));

  let w2 = 100 - w1 - d;
  
  // Re-normalize just in case
  const sum = w1 + d + w2;
  return {
    w1: Math.round((w1 / sum) * 100),
    d: Math.round((d / sum) * 100),
    w2: Math.round((w2 / sum) * 100),
    scoreDiff: Math.round(totalScore)
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
    team2Name: team2
  };
}

export function formatWinProbability(prob: WinProbability): string {
  return `📊 *Win Probability*\n> ${prob.t1Flag} ${prob.team1Name.padEnd(12, ' ')} ${prob.win1}%\n> 🤝 Draw         ${prob.draw}%\n> ${prob.t2Flag} ${prob.team2Name.padEnd(12, ' ')} ${prob.win2}%`;
}

export function formatLiveWinProbability(prob: WinProbability): string {
  // HTML formatting for /wclive and broadcasts
  return `📊 <b>Win Probability</b>\n<blockquote>${prob.t1Flag} ${prob.team1Name} ${prob.win1}%\n🤝 Draw ${prob.draw}%\n${prob.t2Flag} ${prob.team2Name} ${prob.win2}%</blockquote>`;
}
