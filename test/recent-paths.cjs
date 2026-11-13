const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
(async () => {
  const base = path.join(os.tmpdir(), 'pdfacil-paths');
  const dirs = [
    path.join(base, 'a'),
    path.join(base, 'Documents', 'Research', 'Papers'),
    path.join(base, 'Documents', 'Research', 'Literature review - 2026', 'papers', 'cited by chapter 3'),
    path.join(base, 'Documents', 'Research', 'Literature review - 2026', 'papers', 'cited by chapter 3', 'very', 'deeply', 'nested', 'folder', 'with a long name that keeps going and going'),
  ];
  const files = dirs.map((d, k) => { fs.mkdirSync(d, { recursive: true }); const f = path.join(d, `Paper-${k + 1}.pdf`); fs.copyFileSync(path.join(__dirname, 'sample.pdf'), f); return { path: f, time: Date.now() - k * 3600e3 }; });
  const app = await electron.launch({ executablePath: require(path.join(root, 'node_modules', 'electron')), args: ['--no-sandbox', root] });
  const ud = await app.evaluate(({ app }) => app.getPath('userData'));
  fs.writeFileSync(path.join(ud, 'recent.json'), JSON.stringify(files));
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  await win.reload();
  await win.waitForSelector('#recentTable tbody tr');
  for (const w of [1500, 1100, 820]) {
    await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 520), w);
    await win.waitForTimeout(400);
    const info = await win.$$eval('#recentTable td.dir', (tds) => tds.map((td) => ({
      font: getComputedStyle(td).fontSize, cut: td.scrollWidth > td.clientWidth + 1, start: td.textContent.slice(0, 22),
    })));
    console.log(w, JSON.stringify(info));
    await win.screenshot({ path: path.join(out, `28-paths-${w}.png`), clip: { x: 0, y: 110, width: w, height: 260 } });
  }
  // hover: popup only for cut-off paths
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 520));
  await win.waitForTimeout(400);
  const cells = await win.$$('#recentTable td.dir');
  for (const k of [0, 3]) {
    await cells[k].hover();
    await win.waitForTimeout(450);
    const tip = await win.evaluate(() => ({ shown: !document.querySelector('#pathTip').hidden, text: document.querySelector('#pathTip').textContent }));
    console.log(`hover row ${k + 1}:`, JSON.stringify({ shown: tip.shown, text: tip.shown ? tip.text.slice(-45) : '' }));
    if (k === 3) { console.log('tip rect:', JSON.stringify(await win.$eval('#pathTip', (t) => { const r = t.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, getComputedStyle(t).display]; }))); await win.screenshot({ path: path.join(out, '29-path-tip.png') }); }
  }
  await win.mouse.move(5, 5);
  await win.waitForTimeout(100);
  console.log('hidden after leaving:', await win.$eval('#pathTip', (t) => t.hidden));
  fs.writeFileSync(path.join(ud, 'recent.json'), '[]');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
