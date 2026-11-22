const fs = require('fs'), APP = '/home/claude/housen-app';
fs.writeFileSync('site/code.js', 'window.CODE_SRC=' + JSON.stringify(fs.readFileSync(APP + '/backend/Code.gs', 'utf8')) + ';');
fs.writeFileSync('site/data.js', 'window.SEED=' + fs.readFileSync('seed.json', 'utf8') + ';window.LOGO_B64=' + JSON.stringify(fs.readFileSync(APP + '/icons/logo.png').toString('base64')) + ';');
const m = JSON.parse(fs.readFileSync(APP + '/manifest.webmanifest', 'utf8')); m.name = '浩森工作｜試玩版'; m.short_name = '浩森試玩';
fs.writeFileSync('site/manifest.webmanifest', JSON.stringify(m, null, 2));
