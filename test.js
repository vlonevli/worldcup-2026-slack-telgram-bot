// test.js
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
// Format to YYYYMMDD as expected by ESPN (e.g. 20260611 for South Korea match)
const dateStr = '20260611';

// For testing purposes, let's fetch for today or a general date if nothing is on.
// We can also fetch without a date parameter, which returns the current/latest matches.
const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;

console.log(`Fetching ESPN World Cup matches for date: ${dateStr}`);
console.log(`URL: ${url}\n`);

function cleanTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')       // collapse multiple spaces
    .trim();
}

const aliasMap = {
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

function matchTeams(dbName, espnName) {
  const cleanDb = cleanTeamName(dbName);
  const cleanEspn = cleanTeamName(espnName);

  const resolvedDb = aliasMap[cleanDb] || cleanDb;
  const resolvedEspn = aliasMap[cleanEspn] || cleanEspn;

  return resolvedDb === resolvedEspn || resolvedDb.includes(resolvedEspn) || resolvedEspn.includes(resolvedDb);
}

// Database team names (from seed.sql) for today's matches
const dbTeams = ['Canada', 'Bosnia & Herzegovina', 'USA', 'Paraguay', 'Mexico', 'South Africa', 'South Korea', 'Czech Republic'];

async function testFetch() {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const events = data.events || [];
    
    console.log(`Successfully fetched ${events.length} events from ESPN.\n`);

    if (events.length > 0) {
      for (const event of events) {
        printEvent(event);
      }
    } else {
      console.log('No matches scheduled/live for this date on ESPN.');
    }
  } catch (error) {
    console.error('Fetch Failed:', error.message);
  }
}

function printEvent(event) {
  const comp = event.competitions?.[0];
  if (!comp) return;

  const homeCompetitor = comp.competitors?.find(c => c.homeAway === 'home');
  const awayCompetitor = comp.competitors?.find(c => c.homeAway === 'away');

  const home = homeCompetitor?.team?.name || homeCompetitor?.team?.displayName;
  const away = awayCompetitor?.team?.name || awayCompetitor?.team?.displayName;
  const homeScore = homeCompetitor?.score ?? '0';
  const awayScore = awayCompetitor?.score ?? '0';

  const status = event.status?.type?.name; // e.g. STATUS_SCHEDULED, STATUS_IN_PROGRESS, STATUS_FINAL
  const statusDesc = event.status?.type?.description; // e.g. "Scheduled", "In Progress", "Final"
  const detail = event.status?.type?.detail || event.status?.period;
  const id = event.id;

  // Find matching teams in our db
  const matchedHome = dbTeams.find(name => matchTeams(name, home)) || 'UNKNOWN';
  const matchedAway = dbTeams.find(name => matchTeams(name, away)) || 'UNKNOWN';

  console.log(`[Match ID: ${id}]`);
  console.log(`  ESPN: ${home} (${homeScore}) vs ${away} (${awayScore})`);
  console.log(`  DB Match: ${matchedHome} vs ${matchedAway}`);
  console.log(`  Status: ${status} (${statusDesc}) | Detail: ${detail}`);
  console.log('----------------------------------------------------');
}

testFetch();
