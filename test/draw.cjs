const { _electron: electron } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
const launch = (file) => electron.launch({ executablePath: require(path.join(root, 'node_modules', 'electron')), args: ['--no-sandbox', root, file] });
(async () => {
  let app = await launch(path.join(out, 'draw.pdf'));
  let win = await app.firstWindow();
  const errors = [];
  const watch = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
  watch(win);
  await win.waitForFunction(() => document.querySelector('.page canvas.pc'), null, { timeout: 20000 });
  const inks = (p) => win.evaluate((p) => window.__pdfacil.S.model.pages[p].annots.filter((a) => a.type === 'ink').map((a) => ({ n: a.paths[0].length / 2, w: a.width, c: a.color.map((v) => +v.toFixed(2)) })), p);
  console.log('imported foreign ink on page 2:', JSON.stringify(await inks(1)));
  // Home > Draw: pen bar appears
  await win.click('.panel.active [data-tool=draw]');
  console.log('pen bar visible:', await win.$eval('#penBar', (b) => !b.hidden), 'tool:', await win.evaluate(() => window.__pdfacil.S.tool));
  const pg = await (await win.$('.page[data-idx="0"]')).boundingBox();
  const draw = async (pts) => { await win.mouse.move(pg.x + pts[0][0], pg.y + pts[0][1]); await win.mouse.down(); for (const [x, y] of pts.slice(1)) await win.mouse.move(pg.x + x, pg.y + y, { steps: 6 }); await win.mouse.up(); };
  // red medium ellipse-ish
  const ell = []; for (let t = 0; t <= 6.4; t += 0.25) ell.push([330 + 230 * Math.cos(t), 330 + 45 * Math.sin(t)]);
  await draw(ell);
  // blue thick arrow
  await win.click('#penBar .swatch[data-pen=blue]');
  await win.click('#penBar .pen-w[data-w=thick]');
  await draw([[600, 420], [680, 400]]);
  await draw([[660, 385], [682, 400], [664, 418]]);
  // green marker squiggle
  await win.click('#penBar .swatch[data-pen=green]');
  await win.click('#penBar .pen-w[data-w=marker]');
  await draw([[120, 540], [160, 520], [200, 545], [240, 520], [280, 545]]);
  console.log('page 1 inks:', JSON.stringify(await inks(0)));
  console.log('comment-tab pen group synced:', await win.$eval('[data-panel=comment] .pen-colors .swatch.active', (b) => b.dataset.pen), await win.$eval('[data-panel=comment] .pen-w.active', (b) => b.dataset.w));
  await win.screenshot({ path: path.join(out, '27-draw.png') });
  // eraser: drag across the green squiggle
  await win.click('#penBar .pb-eraser');
  await win.mouse.move(pg.x + 200, pg.y + 500); await win.mouse.down(); await win.mouse.move(pg.x + 200, pg.y + 570, { steps: 8 }); await win.mouse.up();
  console.log('after erase:', (await inks(0)).length);
  await win.keyboard.press('Control+z');
  console.log('after undo erase:', (await inks(0)).length);
  // Done -> select; click the blue arrow to select, Delete
  await win.click('#penBar .pb-done');
  console.log('tool after Done:', await win.evaluate(() => window.__pdfacil.S.tool), 'bar hidden:', await win.$eval('#penBar', (b) => b.hidden));
  await win.mouse.click(pg.x + 640, pg.y + 410);
  console.log('selected:', await win.evaluate(() => { const s = window.__pdfacil.S.sel; return s && window.__pdfacil.S.model.pages[s.page].annots.find((a) => a.id === s.id).type; }), 'sel box shown:', !!(await win.$('.ink-sel')));
  await win.keyboard.press('Delete');
  console.log('after delete:', (await inks(0)).length);
  await win.keyboard.press('Control+z');
  console.log('after undo delete:', (await inks(0)).length);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(1500);
  console.log('ERRORS 1:', errors.join('\n'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
  app = await launch(path.join(out, 'draw.pdf'));
  win = await app.firstWindow();
  watch(win);
  await win.waitForFunction(() => document.querySelector('.page canvas.pc'), null, { timeout: 20000 });
  await win.waitForTimeout(400);
  console.log('reopened page 1:', JSON.stringify(await inks(0)), 'page 2:', JSON.stringify(await inks(1)));
  console.log('ERRORS 2:', errors.join('\n'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
