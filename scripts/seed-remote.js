const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runSQL(sql) {
    fs.writeFileSync('temp.sql', sql);
    console.log(execSync('npx wrangler d1 execute wc26-db --remote --file temp.sql').toString());
}

async function seed() {
    console.log("Applying schema to remote...");
    console.log(execSync('npx wrangler d1 execute wc26-db --remote --file schema.sql').toString());

    const teamsPath = path.join(__dirname, '../worldcup.json/2026/worldcup.teams.json');
    const stadiumsPath = path.join(__dirname, '../worldcup.json/2026/worldcup.stadiums.json');
    const matchesPath = path.join(__dirname, '../worldcup.json/2026/worldcup.json');

    const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
    const stadiumsData = JSON.parse(fs.readFileSync(stadiumsPath, 'utf8'));
    const matchesData = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

    // Insert Teams
    console.log("Inserting Teams...");
    let teamsSql = `INSERT INTO teams (name, name_normalised, fifa_code, flag_icon, group_name, continent, confed) VALUES\n`;
    const teamValues = teams.map(t => {
        const norm = t.name_normalised || t.name;
        return `('${t.name.replace(/'/g, "''")}', '${norm.replace(/'/g, "''")}', '${t.fifa_code}', '${t.flag_icon}', '${t.group}', '${t.continent}', '${t.confed}')`;
    });
    teamsSql += teamValues.join(',\n') + ' ON CONFLICT DO NOTHING;';
    runSQL(teamsSql);

    // Insert Stadiums
    console.log("Inserting Stadiums...");
    let stadiumsSql = `INSERT INTO stadiums (name, city, timezone, cc, capacity, coords) VALUES\n`;
    const stadiumValues = stadiumsData.stadiums.map(s => {
        return `('${s.name.replace(/'/g, "''")}', '${s.city.replace(/'/g, "''")}', '${s.timezone}', '${s.cc}', ${s.capacity}, '${s.coords.replace(/'/g, "''")}')`;
    });
    stadiumsSql += stadiumValues.join(',\n') + ' ON CONFLICT DO NOTHING;';
    runSQL(stadiumsSql);

    // Create a map of city to stadium name
    const cityToStadium = {};
    for (const s of stadiumsData.stadiums) {
        cityToStadium[s.city] = s.name;
    }

    // Insert placeholder teams for knockout stage names (e.g., "2A", "W74", etc.) to satisfy foreign key constraints
    const teamNames = new Set(teams.map(t => t.name));
    const uniqueTeamsInMatches = new Set();
    for (const m of matchesData.matches) {
        uniqueTeamsInMatches.add(m.team1);
        uniqueTeamsInMatches.add(m.team2);
    }
    const missingTeams = [...uniqueTeamsInMatches].filter(t => !teamNames.has(t));
    if (missingTeams.length > 0) {
        console.log(`Inserting ${missingTeams.length} placeholder teams...`);
        let placeholderSql = `INSERT INTO teams (name, name_normalised, fifa_code, flag_icon, group_name, continent, confed) VALUES\n`;
        const placeholderValues = missingTeams.map(t => {
            return `('${t.replace(/'/g, "''")}', '${t.replace(/'/g, "''")}', '${t.replace(/'/g, "''")}', '🏳️', 'Placeholder', 'Unknown', 'Unknown')`;
        });
        placeholderSql += placeholderValues.join(',\n') + ' ON CONFLICT DO NOTHING;';
        runSQL(placeholderSql);
    }

    // Insert Matches
    console.log("Inserting Matches...");
    let matchesSql = `INSERT INTO matches (id, round, date, time_str, kickoff_utc, team1_name, team2_name, status, ground) VALUES\n`;
    const matchValues = [];
    
    let indexId = 1;
    for (const m of matchesData.matches) {
        const timeParts = m.time.split(' ');
        const hm = timeParts[0]; 
        let offsetStr = timeParts.length > 1 ? timeParts[1] : 'UTC±0';
        let offsetHours = 0;
        
        if (offsetStr.startsWith('UTC')) {
            const sign = offsetStr.includes('-') ? -1 : 1;
            const num = parseInt(offsetStr.replace('UTC', '').replace('+', '').replace('-', '')) || 0;
            offsetHours = sign * num;
        } else if (offsetStr === 'CET') offsetHours = 1;
        else if (offsetStr === 'CEST') offsetHours = 2;
        
        const [hour, minute] = hm.split(':').map(Number);
        const tDate = new Date(`${m.date}T00:00:00Z`);
        const utcMs = tDate.getTime() + (hour * 3600000) + (minute * 60000) - (offsetHours * 3600000);

        const status = 'SCHEDULED';
        const mId = m.num || indexId; 
        const t1 = m.team1.replace(/'/g, "''");
        const t2 = m.team2.replace(/'/g, "''");
        const round = m.round.replace(/'/g, "''");
        
        // Map ground (city) to stadium name
        const mappedGround = cityToStadium[m.ground] || m.ground;
        const ground = mappedGround.replace(/'/g, "''");
        
        matchValues.push(`(${mId}, '${round}', '${m.date}', '${m.time.replace(/'/g, "''")}', ${utcMs}, '${t1}', '${t2}', '${status}', '${ground}')`);
        indexId++;
    }
    
    matchesSql += matchValues.join(',\n') + ' ON CONFLICT DO NOTHING;';
    runSQL(matchesSql);

    console.log("Remote seed complete.");
    if (fs.existsSync('temp.sql')) {
        fs.unlinkSync('temp.sql');
    }
}

seed().catch(console.error);
