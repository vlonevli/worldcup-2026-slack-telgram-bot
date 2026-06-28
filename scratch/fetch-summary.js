const fs = require('fs');

async function fetchSummary() {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=633850`;
    const res = await fetch(url);
    const data = await res.json();
    fs.writeFileSync('scratch/summary_633850.json', JSON.stringify(data, null, 2));
    
    // Check plays
    const goals = (data.rosters || []).concat(data.keyEvents || []).concat(data.plays || []);
    console.log("Summary saved to scratch/summary_633850.json");
    
    if (data.keyEvents) {
        console.log("Key events with text:");
        data.keyEvents.forEach(e => {
            console.log(`[${e.clock?.displayValue}] ${e.type?.text} - ${e.text}`);
        });
    }
}

fetchSummary();
