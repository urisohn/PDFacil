// After `npm run dist`, optionally copy the built app to another folder.
// Set the PDFACIL_OUT environment variable to that folder; without it, nothing is copied.
//   Windows: copies the contents of dist/win-unpacked (run PDFacil.exe there).
//   macOS:   copies PDFacil.app (for example, set PDFACIL_OUT=/Applications).
// Close PDFacil before running this, otherwise the old files may be locked.
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');

let src = null;
let isApp = false;
if (fs.existsSync(path.join(dist, 'win-unpacked'))) src = path.join(dist, 'win-unpacked');
for (const d of ['mac-arm64', 'mac', 'mac-universal']) {
  const app = path.join(dist, d, 'PDFacil.app');
  if (process.platform === 'darwin' && fs.existsSync(app)) {
    src = app;
    isApp = true;
    break;
  }
}
if (!src) {
  console.log('No build found in dist/.');
  process.exit(0);
}
const outDir = process.env.PDFACIL_OUT;
if (!outDir) {
  console.log(`Built the app: ${path.relative(process.cwd(), src)} (set PDFACIL_OUT to also copy it elsewhere).`);
  process.exit(0);
}
try {
  const dest = isApp ? path.join(outDir, 'PDFacil.app') : outDir;
  fs.mkdirSync(outDir, { recursive: true });
  if (isApp) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, force: true, verbatimSymlinks: true });
  console.log(`Copied PDFacil to ${dest}.`);
} catch (e) {
  console.log(`Could not copy to ${outDir} (${e.message}). The app is in ${src}.`);
}
