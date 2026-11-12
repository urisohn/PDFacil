const { _electron: electron } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
const launch = (file) => electron.launch({ executablePath: require(path.join(root, 'node_modules', 'electron')), args: ['--no-sandbox', root, file] });
(async () => {
  let app = await launch(path.join(out, 'sign.pdf'));
  let win = await app.firstWindow();
  const errors = [];
  const watch = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
  watch(win);
  await win.waitForFunction(() => document.querySelector('.page canvas.pc'), null, { timeout: 20000 });
  await win.evaluate(() => localStorage.removeItem('pdfacil.signatures'));
  // 1. Sign with no saved signatures -> dialog opens on Draw
  await win.click('.panel.active [data-cmd=sign]');
  await win.waitForSelector('#sigDlg:not([hidden])');
  const pad = await (await win.$('#sigPad')).boundingBox();
  const stroke = async (pts) => { await win.mouse.move(pad.x + pts[0][0], pad.y + pts[0][1]); await win.mouse.down(); for (const [x, y] of pts.slice(1)) await win.mouse.move(pad.x + x, pad.y + y, { steps: 3 }); await win.mouse.up(); };
  await stroke([[60, 120], [90, 60], [110, 130], [140, 70], [170, 125], [210, 80], [260, 120], [320, 90], [380, 115]]);
  await stroke([[400, 70], [405, 130]]);
  await win.click('.panel.active .sig-tab[data-mode=type]').catch(() => {});
  await win.click('#sigDlg .sig-tab[data-mode=type]');
  await win.fill('#sigName', 'Jane Q. Researcher');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(out, '23-sig-type.png') });
  await win.click('#sigDlg .sig-tab[data-mode=draw]');
  await win.waitForTimeout(200);
  await win.screenshot({ path: path.join(out, '24-sig-draw.png') });
  await win.click('#sigDlg .sig-use');
  // 2. Placing mode: click on page 1
  const pg = await (await win.$('.page[data-idx="0"]')).boundingBox();
  await win.mouse.move(pg.x + 400, pg.y + 520);
  await win.waitForTimeout(100);
  console.log('tool:', await win.evaluate(() => window.__pdfacil.S.tool), 'ghost visible:', await win.$eval('#sigGhost', (g) => !g.hidden));
  await win.mouse.click(pg.x + 400, pg.y + 520);
  await win.waitForTimeout(200);
  let a = await win.evaluate(() => window.__pdfacil.S.model.pages[0].annots.find((x) => x.type === 'sig'));
  console.log('placed:', JSON.stringify({ w: a.w.toFixed(1), h: a.h.toFixed(1), rot: a.rot, img: a.imgId }), 'tool now:', await win.evaluate(() => window.__pdfacil.S.tool));
  // 3. Resize via corner, then undo/redo
  const rs = await (await win.$('.ann-sig .rs-sig')).boundingBox();
  await win.mouse.move(rs.x + 6, rs.y + 6); await win.mouse.down(); await win.mouse.move(rs.x + 106, rs.y + 60, { steps: 6 }); await win.mouse.up();
  a = await win.evaluate(() => window.__pdfacil.S.model.pages[0].annots.find((x) => x.type === 'sig'));
  console.log('resized w:', a.w.toFixed(1));
  await win.keyboard.press('Control+z');
  console.log('after undo w:', (await win.evaluate(() => window.__pdfacil.S.model.pages[0].annots.find((x) => x.type === 'sig').w)).toFixed(1));
  await win.keyboard.press('Control+y');
  // 4. Second time: chooser menu shows saved signature; place on rotated page 5 (index 4)
  await win.evaluate(() => window.__pdfacil.S.pe[4].el.scrollIntoView());
  await win.waitForTimeout(400);
  await win.click('.panel.active [data-cmd=sign]');
  await win.waitForSelector('#ctxMenu .sig-choice');
  console.log('saved signatures in menu:', await win.$$eval('#ctxMenu .sig-choice', (r) => r.length));
  await win.screenshot({ path: path.join(out, '25-sig-menu.png') });
  await win.click('#ctxMenu .sig-choice .use');
  const p5 = await (await win.$('.page[data-idx="4"]')).boundingBox();
  await win.mouse.click(p5.x + 300, p5.y + 200);
  await win.waitForTimeout(300);
  await win.evaluate(() => window.__pdfacil.S.pe[0].el.scrollIntoView());
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(out, '26-sig-placed.png') });
  // 5. Save
  await win.click('#viewer', { position: { x: 5, y: 5 } });
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(1500);
  console.log('ERRORS 1:', errors.join('\n'));
  await win.evaluate(() => localStorage.removeItem('pdfacil.signatures'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
  // 6. Reopen: signatures editable again
  app = await launch(path.join(out, 'sign.pdf'));
  win = await app.firstWindow();
  watch(win);
  await win.waitForFunction(() => document.querySelector('.page canvas.pc'), null, { timeout: 20000 });
  await win.waitForTimeout(500);
  const re = await win.evaluate(() => window.__pdfacil.S.model.pages.map((p) => p.annots.filter((x) => x.type === 'sig').map((x) => ({ w: +x.w.toFixed(1), hasImg: !!window.__pdfacil.IMAGES.get(x.imgId) }))));
  console.log('reopened sigs:', JSON.stringify(re), 'sig elements:', await win.$$eval('.ann-sig img', (i) => i.filter((x) => x.naturalWidth > 0).length));
  console.log('ERRORS 2:', errors.join('\n'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
