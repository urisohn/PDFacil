// PDFacil - reading and writing annotations with pdf-lib.
// Annotations are stored in PDF user space (unrotated page coordinates, origin bottom-left).
/* global PDFLib */
import { tracePath, pathsBBox } from './ink.js';
const {
  PDFDocument, PDFName, PDFHexString, PDFString, PDFArray, PDFDict, PDFNumber,
  StandardFonts, degrees,
  pushGraphicsState, popGraphicsState, setGraphicsState, setFillingRgbColor,
  rectangle, fill, moveTo, lineTo, closePath, stroke, setLineWidth, setStrokingRgbColor,
  appendBezierCurve, beginText, endText, setFontAndSize, moveText, showText,
} = PDFLib;

const MARK = 'PDFacilData'; // private key holding our own model JSON for exact round-trips
const IMG_KEY = 'PDFacilImage'; // private key holding a signature's PNG

export const HIGHLIGHT_COLORS = {
  yellow: [1, 0.92, 0.23],
  green: [0.55, 0.9, 0.4],
  blue: [0.45, 0.8, 1],
  pink: [1, 0.55, 0.8],
};

let idCounter = 0;
export const newId = () => `pdfacil-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const num = (o) => (o instanceof PDFNumber ? o.asNumber() : Number(o?.asNumber?.() ?? 0));
const arr = (a) => (a instanceof PDFArray ? a.asArray().map(num) : null);
const textOf = (o) => {
  if (!o) return '';
  try {
    return o.decodeText();
  } catch {
    return '';
  }
};

/**
 * Load a PDF. Highlights, sticky notes, and PDFacil text boxes are lifted out of
 * the file into an editable model, so they can be moved, edited and deleted.
 * Returns { baseBytes, annotsBySrc, encrypted }.
 */
export async function importAnnotations(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e))) return { baseBytes: bytes, annotsBySrc: [], encrypted: true };
    throw e;
  }
  const ctx = doc.context;
  const annotsBySrc = [];
  let changed = false;

  doc.getPages().forEach((page, pi) => {
    const list = [];
    annotsBySrc[pi] = list;
    const annotsArr = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annotsArr) return;
    const removeRefs = new Set();
    const entries = annotsArr.asArray();
    entries.forEach((ref) => {
      const dict = ctx.lookupMaybe(ref, PDFDict);
      if (!dict) return;
      const sub = dict.get(PDFName.of('Subtype'))?.toString();
      const color = arr(dict.lookupMaybe(PDFName.of('C'), PDFArray));
      const rgb = color && color.length === 3 ? color : null;
      const mark = dict.get(PDFName.of(MARK));
      try {
        if (mark) {
          const data = JSON.parse(textOf(mark));
          if (data && data.type === 'sig') {
            const st = dict.lookupMaybe(PDFName.of(IMG_KEY), PDFLib.PDFRawStream);
            if (!st) return; // no picture: leave the stamp as it is
            const png = PDFLib.decodePDFRawStream(st).decode();
            let bin = '';
            for (let k = 0; k < png.length; k += 0x8000) bin += String.fromCharCode(...png.subarray(k, k + 0x8000));
            data.img = 'data:image/png;base64,' + btoa(bin);
          }
          if (data && data.type) {
            data.id = newId();
            list.push(data);
            removeRefs.add(ref);
            return;
          }
        }
        if (sub === '/Highlight') {
          const qp = arr(dict.lookupMaybe(PDFName.of('QuadPoints'), PDFArray));
          if (!qp || qp.length < 8) return;
          const quads = [];
          for (let i = 0; i + 8 <= qp.length; i += 8) quads.push(qp.slice(i, i + 8));
          list.push({
            id: newId(), type: 'highlight', quads,
            color: rgb || HIGHLIGHT_COLORS.yellow,
            contents: textOf(dict.get(PDFName.of('Contents'))),
          });
          removeRefs.add(ref);
        } else if (sub === '/Ink') {
          const inkList = dict.lookupMaybe(PDFName.of('InkList'), PDFArray);
          if (!inkList) return;
          const paths = inkList.asArray().map((x) => arr(ctx.lookupMaybe(x, PDFArray) || x)).filter((p) => p && p.length >= 2);
          if (!paths.length) return;
          const bs = dict.lookupMaybe(PDFName.of('BS'), PDFDict);
          const w = bs ? num(bs.get(PDFName.of('W'))) : 1;
          list.push({ id: newId(), type: 'ink', paths, color: rgb || [0, 0, 0], width: w || 1 });
          removeRefs.add(ref);
        } else if (sub === '/Text') {
          const r = arr(dict.lookupMaybe(PDFName.of('Rect'), PDFArray));
          if (!r) return;
          list.push({
            id: newId(), type: 'note',
            x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2,
            contents: textOf(dict.get(PDFName.of('Contents'))),
            color: rgb || [1, 0.85, 0.2],
          });
          removeRefs.add(ref);
        }
      } catch {
        /* leave anything we cannot parse untouched */
      }
    });
    if (!removeRefs.size) return;
    // Also drop popups that belong to the annotations we lifted out.
    entries.forEach((ref) => {
      const dict = ctx.lookupMaybe(ref, PDFDict);
      if (dict?.get(PDFName.of('Subtype'))?.toString() === '/Popup') {
        const parent = dict.get(PDFName.of('Parent'));
        if (parent && removeRefs.has(parent)) removeRefs.add(ref);
      }
    });
    const keep = entries.filter((r) => !removeRefs.has(r));
    page.node.set(PDFName.of('Annots'), ctx.obj(keep));
    changed = true;
  });

  const baseBytes = changed ? await doc.save({ useObjectStreams: false }) : bytes;
  return { baseBytes, annotsBySrc, encrypted: false };
}

// ---------- appearance streams ----------

function highlightAP(ctx, a) {
  const xs = a.quads.flatMap((q) => [q[0], q[2], q[4], q[6]]);
  const ys = a.quads.flatMap((q) => [q[1], q[3], q[5], q[7]]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const ops = [pushGraphicsState(), setGraphicsState('GS0'), setFillingRgbColor(...a.color)];
  for (const q of a.quads) {
    // Quad order: UL, UR, LL, LR (as written by Acrobat).
    ops.push(moveTo(q[4], q[5]), lineTo(q[6], q[7]), lineTo(q[2], q[3]), lineTo(q[0], q[1]), closePath());
  }
  ops.push(fill(), popGraphicsState());
  const gs = ctx.obj({ Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 });
  const stream = ctx.formXObject(ops, {
    BBox: bbox,
    Resources: { ExtGState: { GS0: gs } },
  });
  return { ref: ctx.register(stream), rect: bbox };
}

function noteAP(ctx, color) {
  const s = 20;
  const [r, g, b] = color;
  const ops = [
    pushGraphicsState(),
    setFillingRgbColor(r, g, b),
    setStrokingRgbColor(r * 0.6, g * 0.6, b * 0.6),
    setLineWidth(1),
    // speech bubble
    moveTo(2, 6), lineTo(2, 18), lineTo(18, 18), lineTo(18, 6), lineTo(9, 6), lineTo(5, 2), lineTo(6, 6), closePath(),
    PDFLib.fillAndStroke(),
    setStrokingRgbColor(r * 0.45, g * 0.45, b * 0.45),
    moveTo(5, 14), lineTo(15, 14), moveTo(5, 11.5), lineTo(15, 11.5), moveTo(5, 9), lineTo(12, 9),
    stroke(),
    popGraphicsState(),
  ];
  return ctx.register(ctx.formXObject(ops, { BBox: [0, 0, s, s] }));
}

/** Wrap text into lines that fit `maxWidth` using the given width function. */
export function wrapLines(text, maxWidth, widthOf) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/( +)/);
    let line = '';
    for (const w of words) {
      const trial = line + w;
      if (line && widthOf(trial.trimEnd()) > maxWidth) {
        out.push(line.trimEnd());
        line = w.trimStart();
        // Very long single words are broken by character.
        while (widthOf(line) > maxWidth && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && widthOf(line.slice(0, k)) > maxWidth) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      } else {
        line = trial;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

// Text box fonts. In the PDF they are the standard 14 fonts (no embedding needed);
// on screen we use the metric-compatible Windows fonts so line wrapping matches.
export const TEXT_FONTS = {
  helv: { label: 'Arial', css: 'Helvetica, Arial, sans-serif', std: 'Helvetica', res: 'Helv' },
  times: { label: 'Times New Roman', css: '"Times New Roman", Times, serif', std: 'TimesRoman', res: 'TiRo' },
  courier: { label: 'Courier New', css: '"Courier New", Courier, monospace', std: 'Courier', res: 'Cour' },
};
export const fontOf = (a) => TEXT_FONTS[a.font] || TEXT_FONTS.helv;

export const TEXT_PAD = 2; // points of padding inside a text box
export const LINE_FACTOR = 1.2;

function sanitizeForFont(font, s) {
  let out = '';
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function textAP(ctx, a, font, resName) {
  const { w, h, size, color } = a;
  const lines = wrapLines(sanitizeForFont(font, a.text), w - 2 * TEXT_PAD, (t) => font.widthOfTextAtSize(t, size));
  const lead = size * LINE_FACTOR;
  const ascent = font.heightAtSize(size, { descender: false });
  const ops = [pushGraphicsState(), beginText(), setFontAndSize(resName, size), setFillingRgbColor(...color)];
  // First baseline: top padding + half the extra leading + ascent (matches CSS line-height layout).
  let y = h - TEXT_PAD - (lead - size) / 2 - ascent;
  ops.push(moveText(TEXT_PAD, y));
  lines.forEach((line, i) => {
    if (i > 0) ops.push(moveText(0, -lead));
    if (line) ops.push(showText(font.encodeText(line)));
  });
  ops.push(endText(), popGraphicsState());
  const rad = (a.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const s = Math.round(Math.sin(rad));
  const stream = ctx.formXObject(ops, {
    BBox: [0, 0, w, h],
    Matrix: [c, s, -s, c, 0, 0],
    Resources: { Font: { [resName]: font.ref } },
  });
  return ctx.register(stream);
}

/**
 * Corners of a text box in user space. The box is defined by its anchor (top-left
 * as seen when it was created, at page view rotation `rot`) and its size in points.
 */
export function textBoxCorners(a) {
  const rad = (a.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const s = Math.round(Math.sin(rad));
  // Screen "right" and "down" directions expressed in user space for view rotation rot.
  const right = [c, s];
  const down = [s, -c];
  const p = (dx, dy) => [a.x + right[0] * dx + down[0] * dy, a.y + right[1] * dx + down[1] * dy];
  return [p(0, 0), p(a.w, 0), p(0, a.h), p(a.w, a.h)];
}

export function textBoxRect(a) {
  const pts = textBoxCorners(a);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Build the final PDF from the base bytes and the edit model.
 * model.pages: [{ src, rot, annots }] in document order (pages can only be removed, never reordered).
 */
/** Appearance for a signature: the PNG drawn into the w x h box, rotated like text boxes. */
function signatureAP(ctx, a, image) {
  const rad = (a.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const s = Math.round(Math.sin(rad));
  const ops = [
    pushGraphicsState(),
    PDFLib.concatTransformationMatrix(a.w, 0, 0, a.h, 0, 0),
    PDFLib.drawObject('Sig0'),
    popGraphicsState(),
  ];
  const stream = ctx.formXObject(ops, {
    BBox: [0, 0, a.w, a.h],
    Matrix: [c, s, -s, c, 0, 0],
    Resources: { XObject: { Sig0: image.ref } },
  });
  return ctx.register(stream);
}

function inkAP(ctx, a) {
  const pad = a.width / 2 + 1;
  const [x0, y0, x1, y1] = pathsBBox(a.paths);
  const rect = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const ops = [
    pushGraphicsState(),
    setStrokingRgbColor(...a.color),
    setLineWidth(a.width),
    PDFLib.setLineCap(PDFLib.LineCapStyle.Round),
    PDFLib.setLineJoin(PDFLib.LineJoinStyle.Round),
  ];
  for (const p of a.paths) {
    let cx = 0, cy = 0;
    tracePath(p, {
      moveTo: (x, y) => { ops.push(moveTo(x, y)); cx = x; cy = y; },
      lineTo: (x, y) => { ops.push(lineTo(x, y)); cx = x; cy = y; },
      // quadratic -> cubic Bezier
      quadTo: (qx, qy, x, y) => {
        ops.push(appendBezierCurve(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y));
        cx = x; cy = y;
      },
    });
    ops.push(stroke());
  }
  ops.push(popGraphicsState());
  return { ref: ctx.register(ctx.formXObject(ops, { BBox: rect })), rect };
}

const dataUrlBytes = (u) => Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), (ch) => ch.charCodeAt(0));

export async function buildPdf(baseBytes, model, author, getImage = () => null) {
  const doc = await PDFDocument.load(baseBytes, { updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  const fonts = {};
  const images = {}; // image id -> embedded PDFImage
  const now = PDFString.fromDate(new Date());
  const authorStr = PDFHexString.fromText(author || 'PDFacil');

  for (const mp of model.pages) {
    const page = pages[mp.src];
    if (mp.rot) page.setRotation(degrees((page.getRotation().angle + mp.rot) % 360));
    for (const a of mp.annots) {
      let dict;
      if (a.type === 'highlight') {
        const ap = highlightAP(ctx, a);
        dict = ctx.obj({
          Type: 'Annot', Subtype: 'Highlight', Rect: ap.rect, QuadPoints: a.quads.flat(),
          C: a.color, CA: 1, F: 4, AP: { N: ap.ref },
        });
        if (a.contents) dict.set(PDFName.of('Contents'), PDFHexString.fromText(a.contents));
      } else if (a.type === 'note') {
        const rect = [a.x - 10, a.y - 10, a.x + 10, a.y + 10];
        dict = ctx.obj({
          Type: 'Annot', Subtype: 'Text', Rect: rect, C: a.color, Name: 'Comment', F: 4,
          Open: false, AP: { N: noteAP(ctx, a.color) },
        });
        dict.set(PDFName.of('Contents'), PDFHexString.fromText(a.contents || ''));
      } else if (a.type === 'text') {
        if (!a.text.trim()) continue;
        const f = fontOf(a);
        fonts[f.std] ||= await doc.embedFont(StandardFonts[f.std]);
        const font = fonts[f.std];
        const [r, g, b] = a.color;
        dict = ctx.obj({
          Type: 'Annot', Subtype: 'FreeText', Rect: textBoxRect(a), F: 4,
          BS: { W: 0 }, Border: [0, 0, 0],
          AP: { N: textAP(ctx, a, font, f.res) },
        });
        dict.set(PDFName.of('DA'), PDFString.of(`/${f.res} ${a.size} Tf ${r} ${g} ${b} rg`));
        dict.set(PDFName.of('Contents'), PDFHexString.fromText(a.text));
        if (a.rot) dict.set(PDFName.of('Rotate'), PDFNumber.of(a.rot));
      } else if (a.type === 'ink') {
        if (!a.paths?.length) continue;
        const ap = inkAP(ctx, a);
        dict = ctx.obj({
          Type: 'Annot', Subtype: 'Ink', Rect: ap.rect, F: 4, C: a.color,
          InkList: a.paths.map((p) => p.map((v) => Math.round(v * 100) / 100)),
          BS: { W: a.width, S: 'S' }, AP: { N: ap.ref },
        });
      } else if (a.type === 'sig') {
        const url = getImage(a.imgId);
        if (!url) continue;
        images[a.imgId] ||= await doc.embedPng(dataUrlBytes(url));
        dict = ctx.obj({
          Type: 'Annot', Subtype: 'Stamp', Name: 'PDFacilSignature', Rect: textBoxRect(a), F: 4,
          AP: { N: signatureAP(ctx, a, images[a.imgId]) },
        });
        dict.set(PDFName.of('Contents'), PDFHexString.fromText('Signature'));
        if (a.rot) dict.set(PDFName.of('Rotate'), PDFNumber.of(a.rot));
      } else continue;
      dict.set(PDFName.of('T'), authorStr);
      dict.set(PDFName.of('M'), now);
      dict.set(PDFName.of('NM'), PDFString.of(a.id));
      dict.set(PDFName.of('P'), page.ref);
      const copy = { ...a };
      delete copy.id;
      if (a.type === 'sig') {
        // Keep the original picture in a private stream so the signature stays editable when reopened.
        delete copy.imgId;
        dict.set(PDFName.of(IMG_KEY), ctx.register(ctx.flateStream(dataUrlBytes(getImage(a.imgId)))));
      }
      dict.set(PDFName.of(MARK), PDFHexString.fromText(JSON.stringify(copy)));
      page.node.addAnnot(ctx.register(dict));
    }
  }

  // Remove deleted pages (highest index first so indices stay valid).
  const kept = new Set(model.pages.map((p) => p.src));
  for (let i = pages.length - 1; i >= 0; i--) if (!kept.has(i)) doc.removePage(i);

  return doc.save();
}
