// Chart geometry from the Claude Design templates (Graph Templates.dc.html).
export const r1 = (v: number) => Math.round(v * 10) / 10;
/** The standard chart frame: viewBox 480×220, plot from x=34 over 432, baseline y=194, height 180. */
export const PL = 34, PW = 432, PH = 180, BASE = 194;

export function smooth(p: [number, number][]): string {
  if (!p.length) return '';
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${r1(b[0] + (c[0] - a[0]) / 6)},${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)},${r1(c[1] - (e[1] - b[1]) / 6)} ${c[0]},${c[1]}`;
  }
  return d;
}
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}
export const yTicks = (max: number, fmt: (v: number) => string) =>
  [0, 0.25, 0.5, 0.75, 1].map((k) => ({ y: r1(BASE - k * PH), l: fmt(max * k) }));
export const cumsum = (a: number[]) => a.reduce<number[]>((o, v) => (o.push((o[o.length - 1] || 0) + v), o), []);

export function spark(ser: number[], max: number, W: number, H: number, top: number) {
  const n = ser.length;
  const p = ser.map((v, i) => [r1(n > 1 ? (i * W) / (n - 1) : W / 2), r1(H - (v / (max || 1)) * (H - top))] as [number, number]);
  const line = smooth(p);
  return { line, area: `${line} L${W},${H} L0,${H} Z`, p };
}

export function radarGeom(vals: number[], labelsText: string[], cx: number, cy: number, R: number, lo: number) {
  const N = vals.length;
  const pt = (i: number, f: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    return [r1(cx + Math.cos(a) * R * f), r1(cy + Math.sin(a) * R * f)];
  };
  const idx = [...Array(N).keys()];
  const rings = [0.2, 0.4, 0.6, 0.8, 1].map((f) => idx.map((i) => pt(i, f).join(',')).join(' '));
  const spokes = idx.map((i) => { const [x, y] = pt(i, 1); return { x, y }; });
  const dots = vals.map((v, i) => { const [x, y] = pt(i, Math.max(0, v)); return { x, y, i }; });
  const labels = labelsText.map((t, i) => {
    const [x, y] = pt(i, 1 + lo);
    return { x, y, t, i, a: (Math.abs(x - cx) < 5 ? 'middle' : x < cx ? 'end' : 'start') as 'middle' | 'end' | 'start' };
  });
  return { cx, cy, rings, spokes, dots, poly: dots.map((d) => `${d.x},${d.y}`).join(' '), labels };
}

/** Equirectangular map frame used by the design's dot map (720×276). */
export const proj = (lon: number, lat: number): [number, number] => [(lon + 180) * 2, (80 - lat) * 2];

/** Country palette from the design (FR, DE, BE, GB, IT, ES, ZA, PT, CH). */
const ALLC = ['FR', 'DE', 'BE', 'GB', 'IT', 'ES', 'ZA', 'PT', 'CH'];
const CPAL = ['#f3dcb2', '#d8b07a', '#a97f50', '#e7dfd2', '#9d948a', '#76604a', '#c9a36b', '#5f5a52', '#e0bf8f'];
export const colorOf = (c: string) => CPAL[(ALLC.indexOf(c) < 0 ? ALLC.length + c.charCodeAt(0) : ALLC.indexOf(c)) % CPAL.length];
