import fs from 'fs';
import { generateGroupStandingsImage } from './src/image';

const mockTeams = [
  { team_name: 'Mexico', flag_icon: '🇲🇽', played: 3, wins: 2, draws: 1, losses: 0, goals_for: 5, goals_against: 2, goal_difference: 3, points: 7 },
  { team_name: 'South Korea', flag_icon: '🇰🇷', played: 3, wins: 1, draws: 2, losses: 0, goals_for: 3, goals_against: 2, goal_difference: 1, points: 5 },
  { team_name: 'Czech Republic', flag_icon: '🇨🇿', played: 3, wins: 1, draws: 0, losses: 2, goals_for: 4, goals_against: 5, goal_difference: -1, points: 3 },
  { team_name: 'South Africa', flag_icon: '🇿🇦', played: 3, wins: 0, draws: 1, losses: 2, goals_for: 1, goals_against: 4, goal_difference: -3, points: 1 }
];

async function main() {
  const buf = await generateGroupStandingsImage('A', mockTeams);
  fs.writeFileSync('test_output.png', buf);
  console.log("Saved to test_output.png");
}

main();
