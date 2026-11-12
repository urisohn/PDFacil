// PDFacil - signatures: create (draw / type / upload), clean up, and remember them.
// A signature is a transparent PNG (data URL), trimmed to the ink.

const STORE_KEY = 'pdfacil.signatures';
const MAX_SAVED = 6;

export const SIG_FONTS = [
  { family: 'PDFacil Dancing Script', label: 'Dancing Script' },
  { family: 'PDFacil Great Vibes', label: 'Great Vibes' },
  { family: 'PDFacil Caveat', label: 'Caveat' },
];
const INK = { black: '#111111', blue: '#1b3f9e' };

// ---------------------------------------------------------------- saved signatures
export function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => s && s.dataUrl) : [];
  } catch {
    return [];
  }
}
function writeSaved(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {}
}
export function saveSignature(sig) {
  writeSaved([sig, ...loadSaved().filter((s) => s.dataUrl !== sig.dataUrl)]);
}
export function deleteSaved(id) {
  writeSaved(loadSaved().filter((s) => s.id !== id));
}

// ---------------------------------------------------------------- image helpers
/** Crop a canvas to its non-transparent pixels (plus padding) and return { dataUrl, w, h }. */
export function trimCanvas(src, pad = 6, maxSide = 1400) {
  const ctx = src.getContext('2d');
  const { width: W, height: H } = src;
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // empty
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  let w = x1 - x0 + 1;
  let h = y1 - y0 + 1;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * k);
  out.height = Math.round(h * k);
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL('image/png'), w: out.width, h: out.height };
}

/** Make a light background transparent (for photos and scans of a signature on paper). */
function removeBackground(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // Estimate the paper brightness from the brightest 20% of pixels.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]++;
  let n = 0;
  let paper = 255;
  const total = d.length / 4;
  for (let v = 255; v >= 0; v--) {
    n += hist[v];
    if (n >= total * 0.2) {
      paper = v;
      break;
    }
  }
  const hi = Math.max(60, paper - 25); // at or above: fully transparent
  const lo = Math.max(20, hi - 70); // at or below: fully opaque
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const t = lum >= hi ? 0 : lum <= lo ? 1 : (hi - lum) / (hi - lo);
    d[i + 3] = Math.round(d[i + 3] * t);
  }
  ctx.putImageData(img, 0, 0);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not an image PDFacil can read.'));
    };
    im.src = url;
  });
}

// ---------------------------------------------------------------- create dialog
/**
 * Open the "Create signature" dialog. Resolves with { id, dataUrl, w, h } or null if cancelled.
 */
export function createSignatureDialog() {
  return new Promise((resolve) => {
    const dlg = document.getElementById('sigDlg');
    const tabs = [...dlg.querySelectorAll('.sig-tab')];
    const panes = [...dlg.querySelectorAll('.sig-pane')];
    const useBtn = dlg.querySelector('.sig-use');
    const saveBox = dlg.querySelector('#sigRemember');
    let mode = 'draw';
    let ink = 'black';

    // ---- draw
    const pad = dlg.querySelector('#sigPad');
    const pctx = pad.getContext('2d');
    const ratio = 2;
    const sizePad = () => {
      const r = pad.getBoundingClientRect();
      pad.width = Math.round(r.width * ratio);
      pad.height = Math.round(r.height * ratio);
    };
    let strokes = [];
    let cur = null;
    const redraw = () => {
      pctx.clearRect(0, 0, pad.width, pad.height);
      pctx.lineCap = 'round';
      pctx.lineJoin = 'round';
      pctx.strokeStyle = INK[ink];
      for (const s of strokes) {
        pctx.lineWidth = 2.6 * ratio;
        pctx.beginPath();
        const p = s;
        pctx.moveTo(p[0].x, p[0].y);
        if (p.length === 1) pctx.lineTo(p[0].x + 0.1, p[0].y + 0.1);
        for (let k = 1; k < p.length - 1; k++) {
          const mx = (p[k].x + p[k + 1].x) / 2;
          const my = (p[k].y + p[k + 1].y) / 2;
          pctx.quadraticCurveTo(p[k].x, p[k].y, mx, my);
        }
        if (p.length > 1) pctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
        pctx.stroke();
      }
      updateUse();
    };
    const pt = (e) => {
      const r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) * ratio, y: (e.clientY - r.top) * ratio };
    };
    pad.onpointerdown = (e) => {
      pad.setPointerCapture(e.pointerId);
      cur = [pt(e)];
      strokes.push(cur);
      redraw();
    };
    pad.onpointermove = (e) => {
      if (!cur) return;
      cur.push(pt(e));
      redraw();
    };
    pad.onpointerup = pad.onpointercancel = () => {
      cur = null;
    };
    dlg.querySelector('.sig-clear').onclick = () => {
      strokes = [];
      redraw();
    };

    // ---- type
    const nameInput = dlg.querySelector('#sigName');
    const fontList = dlg.querySelector('.sig-fonts');
    let font = SIG_FONTS[0].family;
    const renderFonts = () => {
      fontList.innerHTML = '';
      const name = nameInput.value.trim() || 'Your Name';
      for (const f of SIG_FONTS) {
        const b = document.createElement('button');
        b.className = 'sig-font' + (f.family === font ? ' active' : '');
        b.style.fontFamily = `"${f.family}"`;
        b.style.color = INK[ink];
        b.textContent = name;
        b.title = f.label;
        b.onclick = () => {
          font = f.family;
          renderFonts();
        };
        fontList.append(b);
      }
      updateUse();
    };
    nameInput.oninput = renderFonts;

    // ---- upload
    const fileInput = dlg.querySelector('#sigFile');
    const preview = dlg.querySelector('.sig-preview');
    const clean = dlg.querySelector('#sigClean');
    let uploaded = null; // HTMLImageElement
    let uploadResult = null;
    const processUpload = () => {
      uploadResult = null;
      if (!uploaded) {
        preview.innerHTML = '<span>No image chosen yet.</span>';
        updateUse();
        return;
      }
      const c = document.createElement('canvas');
      const k = Math.min(1, 1600 / Math.max(uploaded.naturalWidth, uploaded.naturalHeight));
      c.width = Math.max(1, Math.round(uploaded.naturalWidth * k));
      c.height = Math.max(1, Math.round(uploaded.naturalHeight * k));
      c.getContext('2d').drawImage(uploaded, 0, 0, c.width, c.height);
      if (clean.checked) removeBackground(c);
      uploadResult = trimCanvas(c, 4);
      preview.innerHTML = '';
      if (uploadResult) {
        const im = new Image();
        im.src = uploadResult.dataUrl;
        preview.append(im);
      } else preview.innerHTML = '<span>Nothing left after removing the background. Try unticking the option.</span>';
      updateUse();
    };
    fileInput.onchange = async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        uploaded = await fileToImage(f);
      } catch (err) {
        uploaded = null;
        preview.innerHTML = `<span>${err.message}</span>`;
      }
      processUpload();
    };
    clean.onchange = processUpload;

    // ---- ink color (draw + type)
    dlg.querySelectorAll('.sig-ink').forEach((b) => {
      b.classList.toggle('active', b.dataset.ink === ink);
      b.onclick = () => {
        ink = b.dataset.ink;
        dlg.querySelectorAll('.sig-ink').forEach((x) => x.classList.toggle('active', x === b));
        redraw();
        renderFonts();
      };
    });

    // ---- tabs
    const setMode = (m) => {
      mode = m;
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
      panes.forEach((p) => (p.hidden = p.dataset.mode !== m));
      dlg.querySelector('.sig-inks').style.visibility = m === 'upload' ? 'hidden' : 'visible';
      if (m === 'draw') requestAnimationFrame(() => {
        sizePad();
        redraw();
      });
      if (m === 'type') {
        renderFonts();
        nameInput.focus();
      }
      updateUse();
    };
    tabs.forEach((t) => (t.onclick = () => setMode(t.dataset.mode)));

    function updateUse() {
      let ok = false;
      if (mode === 'draw') ok = strokes.length > 0;
      else if (mode === 'type') ok = nameInput.value.trim().length > 0;
      else ok = !!uploadResult;
      useBtn.disabled = !ok;
    }

    const typedResult = async () => {
      const f = SIG_FONTS.find((x) => x.family === font);
      await document.fonts.load(`120px "${f.family}"`);
      const text = nameInput.value.trim();
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.font = `120px "${f.family}"`;
      const w = Math.ceil(ctx.measureText(text).width) + 80;
      c.width = Math.min(4000, w);
      c.height = 260;
      ctx.font = `120px "${f.family}"`;
      ctx.fillStyle = INK[ink];
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 40, 130);
      return trimCanvas(c, 6);
    };

    const close = (result) => {
      dlg.hidden = true;
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    dlg.querySelector('.sig-cancel').onclick = () => close(null);
    dlg.querySelector('.sig-x').onclick = () => close(null);
    useBtn.onclick = async () => {
      let r = null;
      if (mode === 'draw') r = trimCanvas(pad, 8);
      else if (mode === 'type') r = await typedResult();
      else r = uploadResult;
      if (!r) return;
      const sig = { id: `sig-${Date.now().toString(36)}`, ...r };
      if (saveBox.checked) saveSignature(sig);
      close(sig);
    };

    // reset and show
    strokes = [];
    nameInput.value = '';
    fileInput.value = '';
    uploaded = null;
    uploadResult = null;
    preview.innerHTML = '<span>No image chosen yet.</span>';
    dlg.hidden = false;
    setMode('draw');
  });
}
