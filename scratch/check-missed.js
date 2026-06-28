const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch/espn_2022_final.json', 'utf8'));

const details = data.events[0].competitions[0].details || [];

console.log("All shootout events:");
console.log(JSON.stringify(details.filter(d => d.shootout), null, 2));

console.log("Any missed penalties (non-shootout)?");
console.log(JSON.stringify(details.filter(d => d.type && d.type.text && d.type.text.toLowerCase().includes('miss')), null, 2));
