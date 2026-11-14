const { _electron: electron } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(root, 'node_modules', 'electron')), args: ['--no-sandbox', root, path.join(out, 'links.pdf')] });
  // Record instead of really opening a browser, keeping the same safety rule as main.js.
  await app.evaluate(({ ipcMain }) => {
    globalThis.__opened = [];
    ipcMain.removeHandler('open-external');
    ipcMain.handle('open-external', (_e, url) => {
      const ok = typeof url === 'string' && /^(https?:|mailto:)/i.test(url.trim());
      if (ok) globalThis.__opened.push(url);
      return ok;
    });
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await win.waitForFunction(() => document.querySelectorAll('.page[data-idx="0"] .pdf-link').length >= 4, null, { timeout: 20000 });
  const links = await win.$$eval('.page[data-idx="0"] .pdf-link', (ls) => ls.map((l) => l.title));
  console.log('links on page 1:', JSON.stringify(links));
  await win.evaluate(() => window.__pdfacil.S.pe[0].el.querySelectorAll('.pdf-link')[0].scrollIntoView({ block: 'center' }));
  await win.waitForTimeout(300);
  const els = await win.$$('.page[data-idx="0"] .pdf-link');
  await els[0].hover();
  await win.screenshot({ path: path.join(out, '30-link-hover.png'), clip: { x: 300, y: 300, width: 800, height: 300 } });
  for (const el of els.slice(0, 3)) await el.click();
  await win.waitForTimeout(300);
  console.log('opened in browser:', JSON.stringify(await app.evaluate(() => globalThis.__opened)), '| status:', await win.textContent('#statusMsg'));
  const before = await win.evaluate(() => window.__pdfacil.S.current + 1);
  await els[3].click();
  await win.waitForTimeout(400);
  const after = await win.evaluate(() => window.__pdfacil.S.current + 1);
  await win.keyboard.press('Alt+ArrowLeft');
  await win.waitForTimeout(300);
  const back = await win.evaluate(() => window.__pdfacil.S.current + 1);
  console.log('internal link: page', before, '->', after, '| Alt+Left back to page', back);
  // links stay in place after zoom
  const r1 = await (await win.$('.page[data-idx="0"] .pdf-link')).boundingBox();
  await win.evaluate(() => window.__pdfacil.setScale(window.__pdfacil.S.scale * 1.5));
  await win.waitForTimeout(500);
  const pg = await (await win.$('.page[data-idx="0"]')).boundingBox();
  const r2 = await (await win.$('.page[data-idx="0"] .pdf-link')).boundingBox();
  console.log('link width ratio after 1.5x zoom:', (r2.width / r1.width).toFixed(2), '| inside page:', r2.x >= pg.x && r2.x + r2.width <= pg.x + pg.width);
  // highlight tool: links are not clickable (so you can highlight link text)
  await win.click('.panel.active [data-tool=highlight]');
  console.log('pointer-events in highlight mode:', await win.$eval('.pdf-link', (l) => getComputedStyle(l).pointerEvents));
  console.log('ERRORS:', errors.join('\n'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
