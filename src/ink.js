// PDFacil - freehand drawing ("ink") helpers shared by the screen, thumbnails and the PDF writer.
// A path is a flat array [x0, y0, x1, y1, ...].

export const PEN_COLORS = {
  black: [0.07, 0.07, 0.07],
  red: [0.78, 0.16, 0.16],
  blue: [0.1, 0.37, 0.82],
  green: [0.18, 0.49, 0.2],
  yellow: [0.98, 0.66, 0.15],
  purple: [0.48, 0.12, 0.64],
};
// Line widths in PDF points.
export const PEN_WIDTHS = [
  { key: 'thin', label: 'Thin', w: 1 },
  { key: 'medium', label: 'Medium', w: 2 },
  { key: 'thick', label: 'Thick', w: 3.5 },
  { key: 'marker', label: 'Marker', w: 6 },
];

/** Ramer-Douglas-Peucker simplification of a flat point array. */
export function simplify(pts, eps) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs(dy * pts[2 * k] - dx * pts[2 * k + 1] + bx * ay - by * ax) / len;
      if (d > best) [best, bi] = [d, k];
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[2 * k], pts[2 * k + 1]);
  return out;
}

/**
 * Smooth a path through midpoints. Calls moveTo/quadTo/lineTo on the given sink,
 * so the same curve is used on screen, in thumbnails and in the PDF.
 */
export function tracePath(p, sink) {
  const n = p.length / 2;
  if (!n) return;
  sink.moveTo(p[0], p[1]);
  if (n === 1) {
    sink.lineTo(p[0] + 0.01, p[1]);
    return;
  }
  if (n === 2) {
    sink.lineTo(p[2], p[3]);
    return;
  }
  for (let k = 1; k < n - 1; k++) {
    const mx = (p[2 * k] + p[2 * k + 2]) / 2;
    const my = (p[2 * k + 1] + p[2 * k + 3]) / 2;
    sink.quadTo(p[2 * k], p[2 * k + 1], mx, my);
  }
  sink.lineTo(p[2 * n - 2], p[2 * n - 1]);
}

/** SVG path data for a path already in screen coordinates. */
export function svgPathData(p) {
  let d = '';
  const f = (v) => Math.round(v * 10) / 10;
  tracePath(p, {
    moveTo: (x, y) => (d += `M${f(x)} ${f(y)}`),
    lineTo: (x, y) => (d += `L${f(x)} ${f(y)}`),
    quadTo: (cx, cy, x, y) => (d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`),
  });
  return d;
}

/** Distance from point (x, y) to the polyline p. */
export function distToPath(p, x, y) {
  let best = Infinity;
  const n = p.length / 2;
  if (n === 1) return Math.hypot(p[0] - x, p[1] - y);
  for (let k = 0; k < n - 1; k++) {
    const ax = p[2 * k], ay = p[2 * k + 1], bx = p[2 * k + 2], by = p[2 * k + 3];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return best;
}

export function pathsBBox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) {
    for (let k = 0; k < p.length; k += 2) {
      x0 = Math.min(x0, p[k]);
      x1 = Math.max(x1, p[k]);
      y0 = Math.min(y0, p[k + 1]);
      y1 = Math.max(y1, p[k + 1]);
    }
  }
  return [x0, y0, x1, y1];
}
