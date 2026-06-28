const fs = require('fs');

async function fetchMatch() {
    // 2022-12-18 World Cup Final (Argentina vs France)
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20221218`;
    const res = await fetch(espnUrl);
    const data = await res.json();
    fs.writeFileSync('scratch/espn_2022_final.json', JSON.stringify(data, null, 2));
    console.log("Saved to scratch/espn_2022_final.json");
    
    // Also let's find a match with missed penalty if possible. Or we can just look at the details array.
    if (data.events && data.events.length > 0) {
        const details = data.events[0].competitions[0].details || [];
        const goals = details.filter(d => d.scoringPlay);
        const missedPens = details.filter(d => d.penaltyKick && !d.scoringPlay); // Maybe?
        
        console.log("Goals:", goals.map(g => ({
            type: g.type,
            text: g.text,
            penaltyKick: g.penaltyKick,
            ownGoal: g.ownGoal,
            shootout: g.shootout
        })));
        
        console.log("Shootout?", data.events[0].competitions[0].competitors.map(c => ({
            team: c.team.name,
            score: c.score,
            shootoutScore: c.shootoutScore
        })));
    }
}

fetchMatch();
