// PDFacil - renderer
import * as pdfjsLib from './vendor/pdf.min.mjs';
import {
  importAnnotations, buildPdf, HIGHLIGHT_COLORS, newId, wrapLines, TEXT_PAD, LINE_FACTOR, TEXT_FONTS, fontOf,
} from './pdfio.js';
import { loadOutline, flatten, setInitialOpen } from './outline.js';
import { PEN_COLORS, PEN_WIDTHS, simplify, svgPathData, tracePath, distToPath, pathsBBox } from './ink.js';
import { createSignatureDialog, loadSaved as loadSavedSignatures, deleteSaved as deleteSavedSignature } from './signature.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
const PDFJS_OPTS = {
  cMapUrl: './vendor/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: './vendor/standard_fonts/',
  isEvalSupported: false,
};

const api = window.api;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const viewer = $('#viewer');
const pagesDiv = $('#pages');
const thumbsDiv = $('#thumbs');
const sidebar = $('#sidebar');

// ---------------------------------------------------------------- icons
const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 11H7.4a2 2 0 0 0-1.9 1.4L3 20"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8"/>',
  saveAs: '<path d="M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v4"/><path d="M7 3v5h8V3"/><path d="M7 21v-6h5"/><path d="m16.5 21.5 5-5-2-2-5 5-.5 2.5z"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9.5 12.5 5 5m0-5-5 5"/>',
  first: '<path d="M6 5v14"/><path d="m18 6-7 6 7 6"/>',
  prev: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  last: '<path d="M18 5v14"/><path d="m6 6 7 6-7 6"/>',
  rotL: '<path d="M3 4v5h5"/><path d="M3.5 9A9 9 0 1 1 6 17.5"/><rect x="9" y="9" width="7" height="8" rx="1"/>',
  rotR: '<path d="M21 4v5h-5"/><path d="M20.5 9A9 9 0 1 0 18 17.5"/><rect x="8" y="9" width="7" height="8" rx="1"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6m4-6v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>',
  highlight: '<path d="m9 11-5 5v4h4l5-5"/><path d="m13 7 4 4"/><path d="m9 11 6-6a2.8 2.8 0 0 1 4 4l-6 6z"/><path d="M14 21h7" stroke-width="3" stroke="#f5c400"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  note: '<path d="M4 4h16v12H9l-5 4z"/><path d="M8 8h8M8 12h5"/>',
  eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-3L13 4a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9"/><path d="M7 21h14"/><path d="m9 10 6 6"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m21 21-5.5-5.5M10.5 7.5v6m-3-3h6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m21 21-5.5-5.5M7.5 10.5h6"/>',
  actual: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10v5M7 10h1M15 10v5M14 10h1M11.5 11v.01M11.5 14v.01"/>',
  fitW: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 12 3-3m-3 3 3 3m-3-3h10m0 0-3-3m3 3-3 3"/>',
  fitP: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m21 21-5.5-5.5"/>',
  outline: '<path d="M4 6h2M4 12h2M4 18h2"/><path d="M9 6h11M12 12h8M12 18h8"/>',
  thumbs: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="3" y="13" width="7" height="8" rx="1"/><path d="M14 5h7M14 9h5M14 15h7M14 19h5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevUp: '<path d="m6 15 6-6 6 6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  sign: '<path d="M3 17c3-1 4-9 6-9s0 9 2 9 2-5 4-5 1 4 3 4 2-2 3-2"/><path d="M3 21h18"/>',
  pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/><path d="M5 15l3 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01" stroke-width="2.4"/>',
};
const svg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
$$('[data-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', svg(b.dataset.icon)));
$$('#ribbon button[data-cmd]').forEach((b) => {
  if (!['open', 'recentMenu', 'about'].includes(b.dataset.cmd)) b.dataset.needsDoc = '1';
});
$$('#ribbon button[data-tool]').forEach((b) => (b.dataset.needsDoc = '1'));

const NOTE_SVG = (rgb) => {
  const c = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
  return `<svg viewBox="0 0 20 20"><path d="M2 2h16v12H9l-4 4 1-4H2z" fill="${c}" stroke="rgba(0,0,0,.45)" stroke-width="1"/><path d="M5 6h10M5 8.5h10M5 11h7" stroke="rgba(0,0,0,.5)" stroke-width="1"/></svg>`;
};

// ---------------------------------------------------------------- state
const TEXT_COLORS = { black: [0, 0, 0], red: [0.8, 0.1, 0.1], blue: [0.1, 0.3, 0.85], green: [0.1, 0.5, 0.2] };
// Extra colors offered in the right-click menu of a text box.
const MENU_TEXT_COLORS = {
  black: [0, 0, 0], gray: [0.45, 0.45, 0.45], red: [0.8, 0.1, 0.1], orange: [0.9, 0.45, 0.05],
  green: [0.1, 0.5, 0.2], blue: [0.1, 0.3, 0.85], purple: [0.5, 0.2, 0.7],
};
const TEXT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const NOTE_COLOR = [1, 0.84, 0.2];

const S = {
  path: null,
  name: null,
  baseBytes: null,
  readOnly: false,
  pdf: null,
  pdfPages: [],
  model: { pages: [] },
  textCache: new Map(),
  undo: [],
  redo: [],
  savedSnap: null,
  scale: 1,
  fitMode: 'width',
  tool: 'select',
  hlColor: 'yellow',
  textColor: 'black',
  textSize: 12,
  textFont: 'helv',
  penColor: 'red',
  penWidth: 'medium',
  erasing: false,
  current: 0,
  selPages: new Set(),
  sel: null, // { page, id }
  editing: null, // { page, id, before, isNew }
  openNote: null, // { page, id, before, isNew }
  pe: [], // per page element refs
  visible: new Set(),
  search: { q: '', results: [], idx: -1, byPage: new Map() },
  author: api.username || 'PDFacil',
};

const rgbCss = (c, a = 1) => `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a})`;
const effRot = (i) => {
  const mp = S.model.pages[i];
  return (S.pdfPages[mp.src].rotate + mp.rot) % 360;
};
const viewportFor = (i, scale = S.scale) =>
  S.pdfPages[S.model.pages[i].src].getViewport({ scale, rotation: effRot(i) });
const findAnnot = (page, id) => S.model.pages[page]?.annots.find((a) => a.id === id);

// Signature pictures are kept out of the undo snapshots: annotations refer to them by id.
const IMAGES = new Map(); // id -> PNG data URL
const IMAGE_EL = new Map(); // id -> loaded <img>, for drawing thumbnails
function registerImage(dataUrl) {
  let h = 2166136261;
  for (let k = 0; k < dataUrl.length; k += 7) h = Math.imul(h ^ dataUrl.charCodeAt(k), 16777619);
  const id = `img-${(h >>> 0).toString(36)}-${dataUrl.length.toString(36)}`;
  if (!IMAGES.has(id)) {
    IMAGES.set(id, dataUrl);
    const im = new Image();
    im.onload = () => S.model.pages.forEach((p, k) => p.annots.some((a) => a.imgId === id) && markThumbStale(k));
    im.src = dataUrl;
    IMAGE_EL.set(id, im);
  }
  return id;
}
const getImage = (id) => IMAGES.get(id) || null;

// ---------------------------------------------------------------- ui helpers
let statusTimer;
function status(msg, ms = 3000) {
  $('#statusMsg').textContent = msg;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => ($('#statusMsg').textContent = ''), ms);
}
function busy(msg) {
  $('#busy').hidden = !msg;
  $('#busyMsg').textContent = msg || '';
}
const snapshot = () => JSON.stringify(S.model.pages);
const isDirty = () => !!S.pdf && snapshot() !== S.savedSnap;
function updateDirty() {
  const d = isDirty();
  if (active >= 0 && tabs[active]) {
    const was = tabs[active].dirty;
    tabs[active].dirty = d;
    if (was !== d) renderTabs();
  }
  api.setDirty(tabs.some((t) => t.dirty));
  api.setTitle(S.name ? `${d ? '• ' : ''}${S.name} - PDFacil${S.readOnly ? ' (read-only)' : ''}` : 'PDFacil');
  $('[data-cmd=undo]').disabled = !S.undo.length;
  $('[data-cmd=redo]').disabled = !S.redo.length;
}
function pushUndo(snap = snapshot()) {
  S.undo.push(snap);
  if (S.undo.length > 300) S.undo.shift();
  S.redo = [];
}
function changed(pagesTouched) {
  updateDirty();
  for (const i of pagesTouched || []) markThumbStale(i);
}
function guardEdit() {
  if (!S.pdf) return false;
  if (S.readOnly) {
    status('This PDF is protected, so it can only be viewed and printed.', 5000);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- tabs
// Each open file is a tab. The active tab's document fields live in S; the others are
// stashed in their tab record together with their page and thumbnail DOM.
const DOC_KEYS = [
  'path', 'name', 'baseBytes', 'readOnly', 'pdf', 'pdfPages', 'model', 'textCache', 'undo', 'redo',
  'savedSnap', 'scale', 'fitMode', 'current', 'selPages', 'sel', 'pe', 'visible', 'search',
];
const blankDoc = () => ({
  path: null, name: null, baseBytes: null, readOnly: false, pdf: null, pdfPages: [], model: { pages: [] },
  textCache: new Map(), undo: [], redo: [], savedSnap: null, scale: 1, fitMode: 'width', current: 0,
  selPages: new Set(), sel: null, pe: [], visible: new Set(), search: { q: '', results: [], idx: -1, byPage: new Map() },
});
const tabs = []; // { id, doc, pagesFrag, thumbsFrag, scrollTop, scrollLeft, thumbScroll, dirty }
let active = -1;
let tabSeq = 0;
const tabbar = $('#tabbar');
const tabList = $('#tabList');

function stashActive() {
  if (active < 0) return;
  commitEdits();
  const t = tabs[active];
  t.dirty = isDirty();
  for (const k of DOC_KEYS) t.doc[k] = S[k];
  t.scrollTop = viewer.scrollTop;
  t.scrollLeft = viewer.scrollLeft;
  t.thumbScroll = sidebar.scrollTop;
  t.searchOpen = !searchbar.hidden;
  pageObserver.disconnect();
  thumbObserver.disconnect();
  thumbQueue.clear();
  searchSeq++;
  curTask?.cancel();
  t.pagesFrag = document.createDocumentFragment();
  t.pagesFrag.append(...pagesDiv.childNodes);
  t.thumbsFrag = document.createDocumentFragment();
  t.thumbsFrag.append(...thumbsDiv.childNodes);
}

function loadIntoS(doc) {
  for (const k of DOC_KEYS) S[k] = doc[k];
}

function activate(i) {
  if (i === active || !tabs[i]) return;
  stashActive();
  active = i;
  const t = tabs[i];
  loadIntoS(t.doc);
  S.visible = new Set();
  pagesDiv.append(t.pagesFrag);
  thumbsDiv.append(t.thumbsFrag);
  t.pagesFrag = t.thumbsFrag = null;
  S.pe.forEach((p) => pageObserver.observe(p.el));
  [...thumbsDiv.children].forEach((th) => thumbObserver.observe(th));
  viewer.scrollTop = t.scrollTop || 0;
  viewer.scrollLeft = t.scrollLeft || 0;
  sidebar.scrollTop = t.thumbScroll || 0;
  afterDocSwitch();
  if (t.searchOpen && S.search.q) {
    searchbar.hidden = false;
    searchInput.value = S.search.q;
    updateSearchCount();
  } else {
    searchbar.hidden = true;
    searchInput.value = '';
  }
  if (S.fitMode) applyFit();
  scheduleRender();
}

// ---------------------------------------------------------------- side panels & outline
const outlinePanel = $('#outlinePanel');
const outlineBody = $('#outlineBody');
const outlineCache = new WeakMap(); // pdf -> Promise<{ auto, items }>
let olRows = new Map(); // item -> row element
let olFlat = [];
let olCurrent = null;

function setPanel(which, show) {
  const el = which === 'thumbs' ? sidebar : outlinePanel;
  el.classList.toggle('hidden', !show);
  $$(`[data-cmd=${which === 'thumbs' ? 'toggleThumbs' : 'toggleOutline'}]`).forEach((b) => {
    if (b.classList.contains('big')) b.classList.toggle('active', show);
  });
  try {
    localStorage.setItem(`pdfacil.show.${which}`, show ? '1' : '0');
  } catch {}
  if (which === 'outline' && show) renderOutline();
  if (which === 'thumbs' && show) updateThumbClasses(true);
  if (S.pdf && S.fitMode) setTimeout(applyFit, 0);
}

async function renderOutline() {
  if (outlinePanel.classList.contains('hidden')) return;
  const pdf = S.pdf;
  olRows = new Map();
  olFlat = [];
  olCurrent = null;
  outlineBody.innerHTML = '';
  $('#outlineNote').textContent = '';
  if (!pdf) {
    outlineBody.innerHTML = '<div class="ol-empty">Open a PDF to see its outline.</div>';
    return;
  }
  if (!outlineCache.has(pdf)) {
    const pages = S.pdfPages;
    const textCache = S.textCache;
    const getText = (src) => {
      if (!textCache.has(src)) textCache.set(src, pages[src].getTextContent());
      return textCache.get(src);
    };
    const progress = (k, n) => {
      if (S.pdf === pdf) outlineBody.innerHTML = `<div class="ol-empty">Looking for headings… (page ${k + 1} of ${n})</div>`;
    };
    outlineCache.set(pdf, loadOutline(pdf, pages, getText, progress).then((o) => {
      setInitialOpen(o.items);
      return o;
    }));
    outlineBody.innerHTML = '<div class="ol-empty">Reading outline…</div>';
  }
  let ol;
  try {
    ol = await outlineCache.get(pdf);
  } catch (e) {
    console.error(e);
    ol = { auto: false, items: [] };
  }
  if (S.pdf !== pdf || outlinePanel.classList.contains('hidden')) return;
  outlineBody.innerHTML = '';
  if (!ol.items.length) {
    outlineBody.innerHTML = '<div class="ol-empty">This PDF has no built-in outline, and no headings could be detected.</div>';
    return;
  }
  if (ol.auto) $('#outlineNote').textContent = 'This PDF has no built-in outline. These headings were detected from the text size.';
  olFlat = flatten(ol.items);
  const build = (items, parentEl) => {
    for (const it of items) {
      const row = document.createElement('div');
      row.className = `ol-row lvl${it.level}` + (it.bold ? ' bold' : '') + (it.italic ? ' italic' : '') + (!it.target && !it.url ? ' nolink' : '');
      row.style.paddingLeft = `${4 + (it.level - 1) * 14}px`;
      row.title = it.title;
      row.innerHTML = '<span class="ol-tw"></span><span class="ol-title"></span>';
      row.querySelector('.ol-title').textContent = it.title;
      const tw = row.querySelector('.ol-tw');
      const kids = document.createElement('div');
      kids.className = 'ol-kids' + (it.open ? '' : ' closed');
      if (it.children.length) {
        tw.textContent = it.open ? '▾' : '▸';
        tw.onclick = (e) => {
          e.stopPropagation();
          it.open = !it.open;
          tw.textContent = it.open ? '▾' : '▸';
          kids.classList.toggle('closed', !it.open);
          highlightOutline(true);
        };
      }
      row.onclick = () => {
        if (it.target) goToTarget(it.target);
        else if (it.url) window.open(it.url);
      };
      olRows.set(it, row);
      parentEl.append(row, kids);
      build(it.children, kids);
    }
  };
  build(ol.items, outlineBody);
  highlightOutline(true);
}

function modelIndexForSrc(src) {
  let i = S.model.pages.findIndex((p) => p.src >= src);
  if (i < 0) i = S.model.pages.length - 1;
  return i;
}

/** Vertical position (in viewer scroll coordinates) of an outline target. */
function targetY(t) {
  const i = modelIndexForSrc(t.src);
  const pe = S.pe[i];
  if (!pe) return null;
  let y = 0;
  if (S.model.pages[i].src === t.src && t.top != null) {
    const [, yy] = viewportFor(i).convertToViewportPoint(t.left ?? 0, t.top);
    y = Math.max(0, Math.min(pe.el.offsetHeight, yy));
  }
  return { i, y: pe.el.offsetTop + y };
}

function goToTarget(t) {
  const r = targetY(t);
  if (!r) return;
  viewer.scrollTo({ top: Math.max(0, r.y - 12) });
  S.selPages = new Set([r.i]);
  updateCurrent();
  updateThumbClasses(true);
  highlightOutline(true);
}

let olTimer = null;
function highlightOutline(now = false) {
  if (outlinePanel.classList.contains('hidden') || !olFlat.length) return;
  if (!now) {
    if (olTimer) return;
    olTimer = setTimeout(() => {
      olTimer = null;
      highlightOutline(true);
    }, 120);
    return;
  }
  const pos = viewer.scrollTop + 40;
  let cur = null;
  let curY = -Infinity;
  for (const it of olFlat) {
    if (!it.target) continue;
    const r = targetY(it.target);
    if (r && r.y <= pos && r.y >= curY) {
      cur = it;
      curY = r.y;
    }
  }
  // If the item is inside a closed branch, mark its nearest visible ancestor.
  let show = cur;
  for (let p = cur?.parent; p; p = p.parent) if (!p.open) show = p;
  if (show === olCurrent) return;
  olRows.get(olCurrent)?.classList.remove('current');
  olCurrent = show;
  const row = olRows.get(show);
  if (row) {
    row.classList.add('current');
    const b = outlineBody.getBoundingClientRect();
    const rb = row.getBoundingClientRect();
    if (rb.top < b.top || rb.bottom > b.bottom) row.scrollIntoView({ block: 'nearest' });
  }
}

function afterDocSwitch() {
  renderOutline();
  const n = S.model.pages.length;
  document.body.classList.toggle('nodoc', !S.pdf);
  $('#welcome').hidden = !!S.pdf;
  tabbar.hidden = !tabs.length;
  $('#pageTotal').textContent = n;
  $('#gotoTotal').textContent = `/ ${n}`;
  $('#pageInput').value = n ? S.current + 1 : '';
  $('#gotoInput').value = n ? S.current + 1 : '';
  updateZoomUI();
  updateThumbClasses(false);
  updateDirty();
}

function renderTabs() {
  tabList.innerHTML = '';
  tabs.forEach((t, i) => {
    const doc = i === active ? S : t.doc;
    const el = document.createElement('div');
    el.className = 'doctab' + (i === active ? ' active' : '') + (t.dirty ? ' dirty' : '');
    el.title = doc.path || doc.name;
    el.dataset.idx = i;
    el.innerHTML = '<span class="tdot">●</span><span class="tname"></span><button class="tclose" title="Close (Ctrl+W)">✕</button>';
    el.querySelector('.tname').textContent = doc.name;
    tabList.append(el);
  });
  tabbar.hidden = !tabs.length;
  tabList.querySelector('.doctab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

tabList.addEventListener('mousedown', (e) => {
  const el = e.target.closest('.doctab');
  if (!el) return;
  const i = +el.dataset.idx;
  if (e.button === 1) {
    e.preventDefault();
    closeTab(i);
  } else if (e.button === 0 && !e.target.closest('.tclose')) {
    activate(i);
    renderTabs();
  }
});
tabList.addEventListener('click', (e) => {
  const b = e.target.closest('.tclose');
  if (b) closeTab(+b.closest('.doctab').dataset.idx);
});
tabList.addEventListener('wheel', (e) => {
  if (e.deltaY) {
    tabList.scrollLeft += e.deltaY;
    e.preventDefault();
  }
}, { passive: false });

function switchTab(delta) {
  if (tabs.length < 2) return;
  activate((active + delta + tabs.length) % tabs.length);
  renderTabs();
}

// ---------------------------------------------------------------- open / close
async function confirmDiscard() {
  commitEdits();
  if (!isDirty()) return true;
  const r = await api.confirm(`Save changes to ${S.name}?`, ['Save', "Don't save", 'Cancel']);
  if (r === 0) return save(false);
  return r === 1;
}

async function openDialog() {
  const list = await api.openDialog();
  for (const p of list || []) await openPath(p);
}

const samePath = (a, b) => a && b && a.toLowerCase().replace(/\//g, '\\') === b.toLowerCase().replace(/\//g, '\\');

async function openPath(p) {
  // Already open? Just switch to it.
  const existing = tabs.findIndex((t, i) => samePath(i === active ? S.path : t.doc.path, p));
  if (existing >= 0) {
    activate(existing);
    renderTabs();
    return;
  }
  try {
    busy('Opening…');
    const bytes = await api.readFile(p);
    await loadBytes(bytes, p);
  } catch (e) {
    console.error(e);
    busy(null);
    const msg = /password/i.test(String(e?.name) + String(e?.message))
      ? 'This PDF is password protected. PDFacil cannot open password protected files yet.'
      : `Could not open this file.\n\n${e?.message || e}`;
    api.error(msg);
  } finally {
    busy(null);
    refreshRecent();
  }
}

async function loadBytes(bytes, p) {
  const imported = await importAnnotations(bytes.slice());
  for (const list of imported.annotsBySrc) {
    for (const a of list || []) {
      if (a.type === 'sig' && a.img) {
        a.imgId = registerImage(a.img);
        delete a.img;
      }
    }
  }
  const task = pdfjsLib.getDocument({ data: imported.baseBytes.slice(), ...PDFJS_OPTS });
  task.onPassword = () => {
    task.destroy();
  };
  const pdf = await task.promise;
  const pdfPages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));

  // New tab
  stashActive();
  const doc = blankDoc();
  tabs.push({ id: ++tabSeq, doc, dirty: false });
  active = tabs.length - 1;
  loadIntoS(doc);
  S.pdf = pdf;
  S.pdfPages = pdfPages;
  S.baseBytes = imported.baseBytes;
  S.readOnly = imported.encrypted;
  S.path = p;
  S.name = p.split(/[\\/]/).pop();
  S.model = {
    pages: pdfPages.map((_, i) => ({ src: i, rot: 0, annots: imported.annotsBySrc[i] || [] })),
  };
  S.savedSnap = snapshot();
  S.selPages = new Set([0]);
  searchbar.hidden = true;
  searchInput.value = '';
  buildPagesDOM();
  buildThumbs();
  S.fitMode = 'width';
  afterDocSwitch();
  applyFit();
  viewer.scrollTop = 0;
  sidebar.scrollTop = 0;
  updateCurrent();
  renderTabs();
  viewer.focus();
  if (S.readOnly) status('This PDF is protected: viewing and printing only.', 8000);
}

async function closeTab(i = active) {
  if (!tabs[i]) return;
  if (i !== active) {
    activate(i);
    renderTabs();
  }
  if (!(await confirmDiscard())) return;
  closeSearch();
  pageObserver.disconnect();
  thumbObserver.disconnect();
  thumbQueue.clear();
  curTask?.cancel();
  S.pdf?.destroy();
  pagesDiv.innerHTML = '';
  thumbsDiv.innerHTML = '';
  tabs.splice(active, 1);
  const next = Math.min(active, tabs.length - 1);
  active = -1;
  if (next >= 0) {
    activate(next);
  } else {
    loadIntoS(blankDoc());
    afterDocSwitch();
    refreshRecent();
  }
  renderTabs();
}

const closeCmd = () => closeTab(active);

async function saveAllAndClose() {
  commitEdits();
  for (let i = 0; i < tabs.length; i++) {
    const dirty = i === active ? isDirty() : tabs[i].dirty;
    if (!dirty) continue;
    activate(i);
    renderTabs();
    if (!(await save(false))) return; // cancelled or failed: keep the app open
  }
  api.forceClose();
}

// ---------------------------------------------------------------- save / print
async function save(asNew) {
  if (!guardEdit()) return false;
  commitEdits();
  let p = S.path;
  if (asNew || !p) {
    p = await api.saveDialog(S.path || S.name);
    if (!p) return false;
  }
  try {
    busy('Saving…');
    const bytes = await buildPdf(S.baseBytes, S.model, S.author, getImage);
    await api.writeFile(p, bytes);
    S.path = p;
    S.name = p.split(/[\\/]/).pop();
    S.savedSnap = snapshot();
    updateDirty();
    renderTabs();
    status(`Saved ${S.name}`);
    return true;
  } catch (e) {
    console.error(e);
    api.error(`Could not save the file.\n\n${e?.message || e}`);
    return false;
  } finally {
    busy(null);
  }
}

async function print() {
  if (!S.pdf) return;
  commitEdits();
  try {
    busy('Preparing pages for printing…');
    const bytes = S.readOnly ? S.baseBytes.slice() : await buildPdf(S.baseBytes, S.model, S.author, getImage);
    const doc = await pdfjsLib.getDocument({ data: bytes, ...PDFJS_OPTS }).promise;
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      busy(`Preparing page ${n} of ${doc.numPages}…`);
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 200 / 72 });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print', annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      out.push({ png: new Uint8Array(await blob.arrayBuffer()), w: vp.width, h: vp.height });
      c.width = c.height = 0;
    }
    doc.destroy();
    busy(null);
    const r = await api.printPages(out);
    if (r && !r.ok && r.reason && !/cancel/i.test(r.reason)) status(`Printing failed: ${r.reason}`, 6000);
  } catch (e) {
    console.error(e);
    api.error(`Could not print.\n\n${e?.message || e}`);
  } finally {
    busy(null);
  }
}

// ---------------------------------------------------------------- page DOM & rendering
const pageObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const i = +e.target.dataset.idx;
      if (e.isIntersecting) S.visible.add(i);
      else {
        S.visible.delete(i);
        releasePage(i);
      }
    }
    scheduleRender();
  },
  { root: viewer, rootMargin: '600px 200px' },
);

function buildPagesDOM() {
  pageObserver.disconnect();
  S.visible.clear();
  pagesDiv.innerHTML = '';
  S.pe = S.model.pages.map((_, i) => {
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.idx = i;
    const hl = document.createElement('div');
    hl.className = 'hlLayer';
    const ann = document.createElement('div');
    ann.className = 'annLayer';
    const ink = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ink.setAttribute('class', 'inkLayer');
    el.append(hl, ink, ann);
    pagesDiv.append(el);
    return { el, hl, ink, ann, canvas: null, tlDiv: null, tl: null, key: null };
  });
  S.pe.forEach((_, i) => layoutPage(i));
  S.pe.forEach((p) => pageObserver.observe(p.el));
  $('#pageTotal').textContent = S.model.pages.length;
  $('#gotoTotal').textContent = `/ ${S.model.pages.length}`;
}

function layoutPage(i) {
  const pe = S.pe[i];
  const vp = viewportFor(i);
  pe.el.style.width = `${Math.floor(vp.width)}px`;
  pe.el.style.height = `${Math.floor(vp.height)}px`;
  pe.el.style.setProperty('--scale-factor', S.scale);
  renderAnnots(i);
}

function releasePage(i) {
  const pe = S.pe[i];
  if (!pe || !pe.canvas) return;
  pe.canvas.width = pe.canvas.height = 0;
  pe.canvas.remove();
  pe.tlDiv?.remove();
  pe.canvas = pe.tlDiv = pe.tl = pe.key = null;
}

let renderTimer = null;
let pumping = false;
let pumpAgain = false;
let curTask = null;
function scheduleRender(delay = 20) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(pump, delay);
}
async function pump() {
  if (pumping) {
    pumpAgain = true;
    return;
  }
  pumping = true;
  do {
    pumpAgain = false;
    const order = [...S.visible].sort((a, b) => Math.abs(a - S.current) - Math.abs(b - S.current));
    for (const i of order) {
      if (!S.pe[i] || S.pe[i].key === pageKey(i)) continue;
      try {
        await renderPage(i);
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.error(e);
      }
      if (pumpAgain) break;
    }
  } while (pumpAgain);
  pumping = false;
}
const pageKey = (i) => `${S.scale}|${effRot(i)}`;

async function renderPage(i) {
  const pe = S.pe[i];
  const key = pageKey(i);
  const vp = viewportFor(i);
  const page = S.pdfPages[S.model.pages[i].src];
  const dpr = window.devicePixelRatio || 1;
  let out = dpr;
  const maxPixels = 16_000_000;
  if (vp.width * vp.height * out * out > maxPixels) out = Math.sqrt(maxPixels / (vp.width * vp.height));
  const canvas = document.createElement('canvas');
  canvas.className = 'pc';
  canvas.width = Math.floor(vp.width * out);
  canvas.height = Math.floor(vp.height * out);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  curTask = page.render({
    canvasContext: ctx,
    viewport: vp,
    transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null,
    annotationMode: pdfjsLib.AnnotationMode.ENABLE,
  });
  await curTask.promise;
  curTask = null;
  if (!pe.el.isConnected || S.pe[i] !== pe || pageKey(i) !== key) return;
  if (pe.canvas) {
    pe.canvas.width = pe.canvas.height = 0;
    pe.canvas.replaceWith(canvas);
  } else pe.el.prepend(canvas);
  pe.canvas = canvas;

  // text layer (selection, copy, highlight, search)
  const tc = await getTextContent(S.model.pages[i].src);
  const div = document.createElement('div');
  div.className = 'textLayer';
  const tl = new pdfjsLib.TextLayer({ textContentSource: tc, container: div, viewport: vp });
  await tl.render();
  if (!pe.el.isConnected || pageKey(i) !== key) return;
  if (pe.tlDiv) pe.tlDiv.replaceWith(div);
  else pe.hl.after(div);
  pe.tlDiv = div;
  pe.tl = tl;
  pe.key = key;
  applySearchHighlights(i);
}

async function getTextContent(src) {
  if (!S.textCache.has(src)) S.textCache.set(src, S.pdfPages[src].getTextContent());
  return S.textCache.get(src);
}

async function ensureRendered(i) {
  if (S.pe[i]?.key === pageKey(i)) return;
  try {
    await renderPage(i);
  } catch {}
}

// ---------------------------------------------------------------- annotations display
function renderAnnots(i) {
  const pe = S.pe[i];
  if (!pe) return;
  const vp = viewportFor(i);
  const rot = effRot(i);
  pe.hl.innerHTML = '';
  pe.ann.innerHTML = '';
  let inkSvg = '';
  for (const a of S.model.pages[i].annots) {
    const selected = S.sel && S.sel.page === i && S.sel.id === a.id;
    if (a.type === 'highlight') {
      for (const q of a.quads) {
        const r = quadToScreen(vp, q);
        const d = document.createElement('div');
        d.className = 'hl' + (selected ? ' selected' : '');
        d.dataset.id = a.id;
        Object.assign(d.style, {
          left: `${r.l}px`, top: `${r.t}px`, width: `${r.r - r.l}px`, height: `${r.b - r.t}px`,
          background: rgbCss(a.color),
        });
        pe.hl.append(d);
      }
    } else if (a.type === 'text') {
      pe.ann.append(makeTextEl(i, a, vp, rot, selected));
    } else if (a.type === 'ink') {
      const scr = a.paths.map((p) => inkToScreen(vp, p));
      const col = rgbCss(a.color);
      for (const p of scr) {
        inkSvg += `<path d="${svgPathData(p)}" fill="none" stroke="${col}" stroke-width="${Math.max(0.6, a.width * S.scale)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      if (selected) {
        const [x0, y0, x1, y1] = pathsBBox(scr);
        const pad = (a.width * S.scale) / 2 + 4;
        inkSvg += `<rect class="ink-sel" x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + 2 * pad}" height="${y1 - y0 + 2 * pad}" rx="3"/>`;
      }
    } else if (a.type === 'sig') {
      pe.ann.append(makeSigEl(a, vp, rot, selected));
    } else if (a.type === 'note') {
      const [x, y] = vp.convertToViewportPoint(a.x, a.y);
      const d = document.createElement('div');
      d.className = 'ann-note' + (selected ? ' selected' : '');
      d.dataset.id = a.id;
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      d.innerHTML = NOTE_SVG(a.color);
      d.title = a.contents ? a.contents : 'Empty comment (click to edit)';
      pe.ann.append(d);
    }
  }
  pe.ink.innerHTML = inkSvg;
  if (S.openNote && S.openNote.page === i) showNotePopup(i);
}

function inkToScreen(vp, p) {
  const out = new Array(p.length);
  for (let k = 0; k < p.length; k += 2) {
    const [x, y] = vp.convertToViewportPoint(p[k], p[k + 1]);
    out[k] = x;
    out[k + 1] = y;
  }
  return out;
}

/** The drawing under a screen point on page i (or null). */
function hitInk(i, x, y, slop = 5) {
  const vp = viewportFor(i);
  const list = S.model.pages[i].annots;
  for (let k = list.length - 1; k >= 0; k--) {
    const a = list[k];
    if (a.type !== 'ink') continue;
    const tol = (a.width * S.scale) / 2 + slop;
    if (a.paths.some((p) => distToPath(inkToScreen(vp, p), x, y) <= tol)) return a;
  }
  return null;
}

function quadToScreen(vp, q) {
  const pts = [
    vp.convertToViewportPoint(q[0], q[1]), vp.convertToViewportPoint(q[2], q[3]),
    vp.convertToViewportPoint(q[4], q[5]), vp.convertToViewportPoint(q[6], q[7]),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}

function makeTextEl(i, a, vp, rot, selected) {
  const [x, y] = vp.convertToViewportPoint(a.x, a.y);
  const wrap = document.createElement('div');
  wrap.className = 'ann-text' + (selected ? ' selected' : '');
  wrap.dataset.id = a.id;
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  const d = (rot - a.rot + 360) % 360;
  if (d) wrap.style.transform = `rotate(${d}deg)`;
  const tb = document.createElement('div');
  tb.className = 'tb';
  Object.assign(tb.style, {
    width: `${a.w * S.scale}px`,
    minHeight: `${a.h * S.scale}px`,
    fontSize: `${a.size * S.scale}px`,
    fontFamily: fontOf(a).css,
    padding: `${TEXT_PAD * S.scale}px`,
    color: rgbCss(a.color),
    lineHeight: LINE_FACTOR,
  });
  tb.textContent = a.text;
  const rs = document.createElement('div');
  rs.className = 'rs';
  rs.title = 'Drag to change width';
  wrap.append(tb, rs);
  return wrap;
}

function makeSigEl(a, vp, rot, selected) {
  const [x, y] = vp.convertToViewportPoint(a.x, a.y);
  const wrap = document.createElement('div');
  wrap.className = 'ann-sig' + (selected ? ' selected' : '');
  wrap.dataset.id = a.id;
  wrap.title = 'Signature: drag to move, drag the corner to resize, Delete to remove';
  Object.assign(wrap.style, { left: `${x}px`, top: `${y}px`, width: `${a.w * S.scale}px`, height: `${a.h * S.scale}px` });
  const d = (rot - a.rot + 360) % 360;
  if (d) wrap.style.transform = `rotate(${d}deg)`;
  const img = document.createElement('img');
  img.src = getImage(a.imgId) || '';
  img.draggable = false;
  const rs = document.createElement('div');
  rs.className = 'rs-sig';
  rs.title = 'Drag to resize';
  wrap.append(img, rs);
  return wrap;
}

function renderAllAnnots() {
  S.pe.forEach((_, i) => renderAnnots(i));
}

function select(page, id) {
  const prev = S.sel;
  S.sel = id ? { page, id } : null;
  if (prev) renderAnnots(prev.page);
  if (S.sel && (!prev || prev.page !== page)) renderAnnots(page);
}

// ---------------------------------------------------------------- text box editing
function startEdit(i, id, isNew = false) {
  commitEdits();
  S.sel = { page: i, id };
  renderAnnots(i);
  const wrap = S.pe[i].ann.querySelector(`.ann-text[data-id="${id}"]`);
  if (!wrap) return;
  const tb = wrap.querySelector('.tb');
  wrap.classList.add('editing');
  tb.contentEditable = 'plaintext-only';
  S.editing = { page: i, id, before: snapshot(), isNew, el: tb };
  tb.focus();
  const r = document.createRange();
  r.selectNodeContents(tb);
  r.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  tb.addEventListener('blur', () => commitEdits(), { once: true });
}

function commitEdits() {
  commitTextEdit();
  closeNotePopup();
}

function commitTextEdit() {
  const ed = S.editing;
  if (!ed) return;
  S.editing = null;
  const a = findAnnot(ed.page, ed.id);
  if (!a) return;
  const text = ed.el.innerText.replace(/\n$/, '');
  const h = ed.el.offsetHeight / S.scale;
  if (!text.trim()) {
    const mp = S.model.pages[ed.page];
    mp.annots = mp.annots.filter((x) => x.id !== a.id);
    if (!ed.isNew) pushUndo(ed.before);
    S.sel = null;
  } else if (text !== a.text || ed.isNew || Math.abs(h - a.h) > 0.5) {
    pushUndo(ed.before);
    a.text = text;
    a.h = Math.max(h, a.size * LINE_FACTOR + 2 * TEXT_PAD);
  }
  renderAnnots(ed.page);
  changed([ed.page]);
}

// ---------------------------------------------------------------- notes
function showNotePopup(i) {
  const on = S.openNote;
  const a = findAnnot(i, on.id);
  if (!a) {
    S.openNote = null;
    return;
  }
  const pe = S.pe[i];
  const vp = viewportFor(i);
  const [x, y] = vp.convertToViewportPoint(a.x, a.y);
  const pop = document.createElement('div');
  pop.className = 'note-pop';
  const left = Math.min(Math.max(4, x + 16), vp.width - 248);
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(4, Math.min(y - 10, vp.height - 150))}px`;
  pop.innerHTML = `<div class="nh"><span></span><span><button class="del" title="Delete comment">🗑</button><button class="cls" title="Close">✕</button></span></div><textarea placeholder="Type your comment…"></textarea>`;
  pop.querySelector('.nh span').textContent = S.author;
  const ta = pop.querySelector('textarea');
  ta.value = a.contents || '';
  pop.querySelector('.cls').onclick = () => closeNotePopup();
  pop.querySelector('.del').onclick = () => {
    S.openNote = null;
    deleteAnnot(i, a.id, on.isNew ? on.before : undefined);
  };
  pop.addEventListener('mousedown', (e) => e.stopPropagation());
  on.ta = ta;
  pe.ann.append(pop);
  setTimeout(() => ta.focus(), 0);
}

function openNotePopup(i, id, isNew = false) {
  commitEdits();
  S.openNote = { page: i, id, before: snapshot(), isNew };
  S.sel = { page: i, id };
  renderAnnots(i);
}

function closeNotePopup() {
  const on = S.openNote;
  if (!on) return;
  S.openNote = null;
  const a = findAnnot(on.page, on.id);
  if (a && on.ta) {
    const v = on.ta.value;
    if (v !== (a.contents || '') || on.isNew) {
      pushUndo(on.before);
      a.contents = v;
    }
  }
  renderAnnots(on.page);
  changed([on.page]);
}

// ---------------------------------------------------------------- annotation commands
function deleteAnnot(page = S.sel?.page, id = S.sel?.id, undoSnap) {
  if (page == null || !id || !guardEdit()) return;
  if (S.editing?.id === id) {
    S.editing = null;
  }
  if (S.openNote?.id === id) S.openNote = null;
  pushUndo(undoSnap ?? snapshot());
  const mp = S.model.pages[page];
  mp.annots = mp.annots.filter((a) => a.id !== id);
  S.sel = null;
  renderAnnots(page);
  changed([page]);
}

function addAnnot(page, a) {
  S.model.pages[page].annots.push(a);
}

// Merge selection rectangles into one rectangle per line (works for rotated text too).
function mergeRects(rects) {
  let list = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a];
        const B = list[b];
        const ov = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);
        const hA = A.b - A.t, hB = B.b - B.t, wA = A.r - A.l, wB = B.r - B.l;
        const vOv = ov(A.t, A.b, B.t, B.b);
        const hOv = ov(A.l, A.r, B.l, B.r);
        const sameRow = vOv > 0.5 * Math.min(hA, hB) && hOv > -0.6 * Math.min(hA, hB);
        const sameCol = hOv > 0.5 * Math.min(wA, wB) && vOv > -0.6 * Math.min(wA, wB) && Math.max(hA, hB) > 2 * Math.max(wA, wB);
        if (sameRow || sameCol) {
          list[a] = { l: Math.min(A.l, B.l), t: Math.min(A.t, B.t), r: Math.max(A.r, B.r), b: Math.max(A.b, B.b) };
          list.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return list;
}

function rectToQuad(vp, r) {
  const ul = vp.convertToPdfPoint(r.l, r.t);
  const ur = vp.convertToPdfPoint(r.r, r.t);
  const ll = vp.convertToPdfPoint(r.l, r.b);
  const lr = vp.convertToPdfPoint(r.r, r.b);
  return [...ul, ...ur, ...ll, ...lr].map((v) => Math.round(v * 100) / 100);
}

function highlightSelection() {
  if (!guardEdit()) return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
  if (!rects.length) return false;
  const hs = rects.map((r) => r.height).sort((a, b) => a - b);
  const med = hs[Math.floor(hs.length / 2)];
  const ws = rects.map((r) => r.width).sort((a, b) => a - b);
  const medW = ws[Math.floor(ws.length / 2)];
  const byPage = new Map();
  for (const r of rects) {
    // Skip giant container boxes that sometimes appear when a selection spans elements.
    if (r.height > 3.5 * med && r.width > 3.5 * medW) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const i = S.pe.findIndex((pe) => {
      const b = pe.el.getBoundingClientRect();
      return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    });
    if (i < 0) continue;
    const b = S.pe[i].el.getBoundingClientRect();
    if (!byPage.has(i)) byPage.set(i, []);
    byPage.get(i).push({ l: r.left - b.left, t: r.top - b.top, r: r.right - b.left, b: r.bottom - b.top });
  }
  if (!byPage.size) return false;
  pushUndo();
  const color = HIGHLIGHT_COLORS[S.hlColor];
  for (const [i, list] of byPage) {
    const vp = viewportFor(i);
    const quads = mergeRects(list).map((r) => rectToQuad(vp, r));
    addAnnot(i, { id: newId(), type: 'highlight', quads, color: [...color], contents: '' });
    renderAnnots(i);
  }
  sel.removeAllRanges();
  changed([...byPage.keys()]);
  return true;
}

function hitHighlight(i, x, y) {
  const vp = viewportFor(i);
  const list = S.model.pages[i].annots;
  for (let k = list.length - 1; k >= 0; k--) {
    const a = list[k];
    if (a.type !== 'highlight') continue;
    for (const q of a.quads) {
      const r = quadToScreen(vp, q);
      if (x >= r.l - 1 && x <= r.r + 1 && y >= r.t - 1 && y <= r.b + 1) return a;
    }
  }
  return null;
}

// ---------------------------------------------------------------- page interaction
function pageFromEvent(e) {
  const el = e.target.closest?.('.page');
  if (!el) return null;
  const i = +el.dataset.idx;
  const b = el.getBoundingClientRect();
  return { i, el, x: e.clientX - b.left, y: e.clientY - b.top };
}

let down = null; // mouse down info for click / drag detection
let band = null;

pagesDiv.addEventListener('mousedown', (e) => {
  hideMenus();
  if (e.button !== 0) return;
  const hit = pageFromEvent(e);
  if (!hit) return;
  const { i, x, y } = hit;

  // Placing a signature: click where it should go.
  if (S.tool === 'sign' && placingSig) {
    e.preventDefault();
    placeSignature(i, x, y);
    return;
  }

  if (S.tool === 'draw') {
    if (!guardEdit()) return;
    e.preventDefault();
    commitEdits();
    if (S.erasing) startErase(i);
    else startStroke(i, x, y);
    return;
  }

  // Clicks on existing text boxes / notes / signatures.
  const textEl = e.target.closest('.ann-text');
  const noteEl = e.target.closest('.ann-note');
  const sigEl = e.target.closest('.ann-sig');
  if (sigEl) {
    e.preventDefault();
    const id = sigEl.dataset.id;
    commitEdits();
    select(i, id);
    if (e.target.classList.contains('rs-sig')) return startSigResize(e, i, id, sigEl);
    return startMove(e, i, id, sigEl);
  }
  if (textEl) {
    const id = textEl.dataset.id;
    if (S.editing?.id === id) return; // clicking inside the box being edited
    e.preventDefault();
    if (e.target.classList.contains('rs')) return startResize(e, i, id, textEl);
    if (S.tool === 'text') return startEdit(i, id);
    commitEdits();
    select(i, id);
    return startMove(e, i, id, textEl);
  }
  if (noteEl) {
    e.preventDefault();
    const id = noteEl.dataset.id;
    commitEdits();
    select(i, id);
    return startMove(e, i, id, noteEl, true);
  }

  const hadEdit = !!(S.editing || S.openNote);
  if (hadEdit) {
    e.preventDefault();
    commitEdits();
    if (S.tool === 'text' || S.tool === 'note') return;
  }

  if (S.tool === 'text') {
    if (!guardEdit()) return;
    e.preventDefault();
    const vp = viewportFor(i);
    const [px, py] = vp.convertToPdfPoint(x, y - (S.textSize * LINE_FACTOR * S.scale) / 2);
    const avail = (vp.width - x) / S.scale - 6;
    const w = Math.max(60, Math.min(220, avail));
    const a = {
      id: newId(), type: 'text', x: px, y: py, w, h: S.textSize * LINE_FACTOR + 2 * TEXT_PAD,
      rot: effRot(i), text: '', size: S.textSize, font: S.textFont, color: [...TEXT_COLORS[S.textColor]],
    };
    const before = snapshot();
    addAnnot(i, a);
    startEdit(i, a.id, true);
    S.editing.before = before;
    return;
  }
  if (S.tool === 'note') {
    if (!guardEdit()) return;
    e.preventDefault();
    const vp = viewportFor(i);
    const [px, py] = vp.convertToPdfPoint(x, y);
    const before = snapshot();
    const a = { id: newId(), type: 'note', x: px, y: py, contents: '', color: [...NOTE_COLOR] };
    addAnnot(i, a);
    openNotePopup(i, a.id, true);
    S.openNote.before = before;
    return;
  }

  down = { i, x, y, cx: e.clientX, cy: e.clientY, onText: !!e.target.closest('.textLayer span') };
  if (S.tool === 'highlight' && !down.onText) {
    // Area highlight (useful for scanned pages): drag a rectangle.
    e.preventDefault();
    band = document.createElement('div');
    band.className = 'hl';
    Object.assign(band.style, { background: rgbCss(HIGHLIGHT_COLORS[S.hlColor], 0.6), left: `${x}px`, top: `${y}px` });
    S.pe[i].hl.append(band);
  }
});

window.addEventListener('mousemove', (e) => {
  if (band && down) {
    const b = S.pe[down.i].el.getBoundingClientRect();
    const x = Math.max(0, Math.min(b.width, e.clientX - b.left));
    const y = Math.max(0, Math.min(b.height, e.clientY - b.top));
    Object.assign(band.style, {
      left: `${Math.min(x, down.x)}px`, top: `${Math.min(y, down.y)}px`,
      width: `${Math.abs(x - down.x)}px`, height: `${Math.abs(y - down.y)}px`,
    });
  }
});

window.addEventListener('mouseup', (e) => {
  if (!down) return;
  const d = down;
  down = null;
  const moved = Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 4;
  if (band) {
    const r = { l: band.offsetLeft, t: band.offsetTop, r: band.offsetLeft + band.offsetWidth, b: band.offsetTop + band.offsetHeight };
    band.remove();
    band = null;
    if (moved && r.r - r.l > 3 && r.b - r.t > 3 && guardEdit()) {
      pushUndo();
      addAnnot(d.i, { id: newId(), type: 'highlight', quads: [rectToQuad(viewportFor(d.i), r)], color: [...HIGHLIGHT_COLORS[S.hlColor]], contents: '' });
      renderAnnots(d.i);
      changed([d.i]);
      return;
    }
  }
  if (S.tool === 'highlight') {
    if (highlightSelection()) return;
  }
  if (!moved) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const a = hitInk(d.i, d.x, d.y) || hitHighlight(d.i, d.x, d.y);
    select(d.i, a ? a.id : null);
  }
});

pagesDiv.addEventListener('dblclick', (e) => {
  const textEl = e.target.closest('.ann-text');
  if (textEl) {
    const hit = pageFromEvent(e);
    startEdit(hit.i, textEl.dataset.id);
  }
});

function startMove(e, i, id, el, isNote = false) {
  if (S.readOnly) return;
  const sx = e.clientX;
  const sy = e.clientY;
  const ox = parseFloat(el.style.left);
  const oy = parseFloat(el.style.top);
  let movedFar = false;
  const before = snapshot();
  const mm = (ev) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!movedFar && Math.hypot(dx, dy) < 3) return;
    movedFar = true;
    el.style.left = `${ox + dx}px`;
    el.style.top = `${oy + dy}px`;
  };
  const mu = () => {
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    if (!movedFar) {
      if (isNote) openNotePopup(i, id);
      return;
    }
    const a = findAnnot(i, id);
    const vp = viewportFor(i);
    const [px, py] = vp.convertToPdfPoint(parseFloat(el.style.left), parseFloat(el.style.top));
    pushUndo(before);
    a.x = px;
    a.y = py;
    renderAnnots(i);
    changed([i]);
  };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
}

function startResize(e, i, id, wrap) {
  if (S.readOnly) return;
  const a = findAnnot(i, id);
  const tb = wrap.querySelector('.tb');
  const sx = e.clientX;
  const sy = e.clientY;
  const deg = (effRot(i) - a.rot + 360) % 360;
  const ux = Math.round(Math.cos((deg * Math.PI) / 180));
  const uy = Math.round(Math.sin((deg * Math.PI) / 180));
  const w0 = a.w;
  const before = S.editing ? S.editing.before : snapshot();
  const mm = (ev) => {
    const proj = (ev.clientX - sx) * ux + (ev.clientY - sy) * uy;
    const w = Math.max(30, w0 + proj / S.scale);
    tb.style.width = `${w * S.scale}px`;
  };
  const mu = () => {
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    const w = parseFloat(tb.style.width) / S.scale;
    if (Math.abs(w - w0) < 0.5) return;
    if (S.editing?.id === id) {
      a.w = w;
      return; // committed with the edit
    }
    pushUndo(before);
    a.w = w;
    tb.style.minHeight = '0px';
    a.h = Math.max(tb.offsetHeight / S.scale, a.size * LINE_FACTOR + 2 * TEXT_PAD);
    renderAnnots(i);
    changed([i]);
  };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
}

// ---------------------------------------------------------------- context menu
const ctxMenu = $('#ctxMenu');
function showMenu(x, y, items) {
  ctxMenu.innerHTML = '';
  for (const it of items) {
    if (it === '-') {
      ctxMenu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
      continue;
    }
    if (it.el) {
      ctxMenu.append(it.el);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'mi' + (it.danger ? ' danger' : '');
    b.innerHTML = `<span></span><small>${it.key || ''}</small>`;
    b.firstChild.textContent = it.label;
    b.onclick = () => {
      hideMenus();
      it.run();
    };
    ctxMenu.append(b);
  }
  ctxMenu.hidden = false;
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.min(x, innerWidth - r.width - 4)}px`;
  ctxMenu.style.top = `${Math.min(y, innerHeight - r.height - 4)}px`;
}
function hideMenus() {
  ctxMenu.hidden = true;
  $('#recentMenu').classList.remove('open');
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.menu') && !e.target.closest('[data-cmd=recentMenu]')) hideMenus();
});

pagesDiv.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const hit = pageFromEvent(e);
  if (!hit) return;
  const { i, x, y } = hit;
  const items = [];
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) {
    const text = sel.toString();
    items.push({ label: 'Highlight selection', run: () => highlightSelection() });
    items.push({ label: 'Copy', key: 'Ctrl+C', run: () => navigator.clipboard.writeText(text) });
    items.push('-');
  }
  const annEl = e.target.closest('.ann-text, .ann-note, .ann-sig');
  const hl = annEl ? null : hitInk(i, x, y) || hitHighlight(i, x, y);
  const id = annEl?.dataset.id || hl?.id;
  if (id) {
    select(i, id);
    const a = findAnnot(i, id);
    if (a.type === 'text') {
      items.push({ label: 'Edit text', run: () => startEdit(i, id) });
      items.push({ el: textFormatPanel(i, id) });
    }
    if (a.type === 'note') items.push({ label: 'Open comment', run: () => openNotePopup(i, id) });
    if (a.type === 'highlight') {
      for (const [name, c] of Object.entries(HIGHLIGHT_COLORS)) {
        items.push({ label: `Color: ${name}`, run: () => recolor(i, id, c) });
      }
    }
    items.push({ label: 'Remove', key: 'Del', danger: true, run: () => deleteAnnot(i, id) });
    items.push('-');
  }
  items.push({ label: 'Rotate page left', run: () => rotatePages(-90, [i]) });
  items.push({ label: 'Rotate page right', run: () => rotatePages(90, [i]) });
  items.push({ label: 'Delete page', danger: true, run: () => deletePages([i]) });
  showMenu(e.clientX, e.clientY, items);
});

// Font, size and color controls shown in the right-click menu of a text box.
function textFormatPanel(i, id) {
  const a = findAnnot(i, id);
  const panel = document.createElement('div');
  panel.className = 'fmt-panel';
  panel.innerHTML = `
    <div class="fmt-row"><label>Font</label><select class="fmt-font"></select></div>
    <div class="fmt-row"><label>Size</label><select class="fmt-size"></select>
      <button class="fmt-step" data-d="-1" title="Smaller">A&#8722;</button><button class="fmt-step" data-d="1" title="Bigger">A+</button></div>
    <div class="fmt-row"><label>Color</label><div class="fmt-colors"></div></div>`;
  const fontSel = panel.querySelector('.fmt-font');
  for (const [key, f] of Object.entries(TEXT_FONTS)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = f.label;
    o.style.fontFamily = f.css;
    fontSel.append(o);
  }
  const sizeSel = panel.querySelector('.fmt-size');
  const fillSizes = (cur) => {
    sizeSel.innerHTML = '';
    const sizes = [...new Set([...TEXT_SIZES, cur])].sort((x, y) => x - y);
    for (const n of sizes) sizeSel.add(new Option(String(n), String(n)));
    sizeSel.value = String(cur);
  };
  const colors = panel.querySelector('.fmt-colors');
  const same = (c1, c2) => c1.every((v, k) => Math.abs(v - c2[k]) < 0.01);
  const sync = () => {
    const cur = findAnnot(i, id);
    if (!cur) return;
    fontSel.value = cur.font in TEXT_FONTS ? cur.font : 'helv';
    fillSizes(cur.size);
    colors.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', same(b._c, cur.color)));
  };
  for (const [name, c] of Object.entries(MENU_TEXT_COLORS)) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = name[0].toUpperCase() + name.slice(1);
    b.style.background = rgbCss(c);
    b._c = c;
    b.onclick = () => {
      setTextProps(i, id, { color: [...c] });
      sync();
    };
    colors.append(b);
  }
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.title = 'More colors';
  custom.className = 'fmt-custom';
  const toHex = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  custom.value = toHex(a.color);
  custom.onchange = () => {
    const h = custom.value;
    const c = [1, 3, 5].map((k) => Math.round((parseInt(h.slice(k, k + 2), 16) / 255) * 1000) / 1000);
    setTextProps(i, id, { color: c });
    sync();
  };
  colors.append(custom);
  fontSel.onchange = () => {
    setTextProps(i, id, { font: fontSel.value });
    sync();
  };
  sizeSel.onchange = () => {
    setTextProps(i, id, { size: +sizeSel.value });
    sync();
  };
  panel.querySelectorAll('.fmt-step').forEach((b) => {
    b.onclick = () => {
      const cur = findAnnot(i, id);
      const d = +b.dataset.d;
      const next = d > 0 ? TEXT_SIZES.find((n) => n > cur.size) ?? cur.size + 4 : [...TEXT_SIZES].reverse().find((n) => n < cur.size) ?? Math.max(4, cur.size - 1);
      setTextProps(i, id, { size: next });
      sync();
    };
  });
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  sync();
  return panel;
}

function recolor(i, id, c) {
  const a = findAnnot(i, id);
  if (!a || !guardEdit()) return;
  pushUndo();
  a.color = [...c];
  renderAnnots(i);
  changed([i]);
}

// ---------------------------------------------------------------- drawing (ink)
function buildPenControls() {
  for (const box of $$('.pen-colors')) {
    for (const [name, c] of Object.entries(PEN_COLORS)) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.pen = name;
      b.style.background = rgbCss(c);
      b.title = name[0].toUpperCase() + name.slice(1);
      b.dataset.needsDoc = '1';
      b.onclick = () => setPen({ color: name });
      box.append(b);
    }
  }
  for (const box of $$('.pen-widths')) {
    for (const w of PEN_WIDTHS) {
      const b = document.createElement('button');
      b.className = 'pen-w';
      b.dataset.w = w.key;
      b.title = w.label;
      b.dataset.needsDoc = '1';
      b.innerHTML = `<span style="height:${Math.min(8, Math.max(1.5, w.w * 1.3))}px"></span>`;
      b.onclick = () => setPen({ width: w.key });
      box.append(b);
    }
  }
  $$('.pen-eraser').forEach((b) => (b.onclick = () => {
    if (!S.pdf) return;
    if (S.tool !== 'draw') setTool('draw');
    setErasing(!S.erasing);
  }));
  $('#penBar .pb-done').onclick = () => setTool('select');
  try {
    const saved = JSON.parse(localStorage.getItem('pdfacil.pen') || '{}');
    if (PEN_COLORS[saved.color]) S.penColor = saved.color;
    if (PEN_WIDTHS.some((w) => w.key === saved.width)) S.penWidth = saved.width;
  } catch {}
  syncPenUI();
}

function syncPenUI() {
  $$('.pen-colors .swatch').forEach((b) => b.classList.toggle('active', !S.erasing && b.dataset.pen === S.penColor));
  $$('.pen-w').forEach((b) => b.classList.toggle('active', !S.erasing && b.dataset.w === S.penWidth));
  $$('.pen-eraser').forEach((b) => b.classList.toggle('active', S.erasing));
  $$('.pen-w span').forEach((sp) => (sp.style.background = rgbCss(PEN_COLORS[S.penColor])));
}

function setPen({ color, width }) {
  if (color) S.penColor = color;
  if (width) S.penWidth = width;
  try {
    localStorage.setItem('pdfacil.pen', JSON.stringify({ color: S.penColor, width: S.penWidth }));
  } catch {}
  setErasing(false);
  if (S.pdf && S.tool !== 'draw') setTool('draw');
  syncPenUI();
}

function setErasing(v) {
  S.erasing = !!v;
  document.body.classList.toggle('erasing', S.erasing);
  syncPenUI();
}

const penWidthPt = () => PEN_WIDTHS.find((w) => w.key === S.penWidth).w;

function startStroke(i, x, y) {
  const pe = S.pe[i];
  const pts = [x, y];
  const col = rgbCss(PEN_COLORS[S.penColor]);
  const live = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  live.setAttribute('fill', 'none');
  live.setAttribute('stroke', col);
  live.setAttribute('stroke-width', String(Math.max(0.6, penWidthPt() * S.scale)));
  live.setAttribute('stroke-linecap', 'round');
  live.setAttribute('stroke-linejoin', 'round');
  live.setAttribute('d', svgPathData(pts));
  pe.ink.append(live);
  const box = pe.el.getBoundingClientRect();
  const mm = (ev) => {
    const nx = ev.clientX - box.left;
    const ny = ev.clientY - box.top;
    const lx = pts[pts.length - 2];
    const ly = pts[pts.length - 1];
    if (Math.hypot(nx - lx, ny - ly) < 1.2) return;
    pts.push(nx, ny);
    live.setAttribute('d', svgPathData(pts));
  };
  const mu = () => {
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    live.remove();
    const vp = viewportFor(i);
    const pdfPts = [];
    for (let k = 0; k < pts.length; k += 2) {
      const [px, py] = vp.convertToPdfPoint(pts[k], pts[k + 1]);
      pdfPts.push(Math.round(px * 100) / 100, Math.round(py * 100) / 100);
    }
    const path = simplify(pdfPts, 0.3);
    pushUndo();
    addAnnot(i, { id: newId(), type: 'ink', paths: [path], color: [...PEN_COLORS[S.penColor]], width: penWidthPt() });
    renderAnnots(i);
    changed([i]);
  };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
}

function startErase(i) {
  const before = snapshot();
  let erased = false;
  const touched = new Set();
  const eraseAt = (ev) => {
    // The eraser works on whichever page is under the mouse.
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.page');
    if (!el) return;
    const pi = +el.dataset.idx;
    const b = el.getBoundingClientRect();
    const a = hitInk(pi, ev.clientX - b.left, ev.clientY - b.top, 8);
    if (!a) return;
    const mp = S.model.pages[pi];
    mp.annots = mp.annots.filter((x) => x !== a);
    if (S.sel?.id === a.id) S.sel = null;
    erased = true;
    touched.add(pi);
    renderAnnots(pi);
  };
  const mu = () => {
    window.removeEventListener('mousemove', eraseAt);
    window.removeEventListener('mouseup', mu);
    if (erased) {
      pushUndo(before);
      changed([...touched]);
    }
  };
  window.addEventListener('mousemove', eraseAt);
  window.addEventListener('mouseup', mu);
  // erase what is right under the first click too
  eraseAt(window.__lastMouse || { clientX: -1, clientY: -1 });
}
window.addEventListener('mousedown', (e) => (window.__lastMouse = e), true);

// ---------------------------------------------------------------- signatures
const sigGhost = $('#sigGhost');
let placingSig = null; // { imgId, w, h } in points while choosing where to put it

const SIG_DEFAULT_W = 150; // points (about 5.3 cm)

function openSignMenu() {
  if (!guardEdit()) return;
  commitEdits();
  const saved = loadSavedSignatures();
  const btn = $('.panel.active [data-cmd=sign]') || $('[data-cmd=sign]');
  const r = btn.getBoundingClientRect();
  if (!saved.length) {
    newSignature();
    return;
  }
  const items = [];
  const title = document.createElement('div');
  title.className = 'sig-menu-title';
  title.textContent = 'Choose a signature, then click on the page';
  items.push({ el: title });
  for (const sig of saved) {
    const row = document.createElement('div');
    row.className = 'sig-choice';
    row.innerHTML = '<button class="use" title="Use this signature"><img alt="signature"></button><button class="del" title="Forget this signature">✕</button>';
    row.querySelector('img').src = sig.dataUrl;
    row.querySelector('.use').onclick = () => {
      hideMenus();
      startPlacing(sig);
    };
    row.querySelector('.del').onclick = () => {
      deleteSavedSignature(sig.id);
      row.remove();
      if (!loadSavedSignatures().length) hideMenus();
    };
    items.push({ el: row });
  }
  items.push('-');
  items.push({ label: 'Create a new signature…', run: () => newSignature() });
  showMenu(r.left, r.bottom + 4, items);
}

async function newSignature() {
  const sig = await createSignatureDialog();
  if (sig) startPlacing(sig);
}

function startPlacing(sig) {
  const w = SIG_DEFAULT_W;
  const h = (w * sig.h) / sig.w;
  placingSig = { imgId: registerImage(sig.dataUrl), w, h };
  setTool('sign');
  $$('[data-cmd=sign]').forEach((b) => b.classList.add('active'));
  sigGhost.querySelector('img').src = sig.dataUrl;
}

function placeSignature(i, x, y) {
  const p = placingSig;
  const vp = viewportFor(i);
  // Center the signature on the click, but keep it on the page.
  const wPx = p.w * S.scale;
  const hPx = p.h * S.scale;
  const left = Math.max(0, Math.min(vp.width - wPx, x - wPx / 2));
  const top = Math.max(0, Math.min(vp.height - hPx, y - hPx / 2));
  const [px, py] = vp.convertToPdfPoint(left, top);
  pushUndo();
  const a = { id: newId(), type: 'sig', x: px, y: py, w: p.w, h: p.h, rot: effRot(i), imgId: p.imgId };
  addAnnot(i, a);
  setTool('select');
  S.sel = { page: i, id: a.id };
  renderAnnots(i);
  changed([i]);
  status('Signature added. Drag to move it, drag its corner to resize, or press Delete to remove it.', 6000);
}

// The see-through preview that follows the mouse while placing.
window.addEventListener('mousemove', (e) => {
  if (!placingSig || S.tool !== 'sign') return;
  const over = e.target.closest?.('.page');
  sigGhost.hidden = !over;
  if (!over) return;
  const wPx = placingSig.w * S.scale;
  const hPx = placingSig.h * S.scale;
  Object.assign(sigGhost.style, { left: `${e.clientX - wPx / 2}px`, top: `${e.clientY - hPx / 2}px`, width: `${wPx}px`, height: `${hPx}px` });
});

function startSigResize(e, i, id, el) {
  if (S.readOnly) return;
  const a = findAnnot(i, id);
  const sx = e.clientX;
  const sy = e.clientY;
  const deg = (effRot(i) - a.rot + 360) % 360;
  const ux = Math.round(Math.cos((deg * Math.PI) / 180));
  const uy = Math.round(Math.sin((deg * Math.PI) / 180));
  const w0 = a.w;
  const ratio = a.h / a.w;
  const before = snapshot();
  let w = w0;
  const mm = (ev) => {
    // Use the drag along the signature's own horizontal direction; keep the proportions.
    const proj = (ev.clientX - sx) * ux + (ev.clientY - sy) * uy;
    w = Math.max(20, w0 + proj / S.scale);
    el.style.width = `${w * S.scale}px`;
    el.style.height = `${w * ratio * S.scale}px`;
  };
  const mu = () => {
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
    if (Math.abs(w - w0) < 0.5) return;
    pushUndo(before);
    a.w = w;
    a.h = w * ratio;
    renderAnnots(i);
    changed([i]);
  };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
}

// ---------------------------------------------------------------- scrolling / current page
function updateCurrent() {
  if (!S.pe.length) return;
  const mid = viewer.scrollTop + viewer.clientHeight * 0.35;
  let cur = S.pe.length - 1;
  for (let i = 0; i < S.pe.length; i++) {
    const el = S.pe[i].el;
    if (el.offsetTop + el.offsetHeight + 7 > mid) {
      cur = i;
      break;
    }
  }
  if (cur !== S.current || $('#pageInput').value !== String(cur + 1)) {
    S.current = cur;
    if (document.activeElement !== $('#pageInput')) $('#pageInput').value = cur + 1;
    if (document.activeElement !== $('#gotoInput')) $('#gotoInput').value = cur + 1;
    if (S.selPages.size <= 1) S.selPages = new Set([cur]);
    updateThumbClasses(true);
  }
}
viewer.addEventListener('scroll', () => {
  updateCurrent();
  highlightOutline();
});

function goToPage(i, smooth = false) {
  if (!S.pe.length) return;
  i = Math.max(0, Math.min(S.pe.length - 1, i));
  viewer.scrollTo({ top: S.pe[i].el.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' });
  S.selPages = new Set([i]);
  updateCurrent();
  updateThumbClasses(true);
}

function bindGoto(input) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(input.value, 10);
      if (n >= 1 && n <= S.pe.length) {
        goToPage(n - 1);
        viewer.focus();
      } else {
        status(`Enter a page number between 1 and ${S.pe.length}`);
        input.select();
      }
    } else if (e.key === 'Escape') {
      input.value = S.current + 1;
      viewer.focus();
    }
  });
  input.addEventListener('focus', () => input.select());
}
bindGoto($('#pageInput'));
bindGoto($('#gotoInput'));

// ---------------------------------------------------------------- zoom
function updateZoomUI() {
  const pct = Math.round(S.scale * 100);
  $('#zoomLabel').textContent = `${pct}%`;
  $('#zoomSlider').value = pct;
}

function setScale(newScale, anchor) {
  if (!S.pe.length) return;
  newScale = Math.max(0.1, Math.min(5, newScale));
  if (Math.abs(newScale - S.scale) < 0.001) return;
  commitEdits();
  const vb = viewer.getBoundingClientRect();
  const ax = anchor ? anchor.x - vb.left : viewer.clientWidth / 2;
  const ay = anchor ? anchor.y - vb.top : viewer.clientHeight / 2;
  // Remember which point of which page sits under the anchor.
  const docY = viewer.scrollTop + ay;
  const docX = viewer.scrollLeft + ax;
  let pi = S.pe.findIndex((p) => p.el.offsetTop + p.el.offsetHeight + 7 > docY);
  if (pi < 0) pi = S.pe.length - 1;
  const el = S.pe[pi].el;
  const fy = (docY - el.offsetTop) / el.offsetHeight;
  const fx = (docX - el.offsetLeft) / el.offsetWidth;

  S.scale = newScale;
  curTask?.cancel();
  S.pe.forEach((_, i) => layoutPage(i));
  viewer.scrollTop = el.offsetTop + fy * el.offsetHeight - ay;
  viewer.scrollLeft = el.offsetLeft + fx * el.offsetWidth - ax;
  updateZoomUI();
  scheduleRender(120);
  updateCurrent();
}

function zoomStep(dir, anchor) {
  S.fitMode = null;
  const steps = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const cur = S.scale;
  const next = dir > 0 ? steps.find((s) => s > cur + 0.005) ?? 5 : [...steps].reverse().find((s) => s < cur - 0.005) ?? 0.1;
  setScale(next, anchor);
}

function applyFit() {
  if (!S.pe.length || !S.fitMode) return;
  const availW = viewer.clientWidth - 48;
  const availH = viewer.clientHeight - 32;
  let s;
  if (S.fitMode === 'page') {
    const vp1 = viewportFor(S.current, 1);
    s = Math.min(availW / vp1.width, availH / vp1.height);
  } else {
    // Fit width uses the widest page so the zoom level stays steady while scrolling.
    const maxW = Math.max(...S.model.pages.map((_, i) => viewportFor(i, 1).width));
    s = availW / maxW;
  }
  const cur = S.current;
  setScale(s);
  updateZoomUI();
  if (S.fitMode === 'page') goToPage(cur);
}

viewer.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || !S.pdf) return;
    e.preventDefault();
    S.fitMode = null;
    const factor = Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004);
    setScale(S.scale * factor, { x: e.clientX, y: e.clientY });
  },
  { passive: false },
);

$('#zoomSlider').addEventListener('input', (e) => {
  S.fitMode = null;
  setScale(+e.target.value / 100);
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (S.fitMode) applyFit();
  }, 150);
});

// ---------------------------------------------------------------- thumbnails
const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const t = e.target;
      t._visible = e.isIntersecting;
      if (e.isIntersecting && t._stale) renderThumb(+t.dataset.idx);
    }
  },
  { root: sidebar, rootMargin: '300px 0px' },
);

function buildThumbs() {
  thumbObserver.disconnect();
  thumbsDiv.innerHTML = '';
  S.model.pages.forEach((_, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.dataset.idx = i;
    const vp1 = viewportFor(i, 1);
    const ts = Math.min(140 / vp1.width, 180 / vp1.height);
    t.innerHTML = `<div class="tbox" style="width:${Math.round(vp1.width * ts)}px;height:${Math.round(vp1.height * ts)}px"></div><div class="tnum">${i + 1}</div>`;
    t._stale = true;
    t._ts = ts;
    thumbsDiv.append(t);
    thumbObserver.observe(t);
  });
  updateThumbClasses(false);
}

const thumbQueue = new Set();
let thumbBusy = false;
function renderThumb(i) {
  thumbQueue.add(i);
  if (!thumbBusy) drainThumbs();
}
async function drainThumbs() {
  thumbBusy = true;
  while (thumbQueue.size) {
    const i = thumbQueue.values().next().value;
    thumbQueue.delete(i);
    const t = thumbsDiv.children[i];
    if (!t || !t._visible || !S.model.pages[i]) continue;
    t._stale = false;
    try {
      const dpr = window.devicePixelRatio || 1;
      const vp = viewportFor(i, t._ts * dpr);
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await S.pdfPages[S.model.pages[i].src].render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
      drawAnnotsOnCanvas(ctx, vp, i);
      const box = t.querySelector('.tbox');
      box.innerHTML = '';
      box.append(c);
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }
  thumbBusy = false;
}

function drawAnnotsOnCanvas(ctx, vp, i) {
  const rot = effRot(i);
  for (const a of S.model.pages[i].annots) {
    if (a.type === 'highlight') {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgbCss(a.color);
      for (const q of a.quads) {
        const r = quadToScreen(vp, q);
        ctx.fillRect(r.l, r.t, r.r - r.l, r.b - r.t);
      }
      ctx.restore();
    } else if (a.type === 'ink') {
      ctx.save();
      ctx.strokeStyle = rgbCss(a.color);
      ctx.lineWidth = Math.max(0.5, a.width * vp.scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const p of a.paths) {
        ctx.beginPath();
        tracePath(inkToScreen(vp, p), { moveTo: (x, y) => ctx.moveTo(x, y), lineTo: (x, y) => ctx.lineTo(x, y), quadTo: (cx, cy, x, y) => ctx.quadraticCurveTo(cx, cy, x, y) });
        ctx.stroke();
      }
      ctx.restore();
    } else if (a.type === 'sig') {
      const im = IMAGE_EL.get(a.imgId);
      if (!im || !im.complete || !im.naturalWidth) continue;
      const [x, y] = vp.convertToViewportPoint(a.x, a.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((((rot - a.rot + 360) % 360) * Math.PI) / 180);
      ctx.drawImage(im, 0, 0, a.w * vp.scale, a.h * vp.scale);
      ctx.restore();
    } else if (a.type === 'note') {
      const [x, y] = vp.convertToViewportPoint(a.x, a.y);
      const s = Math.max(4, 18 * vp.scale);
      ctx.fillStyle = rgbCss(a.color);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    } else if (a.type === 'text') {
      const [x, y] = vp.convertToViewportPoint(a.x, a.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((((rot - a.rot + 360) % 360) * Math.PI) / 180);
      const fs = a.size * vp.scale;
      ctx.font = `${fs}px ${fontOf(a).css}`;
      ctx.fillStyle = rgbCss(a.color);
      ctx.textBaseline = 'top';
      const lines = wrapLines(a.text, (a.w - 2 * TEXT_PAD) * vp.scale, (t) => ctx.measureText(t).width);
      lines.forEach((ln, k) => ctx.fillText(ln, TEXT_PAD * vp.scale, TEXT_PAD * vp.scale + k * fs * LINE_FACTOR));
      ctx.restore();
    }
  }
}

let staleTimer;
const staleSet = new Set();
function markThumbStale(i) {
  staleSet.add(i);
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    for (const k of staleSet) {
      const t = thumbsDiv.children[k];
      if (!t) continue;
      t._stale = true;
      if (t._visible) renderThumb(k);
    }
    staleSet.clear();
  }, 250);
}

function updateThumbClasses(scrollIntoView) {
  [...thumbsDiv.children].forEach((t, i) => {
    t.classList.toggle('current', i === S.current);
    t.classList.toggle('selected', S.selPages.has(i));
  });
  if (scrollIntoView && !sidebar.classList.contains('hidden')) {
    const t = thumbsDiv.children[S.current];
    if (t) {
      const sb = sidebar.getBoundingClientRect();
      const tb = t.getBoundingClientRect();
      if (tb.top < sb.top || tb.bottom > sb.bottom) t.scrollIntoView({ block: 'nearest' });
    }
  }
  const n = S.selPages.size;
  $('#pageSelInfo').textContent = n > 1 ? `${n} pages selected` : '';
}

let lastThumbClick = 0;
thumbsDiv.addEventListener('click', (e) => {
  const t = e.target.closest('.thumb');
  if (!t) return;
  const i = +t.dataset.idx;
  if (e.ctrlKey) {
    if (S.selPages.has(i) && S.selPages.size > 1) S.selPages.delete(i);
    else S.selPages.add(i);
    updateThumbClasses(false);
  } else if (e.shiftKey) {
    const a = Math.min(lastThumbClick, i);
    const b = Math.max(lastThumbClick, i);
    S.selPages = new Set();
    for (let k = a; k <= b; k++) S.selPages.add(k);
    updateThumbClasses(false);
  } else {
    goToPage(i);
  }
  if (!e.shiftKey) lastThumbClick = i;
  sidebar.focus();
});

thumbsDiv.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const t = e.target.closest('.thumb');
  if (!t) return;
  const i = +t.dataset.idx;
  if (!S.selPages.has(i)) {
    S.selPages = new Set([i]);
    updateThumbClasses(false);
  }
  const n = S.selPages.size;
  const what = n > 1 ? `${n} pages` : 'page';
  showMenu(e.clientX, e.clientY, [
    { label: `Rotate ${what} left`, run: () => rotatePages(-90) },
    { label: `Rotate ${what} right`, run: () => rotatePages(90) },
    '-',
    { label: `Delete ${what}`, key: 'Del', danger: true, run: () => deletePages() },
  ]);
});

// ---------------------------------------------------------------- page commands
function targetPages() {
  if (S.selPages.size) return [...S.selPages].filter((i) => i < S.model.pages.length).sort((a, b) => a - b);
  return [S.current];
}

function rotatePages(delta, list = targetPages()) {
  if (!guardEdit()) return;
  commitEdits();
  pushUndo();
  const cur = S.current;
  for (const i of list) S.model.pages[i].rot = (S.model.pages[i].rot + delta + 360) % 360;
  rebuildAfterStructure(cur);
  status(`Rotated ${list.length > 1 ? `${list.length} pages` : `page ${list[0] + 1}`}`);
}

function deletePages(list = targetPages()) {
  if (!guardEdit()) return;
  commitEdits();
  if (list.length >= S.model.pages.length) {
    api.error('You cannot delete every page of the document.');
    return;
  }
  pushUndo();
  const del = new Set(list);
  S.model.pages = S.model.pages.filter((_, i) => !del.has(i));
  S.sel = null;
  S.selPages = new Set();
  rebuildAfterStructure(Math.min(list[0], S.model.pages.length - 1));
  status(`Deleted ${list.length > 1 ? `${list.length} pages` : `page ${list[0] + 1}`}. Ctrl+Z brings it back.`, 5000);
}

function rebuildAfterStructure(focusPage) {
  buildPagesDOM();
  buildThumbs();
  if (S.fitMode) applyFit();
  goToPage(focusPage);
  if (S.search.q) runSearch(S.search.q, true);
  scheduleRender();
  updateDirty();
}

// ---------------------------------------------------------------- undo / redo
function restore(snap) {
  const old = S.model.pages;
  const next = JSON.parse(snap);
  S.model.pages = next;
  S.sel = null;
  const structural = old.length !== next.length || old.some((p, k) => p.src !== next[k].src || p.rot !== next[k].rot);
  if (structural) {
    rebuildAfterStructure(Math.min(S.current, next.length - 1));
  } else {
    renderAllAnnots();
    next.forEach((p, k) => {
      if (JSON.stringify(p.annots) !== JSON.stringify(old[k].annots)) markThumbStale(k);
    });
  }
  updateDirty();
}
function undo() {
  commitEdits();
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  restore(S.undo.pop());
  status('Undone');
}
function redo() {
  commitEdits();
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  restore(S.redo.pop());
  status('Redone');
}

// ---------------------------------------------------------------- search
const searchbar = $('#searchbar');
const searchInput = $('#searchInput');

function openSearch() {
  if (!S.pdf) return;
  searchbar.hidden = false;
  const sel = window.getSelection()?.toString().trim();
  if (sel && sel.length < 80 && !sel.includes('\n')) searchInput.value = sel;
  searchInput.focus();
  searchInput.select();
  if (searchInput.value) runSearch(searchInput.value);
}
function closeSearch() {
  searchbar.hidden = true;
  S.search = { q: '', results: [], idx: -1, byPage: new Map() };
  S.pe.forEach((_, i) => applySearchHighlights(i));
  $('#searchCount').textContent = '';
}

async function pageStrings(i) {
  const tc = await getTextContent(S.model.pages[i].src);
  return tc.items.filter((it) => it.str !== undefined).map((it) => it.str + (it.hasEOL ? '\n' : ''));
}

let searchSeq = 0;
async function runSearch(q, keepPosition = false) {
  const seq = ++searchSeq;
  const query = q.trim().toLowerCase();
  const results = [];
  const byPage = new Map();
  if (query) {
    for (let i = 0; i < S.model.pages.length; i++) {
      const strs = await pageStrings(i);
      if (seq !== searchSeq) return;
      const full = strs.join('').toLowerCase().replace(/\s/g, ' ');
      let from = 0;
      let k;
      while ((k = full.indexOf(query.replace(/\s+/g, ' '), from)) !== -1) {
        const r = { page: i, start: k, end: k + query.length };
        results.push(r);
        if (!byPage.has(i)) byPage.set(i, []);
        byPage.get(i).push(r);
        from = k + Math.max(1, query.length);
      }
    }
  }
  const prevPage = S.search.results[S.search.idx]?.page;
  S.search = { q, results, idx: -1, byPage };
  if (results.length) {
    let idx = results.findIndex((r) => r.page >= (keepPosition && prevPage != null ? prevPage : S.current));
    if (idx < 0) idx = 0;
    await showResult(idx);
  } else {
    S.pe.forEach((_, i) => applySearchHighlights(i));
  }
  updateSearchCount();
}

function updateSearchCount() {
  const { results, idx, q } = S.search;
  $('#searchCount').textContent = !q.trim() ? '' : results.length ? `${idx + 1} of ${results.length}` : 'No results';
}

async function showResult(idx) {
  const { results } = S.search;
  if (!results.length) return;
  S.search.idx = (idx + results.length) % results.length;
  const r = results[S.search.idx];
  const prev = [...S.pe.keys()].filter((i) => S.pe[i].tl);
  if (S.pe[r.page].el.offsetTop > viewer.scrollTop + viewer.clientHeight || S.pe[r.page].el.offsetTop + S.pe[r.page].el.offsetHeight < viewer.scrollTop) {
    goToPage(r.page);
  }
  await ensureRendered(r.page);
  await Promise.all(prev.map((i) => applySearchHighlights(i)));
  await applySearchHighlights(r.page);
  const cur = S.pe[r.page].tlDiv?.querySelector('.highlight.selected');
  cur?.scrollIntoView({ block: 'center', inline: 'nearest' });
  updateSearchCount();
}

async function applySearchHighlights(i) {
  const pe = S.pe[i];
  if (!pe?.tl) return;
  const tl = pe.tl;
  const divs = tl.textDivs;
  const strs = tl.textContentItemsStr;
  if (pe._touched) for (const k of pe._touched) if (divs[k]) divs[k].textContent = strs[k];
  pe._touched = new Set();
  const matches = S.search.byPage.get(i);
  if (!matches) return;
  // Offsets mirror pageStrings(): each item plus a newline when it ends a line.
  const tc = await getTextContent(S.model.pages[i].src);
  if (pe.tl !== tl) return;
  const items = tc.items.filter((it) => it.str !== undefined);
  const starts = [];
  let p = 0;
  items.forEach((it, k) => {
    starts[k] = p;
    p += it.str.length + (it.hasEOL ? 1 : 0);
  });
  const cur = S.search.results[S.search.idx];
  const perDiv = new Map();
  for (const m of matches) {
    for (let k = 0; k < items.length; k++) {
      const s = starts[k];
      const e = s + items[k].str.length;
      if (e <= m.start || s >= m.end) continue;
      if (!perDiv.has(k)) perDiv.set(k, []);
      perDiv.get(k).push({ a: Math.max(0, m.start - s), b: Math.min(items[k].str.length, m.end - s), selected: m === cur });
    }
  }
  for (const [k, ranges] of perDiv) {
    const div = divs[k];
    if (!div) continue;
    const str = strs[k];
    ranges.sort((x, y) => x.a - y.a);
    div.textContent = '';
    let last = 0;
    for (const r of ranges) {
      if (r.a < last) continue;
      if (r.a > last) div.append(document.createTextNode(str.slice(last, r.a)));
      const span = document.createElement('span');
      span.className = 'highlight' + (r.selected ? ' selected' : '');
      span.textContent = str.slice(r.a, r.b);
      div.append(span);
      last = r.b;
    }
    if (last < str.length) div.append(document.createTextNode(str.slice(last)));
    pe._touched.add(k);
  }
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 250);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (searchInput.value !== S.search.q) runSearch(searchInput.value);
    else showResult(S.search.idx + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape') {
    closeSearch();
    viewer.focus();
  }
});

// ---------------------------------------------------------------- tools & swatches
function setTool(t) {
  commitEdits();
  if (t !== 'sign') {
    placingSig = null;
    sigGhost.hidden = true;
    $$('[data-cmd=sign]').forEach((b) => b.classList.remove('active'));
  }
  S.tool = t;
  $$('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  document.body.classList.remove('tool-select', 'tool-highlight', 'tool-text', 'tool-note', 'tool-sign', 'tool-draw');
  $('#penBar').hidden = t !== 'draw';
  if (t !== 'draw') setErasing(false);
  document.body.classList.add(`tool-${t}`);
  const hints = {
    select: '',
    highlight: 'Highlight: drag over text, or drag a box on an empty area.',
    text: 'Text: click on the page where you want to type.',
    note: 'Comment: click on the page where the comment should go.',
    sign: 'Signature: click on the page where it should go. Esc cancels.',
    draw: 'Draw: drag on the page. Pick a color and thickness above; Eraser removes lines; Esc when done.',
  };
  if (hints[t]) status(hints[t], 5000);
}

function buildSwatches() {
  const hl = $('#hlSwatches');
  for (const [name, c] of Object.entries(HIGHLIGHT_COLORS)) {
    const b = document.createElement('button');
    b.className = 'swatch' + (name === S.hlColor ? ' active' : '');
    b.style.background = rgbCss(c);
    b.title = name[0].toUpperCase() + name.slice(1);
    b.dataset.needsDoc = '1';
    b.onclick = () => {
      S.hlColor = name;
      $$('#hlSwatches .swatch').forEach((x) => x.classList.toggle('active', x === b));
      const a = S.sel && findAnnot(S.sel.page, S.sel.id);
      if (a?.type === 'highlight') recolor(S.sel.page, a.id, c);
      else setTool('highlight');
    };
    hl.append(b);
  }
  const tx = $('#txtSwatches');
  for (const [name, c] of Object.entries(TEXT_COLORS)) {
    const b = document.createElement('button');
    b.className = 'swatch' + (name === S.textColor ? ' active' : '');
    b.style.background = rgbCss(c);
    b.title = name[0].toUpperCase() + name.slice(1);
    b.dataset.needsDoc = '1';
    b.onclick = () => {
      S.textColor = name;
      $$('#txtSwatches .swatch').forEach((x) => x.classList.toggle('active', x === b));
      applyTextStyle({ color: [...c] });
    };
    tx.append(b);
  }
  const fontSel = $('#textFont');
  for (const [key, f] of Object.entries(TEXT_FONTS)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = f.label;
    o.style.fontFamily = f.css;
    fontSel.append(o);
  }
  fontSel.value = S.textFont;
  fontSel.addEventListener('change', (e) => {
    S.textFont = e.target.value;
    applyTextStyle({ font: S.textFont });
  });
  $('#textSize').addEventListener('change', (e) => {
    S.textSize = +e.target.value;
    applyTextStyle({ size: S.textSize });
  });
}

function applyTextStyle(props) {
  const target = S.editing || S.sel;
  if (!target) return;
  setTextProps(target.page, target.id, props);
}

function setTextProps(page, id, props) {
  commitEdits();
  const a = findAnnot(page, id);
  if (a?.type !== 'text' || !guardEdit()) return;
  pushUndo();
  Object.assign(a, props);
  renderAnnots(page);
  // re-measure height for the new size
  const tb = S.pe[page].ann.querySelector(`.ann-text[data-id="${id}"] .tb`);
  if (tb) {
    tb.style.minHeight = '0px';
    a.h = Math.max(tb.offsetHeight / S.scale, a.size * LINE_FACTOR + 2 * TEXT_PAD);
    renderAnnots(page);
  }
  changed([page]);
}

// ---------------------------------------------------------------- recent files
function formatWhen(t) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'long' })}, ${time}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function refreshRecent() {
  const list = await api.getRecent();
  const split = (p) => {
    const name = p.split(/[\\/]/).pop();
    return { name, dir: p.slice(0, Math.max(0, p.length - name.length - 1)) };
  };

  // File > Recent dropdown: the 15 most recent.
  const menu = $('#recentMenu');
  menu.innerHTML = '';
  if (!list.length) menu.innerHTML = '<div class="empty">No recent files</div>';
  for (const r of list.slice(0, 15)) {
    const { name, dir } = split(r.path);
    const b = document.createElement('button');
    b.className = 'mi';
    b.title = r.path;
    b.innerHTML = '<span></span><small></small>';
    b.children[0].textContent = name;
    b.children[1].textContent = dir;
    b.onclick = () => {
      hideMenus();
      openPath(r.path);
    };
    menu.append(b);
  }

  // Start screen table: up to 100 files.
  const tbody = $('#recentTable tbody');
  tbody.innerHTML = '';
  $('#recentEmpty').hidden = list.length > 0;
  $('#recentTable').style.display = list.length ? '' : 'none';
  $('#recentCount').textContent = list.length ? `${list.length} file${list.length > 1 ? 's' : ''}` : '';
  list.forEach((r, k) => {
    const { name, dir } = split(r.path);
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="n"></td><td class="dir"></td><td class="file"></td><td class="time"></td>';
    tr.children[0].textContent = k + 1;
    tr.children[1].textContent = dir;
    tr.children[2].textContent = name;
    tr.children[2].title = r.path;
    tr.children[3].textContent = formatWhen(r.time);
    if (r.time) tr.children[3].title = new Date(r.time).toLocaleString();
    tr.onclick = () => openPath(r.path);
    tr.oncontextmenu = (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Open', run: () => openPath(r.path) },
        { label: 'Remove from list', run: async () => { await api.removeRecent(r.path); refreshRecent(); } },
      ]);
    };
    tbody.append(tr);
  });
  requestAnimationFrame(fitRecentPaths);
}

// Folder paths in the recent files table always show their beginning. If a path is too long,
// its text shrinks (down to half the normal size); if it still does not fit, the end is cut with "…".
const pathCanvas = document.createElement('canvas').getContext('2d');
function fitRecentPaths() {
  const cells = $$('#recentTable td.dir');
  if (!cells.length || !cells[0].offsetParent) return;
  const cs = getComputedStyle(cells[0]);
  const base = parseFloat(getComputedStyle($('#recentTable')).fontSize);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const avail = cells[0].clientWidth - pad - 2;
  pathCanvas.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
  for (const td of cells) {
    const w = pathCanvas.measureText(td.textContent).width;
    const size = w <= avail ? base : Math.max(base * 0.5, Math.floor(((base * avail) / w) * 10) / 10);
    td.style.fontSize = `${size}px`;
  }
}
new ResizeObserver(() => fitRecentPaths()).observe($('#recentTable'));

// Hovering over a folder path that is cut off shows the whole path in a popup.
const pathTip = document.createElement('div');
pathTip.id = 'pathTip';
pathTip.hidden = true;
document.body.append(pathTip);
let pathTipTimer = null;
const hidePathTip = () => {
  clearTimeout(pathTipTimer);
  pathTip.hidden = true;
};
$('#recentTable').addEventListener('mouseover', (e) => {
  const td = e.target.closest('td.dir');
  if (!td) return hidePathTip();
  if (td.scrollWidth <= td.clientWidth + 1) return hidePathTip(); // fully visible: no popup
  clearTimeout(pathTipTimer);
  pathTipTimer = setTimeout(() => {
    pathTip.textContent = td.textContent;
    pathTip.hidden = false;
    const r = td.getBoundingClientRect();
    const t = pathTip.getBoundingClientRect();
    pathTip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - t.width - 8))}px`;
    const below = r.bottom + 6;
    pathTip.style.top = `${below + t.height > innerHeight - 8 ? r.top - t.height - 6 : below}px`;
  }, 250);
});
$('#recentTable').addEventListener('mouseleave', hidePathTip);
$('.recent-scroll').addEventListener('scroll', hidePathTip);
window.addEventListener('mousedown', hidePathTip);

// Highlight the drop box while a file is dragged over the start screen.
const dropBox = $('#dropBox');
['dragenter', 'dragover'].forEach((ev) => dropBox.addEventListener(ev, () => dropBox.classList.add('over')));
['dragleave', 'drop'].forEach((ev) => dropBox.addEventListener(ev, () => dropBox.classList.remove('over')));

// ---------------------------------------------------------------- commands & keys
const commands = {
  undo, redo,
  open: openDialog,
  save: () => save(false),
  saveAs: () => save(true),
  print,
  closeDoc: closeCmd,
  recentMenu: async () => {
    await refreshRecent();
    $('#recentMenu').classList.toggle('open');
  },
  firstPage: () => goToPage(0),
  prevPage: () => goToPage(S.current - 1),
  nextPage: () => goToPage(S.current + 1),
  lastPage: () => goToPage(S.pe.length - 1),
  rotateLeft: () => rotatePages(-90),
  rotateRight: () => rotatePages(90),
  deletePages: () => deletePages(),
  deleteAnnot: () => {
    if (S.sel) deleteAnnot();
    else status('Click a highlight, text box or comment first, then press Remove.');
  },
  zoomIn: () => zoomStep(1),
  zoomOut: () => zoomStep(-1),
  zoom100: () => {
    S.fitMode = null;
    setScale(1);
  },
  fitWidth: () => {
    S.fitMode = 'width';
    applyFit();
  },
  fitPage: () => {
    S.fitMode = 'page';
    applyFit();
  },
  about: () => {
    $('#aboutDlg').hidden = false;
    $('#aboutDlg .primary').focus();
  },
  closeAbout: () => {
    $('#aboutDlg').hidden = true;
  },
  sign: () => openSignMenu(),
  find: openSearch,
  findNext: () => showResult(S.search.idx + 1),
  findPrev: () => showResult(S.search.idx - 1),
  findClose: closeSearch,
  toggleThumbs: () => setPanel('thumbs', sidebar.classList.contains('hidden')),
  toggleOutline: () => setPanel('outline', outlinePanel.classList.contains('hidden')),
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (b && commands[b.dataset.cmd] && !b.disabled) {
    if (b.dataset.needsDoc && !S.pdf) return;
    commands[b.dataset.cmd]();
  }
  const t = e.target.closest('[data-tool]');
  if (t && S.pdf) setTool(t.dataset.tool);
});

// ---------------------------------------------------------------- ribbon tabs & collapse
let ribbonCollapsed = false;
try {
  ribbonCollapsed = localStorage.getItem('pdfacil.ribbonCollapsed') === '1';
} catch {}

function showPanel(tab) {
  $$('.tab[data-tab]').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
}

function setPeek(on) {
  document.body.classList.toggle('ribbon-peek', on);
  $$('.tab').forEach((x) => x.classList.toggle('peeking', on && x.classList.contains('active')));
}

function setRibbonCollapsed(v) {
  ribbonCollapsed = v;
  document.body.classList.toggle('ribbon-collapsed', v);
  setPeek(false);
  const b = $('#ribbonToggle');
  b.innerHTML = svg(v ? 'chevDown' : 'chevUp');
  b.title = v ? 'Show the ribbon (Ctrl+F1)' : 'Hide the ribbon (Ctrl+F1)';
  try {
    localStorage.setItem('pdfacil.ribbonCollapsed', v ? '1' : '0');
  } catch {}
  // The document area changed size.
  if (S.pdf && S.fitMode) setTimeout(applyFit, 0);
}

$$('.tab[data-tab]').forEach((t) => {
  t.addEventListener('click', () => {
    if (ribbonCollapsed) {
      // Collapsed: show the ribbon temporarily on top of the document.
      const same = t.classList.contains('active') && document.body.classList.contains('ribbon-peek');
      showPanel(t.dataset.tab);
      setPeek(!same);
    } else {
      showPanel(t.dataset.tab);
    }
  });
  t.addEventListener('dblclick', () => setRibbonCollapsed(!ribbonCollapsed));
});
$('#ribbonToggle').addEventListener('click', () => setRibbonCollapsed(!ribbonCollapsed));

// Hide the temporary ribbon when clicking elsewhere, or after using one of its buttons.
document.addEventListener('mousedown', (e) => {
  if (!document.body.classList.contains('ribbon-peek')) return;
  if (e.target.closest('#ribbon') || e.target.closest('#tabs') || e.target.closest('.menu')) return;
  setPeek(false);
});
$('#ribbon').addEventListener('click', (e) => {
  if (!document.body.classList.contains('ribbon-peek')) return;
  const b = e.target.closest('button[data-cmd], button[data-tool]');
  if (b && b.dataset.cmd !== 'recentMenu') setTimeout(() => setPeek(false), 0);
});
setRibbonCollapsed(ribbonCollapsed);

const isEditable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const inEdit = isEditable(document.activeElement);

  if (e.key === 'F1' && ctrl) {
    e.preventDefault();
    setRibbonCollapsed(!ribbonCollapsed);
    return;
  }
  if (ctrl && (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp')) {
    e.preventDefault();
    switchTab(e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
    return;
  }
  if (ctrl) {
    const map = {
      o: openDialog, p: print, f: openSearch, w: closeCmd,
      g: () => S.pdf && $('#pageInput').focus(),
      '=': () => zoomStep(1), '+': () => zoomStep(1), '-': () => zoomStep(-1),
      '0': () => commands.zoom100(),
    };
    if (k === 's') {
      e.preventDefault();
      save(e.shiftKey);
      return;
    }
    if (!inEdit && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else undo();
      return;
    }
    if (map[k]) {
      e.preventDefault();
      if (k === 'o' || S.pdf) map[k]();
      return;
    }
    if (k === 'c' && !inEdit) {
      const t = window.getSelection()?.toString();
      if (t) navigator.clipboard.writeText(t);
    }
    return;
  }

  if (e.key === 'F1') {
    e.preventDefault();
    commands.about();
    return;
  }
  if (!$('#aboutDlg').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      commands.closeAbout();
    }
    return;
  }
  if (e.key === 'Escape') {
    hideMenus();
    if (S.editing || S.openNote) {
      commitEdits();
      viewer.focus();
    } else if (!searchbar.hidden && document.activeElement === searchInput) {
      closeSearch();
    } else if (S.sel) {
      select(null, null);
    } else if (S.tool !== 'select') {
      setTool('select');
    }
    return;
  }
  if (e.key === 'F3' && S.pdf) {
    e.preventDefault();
    if (searchbar.hidden) openSearch();
    else showResult(S.search.idx + (e.shiftKey ? -1 : 1));
    return;
  }
  if (inEdit || !S.pdf) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.sel) {
      e.preventDefault();
      deleteAnnot();
    } else if (document.activeElement === sidebar) {
      e.preventDefault();
      deletePages();
    }
    return;
  }
  if (k === 's' && !e.altKey) {
    commands.sign();
    return;
  }
  if (k === 'e' && S.tool === 'draw' && !e.altKey) {
    setErasing(!S.erasing);
    return;
  }
  const tools = { v: 'select', h: 'highlight', t: 'text', n: 'note', d: 'draw' };
  if (tools[k] && !e.altKey) {
    setTool(tools[k]);
    return;
  }
  if (document.activeElement === sidebar && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    goToPage(S.current + (e.key === 'ArrowDown' ? 1 : -1));
    return;
  }
  if (e.key === 'Home') goToPage(0);
  if (e.key === 'End') goToPage(S.pe.length - 1);
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && viewer.scrollWidth <= viewer.clientWidth) {
    goToPage(S.current + (e.key === 'ArrowRight' ? 1 : -1));
  }
});

// ---------------------------------------------------------------- drag & drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  dragDepth++;
  if (S.pdf) $('#dropOverlay').hidden = false; // the start screen has its own drop box
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#dropOverlay').hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropOverlay').hidden = true;
  const files = [...(e.dataTransfer?.files || [])].filter((x) => /\.pdf$/i.test(x.name));
  if (!files.length) {
    status('Only PDF files can be opened.');
    return;
  }
  (async () => {
    for (const f of files) await openPath(api.pathForFile(f));
  })();
});

// ---------------------------------------------------------------- startup
api.onOpenPath((p) => openPath(p));
api.onMenu((ch) => {
  const editing = isEditable(document.activeElement);
  if (ch === 'menu-about') commands.about();
  else if (ch === 'menu-undo') editing ? document.execCommand('undo') : undo();
  else if (ch === 'menu-redo') editing ? document.execCommand('redo') : redo();
});
// On a Mac, show the Command key in tooltips instead of Ctrl.
if (api.isMac) {
  document.body.classList.add('mac');
  for (const el of document.querySelectorAll('[title]')) el.title = el.title.replace(/Ctrl\+/g, '⌘').replace(/Ctrl \+/g, '⌘ ');
}
api.onSaveAndClose(saveAllAndClose);

$('#aboutDlg').addEventListener('mousedown', (e) => {
  if (e.target.id === 'aboutDlg') commands.closeAbout();
});
api.version().then((v) => {
  $('#aboutVersion').textContent = v;
  $('#brandVer').textContent = `v${v}`;
});

for (const which of ['thumbs', 'outline']) {
  let v = null;
  try {
    v = localStorage.getItem(`pdfacil.show.${which}`);
  } catch {}
  if (v !== null) setPanel(which, v === '1');
}

document.body.classList.add('nodoc', 'tool-select');
buildSwatches();
buildPenControls();
updateDirty();
updateZoomUI();
refreshRecent();
api.startupPath().then((p) => p && openPath(p));

// test hook (used by automated tests only)
window.__pdfacil = { S, IMAGES, registerImage, startPlacing, tabs, getActive: () => active, activate, closeTab, openPath, save, setTool, highlightSelection, deletePages, rotatePages, undo, redo, runSearch, setScale, buildPdf };
