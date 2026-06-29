const fs = require('fs');
const https = require('https');

// Test with Wikipedia #Bracket anchor
const url = 'https://image.thum.io/get/width/1200/https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage%23Bracket';

https.get(url, (res) => {
    const file = fs.createWriteStream('scratch/test_anchor.jpg');
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Download completed. File size:', fs.statSync('scratch/test_anchor.jpg').size);
    });
});
