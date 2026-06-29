const fs = require('fs');
const https = require('https');

const url = 'https://image.thum.io/get/width/1200/https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage';

https.get(url, (res) => {
    const file = fs.createWriteStream('scratch/test.jpg');
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Download completed. File size:', fs.statSync('scratch/test.jpg').size);
    });
}).on('error', (err) => {
    console.error('Error downloading:', err.message);
});
