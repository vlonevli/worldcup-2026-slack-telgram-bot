const fs = require('fs');
const path = require('path');
const https = require('https');

const teamsPath = path.join(__dirname, '../worldcup.json/2026/worldcup.teams.json');
const flagsDir = path.join(__dirname, '../flags');

if (!fs.existsSync(flagsDir)) {
    fs.mkdirSync(flagsDir);
}

const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));

async function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Handle redirect
                download(response.headers.location, dest).then(resolve).catch(reject);
            } else {
                fs.unlink(dest, () => {}); // Delete the file async
                reject(new Error(`Server responded with ${response.statusCode}: ${response.statusMessage}`));
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log(`Starting flag downloads to ${flagsDir}...`);
    for (const team of teams) {
        let unicodeStr = team.flag_unicode;
        let hexParts = [];
        const regex = /\\u\{([A-Fa-f0-9]+)\}/g;
        let match;
        while ((match = regex.exec(unicodeStr)) !== null) {
            hexParts.push(match[1].toLowerCase());
        }
        
        if (hexParts.length === 0) {
            console.log(`No unicode found for ${team.name}`);
            continue;
        }

        const codepoint = hexParts.join('-');
        const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoint}.svg`;
        const dest = path.join(flagsDir, `${team.fifa_code}.svg`);

        try {
            await download(url, dest);
            console.log(`Saved ${team.fifa_code}.svg (${team.name})`);
        } catch (e) {
            console.error(`Failed to download ${url}: ${e.message}`);
        }
    }
    console.log('Finished downloading flags.');
}

main().catch(console.error);
