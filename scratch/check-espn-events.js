const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch/espn_2022_final.json', 'utf8'));

if (data.events && data.events.length > 0) {
    const details = data.events[0].competitions[0].details || [];
    
    // Find all types of events
    const eventTypes = new Set();
    details.forEach(d => {
        if (d.type && d.type.text) {
            eventTypes.add(d.type.text);
        }
    });
    console.log("All Event Types:", Array.from(eventTypes));
    
    // Print full structure of a goal and a penalty
    console.log("Sample Goal:", JSON.stringify(details.find(d => d.scoringPlay && !d.penaltyKick && !d.shootout), null, 2));
    console.log("Sample Penalty:", JSON.stringify(details.find(d => d.penaltyKick && !d.shootout), null, 2));
    console.log("Sample Missed Penalty / Shootout missed:", JSON.stringify(details.find(d => d.penaltyKick && !d.scoringPlay), null, 2));
}
