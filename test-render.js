const fs = require('fs');
const satori = require('satori').default || require('satori');
const { Resvg, initWasm } = require('@resvg/resvg-wasm');

let wasmInitialized = false;
let fontData = null;

async function init() {
  if (!wasmInitialized) {
    const res = await fetch('https://unpkg.com/@resvg/resvg-wasm@3.1.1/index_bg.wasm');
    const buffer = await res.arrayBuffer();
    await initWasm(buffer);
    wasmInitialized = true;
  }
  if (!fontData) {
    const res = await fetch('https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf');
    fontData = await res.arrayBuffer();
  }
}

async function generateGroupStandingsImage(groupName, teams) {
  await init();

  teams.sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);

  const html = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: '800px', height: '600px',
        backgroundColor: '#0f172a', color: '#ffffff', fontFamily: 'Roboto',
        padding: '40px', boxSizing: 'border-box'
      },
      children: [
        {
          type: 'h1',
          props: {
            style: { fontSize: '48px', margin: '0 0 20px 0', textAlign: 'center', width: '100%', color: '#38bdf8' },
            children: `Group ${groupName} Standings`
          }
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', width: '100%', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', backgroundColor: '#1e293b', padding: '16px', fontWeight: 'bold', fontSize: '24px', color: '#94a3b8' },
                  children: [
                    { type: 'span', props: { style: { width: '60px' }, children: 'Pos' } },
                    { type: 'span', props: { style: { flex: 1 }, children: 'Team' } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center' }, children: 'P' } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center' }, children: 'W' } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center' }, children: 'D' } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center' }, children: 'L' } },
                    { type: 'span', props: { style: { width: '80px', textAlign: 'center' }, children: 'GD' } },
                    { type: 'span', props: { style: { width: '80px', textAlign: 'center', color: '#38bdf8' }, children: 'Pts' } },
                  ]
                }
              },
              ...teams.map((t, i) => ({
                type: 'div',
                props: {
                  style: {
                    display: 'flex', padding: '20px 16px', fontSize: '28px',
                    backgroundColor: i % 2 === 0 ? '#0f172a' : '#1e293b',
                    borderTop: '1px solid #334155', alignItems: 'center'
                  },
                  children: [
                    { type: 'span', props: { style: { width: '60px', color: '#cbd5e1' }, children: String(i + 1) } },
                    { type: 'span', props: { style: { flex: 1, fontWeight: 'bold' }, children: `${t.flag_icon || ''} ${t.team_name}` } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center', color: '#cbd5e1' }, children: String(t.played) } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center', color: '#cbd5e1' }, children: String(t.wins) } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center', color: '#cbd5e1' }, children: String(t.draws) } },
                    { type: 'span', props: { style: { width: '60px', textAlign: 'center', color: '#cbd5e1' }, children: String(t.losses) } },
                    { type: 'span', props: { style: { width: '80px', textAlign: 'center', color: '#cbd5e1' }, children: String(t.goal_difference) } },
                    { type: 'span', props: { style: { width: '80px', textAlign: 'center', fontWeight: 'bold', color: '#38bdf8' }, children: String(t.points) } },
                  ]
                }
              }))
            ]
          }
        }
      ]
    }
  };

  const svg = await satori(html, {
    width: 800,
    height: 600,
    fonts: [{ name: 'Roboto', data: fontData, weight: 400, style: 'normal' }]
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  return pngBuffer;
}

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
