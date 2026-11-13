// Records when the app was built; the About dialog shows it as "Last update".
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'build-info.json');
fs.writeFileSync(file, JSON.stringify({ built: new Date().toISOString() }) + '\n');
console.log(`Build date stamped in ${path.relative(process.cwd(), file)}`);
