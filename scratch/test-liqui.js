const fs = require('fs');
const https = require('https');

const url = 'https://image.thum.io/get/width/1200/https://liquipedia.net/football/FIFA_World_Cup/2026/Knockout_Stage';

https.get(url, (res) => {
    const file = fs.createWriteStream('scratch/test_liqui.jpg');
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Download completed. File size:', fs.statSync('scratch/test_liqui.jpg').size);
    });
}).on('error', (err) => {
    console.error('Error downloading:', err.message);
});
