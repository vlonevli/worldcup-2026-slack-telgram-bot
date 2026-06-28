const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch/espn_2022_final.json', 'utf8'));
const details = data.events[0].competitions[0].details || [];
console.log("Keys of a goal detail:");
console.log(Object.keys(details.find(d => d.scoringPlay)));
console.log(details.find(d => d.scoringPlay));
