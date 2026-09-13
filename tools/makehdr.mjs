// Procedural neutral studio HDRI → Radiance RGBE (.hdr) with RLE scanlines.
// Lat-long mapping matches three.js: u = atan2(dir.z, dir.x)/(2π)+0.5 ; v = asin(dir.y)/π+0.5 (row 0 = top/zenith)
// Azimuth convention used below: az=0 → +Z (toward the default camera / phone front), az=90 → +X (viewer's right), az=180 → -Z (behind phone)
import fs from 'node:fs';
const [,, out, W = '1024', H = '512', preset = 'A'] = process.argv;
const w = +W, h = +H;
const rad = d => d * Math.PI / 180;
const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// Rect softbox in az/el space with soft edges. az width/height in degrees, feather in degrees.
function softbox(az, el, aw, eh, feather, intensity, tint = [1, 1, 1]) {
  return { az, el, aw, eh, feather, intensity, tint };
}
const presets = {
  A: {
    ambientTop: 0.10, ambientHorizon: 0.055, ambientBottom: 0.025,
    lights: [
      softbox(-35, 38, 70, 36, 14, 5.5),          // key: upper-left-front
      softbox(55, 8, 40, 48, 14, 1.4),            // fill: right
      softbox(0, 78, 220, 14, 8, 4.5),            // top strip: long highlight along phone edges
      softbox(180, 22, 60, 70, 18, 2.8),          // back rim (lights edges when viewing front)
      softbox(-120, 5, 30, 60, 14, 1.6),          // left rim
      softbox(0, -55, 200, 40, 20, 0.35),         // floor bounce
    ],
  },
  C: {
    ambientTop: 0.05, ambientHorizon: 0.03, ambientBottom: 0.015,
    lights: [
      softbox(-35, 35, 55, 30, 20, 3.0),          // key
      softbox(0, 80, 240, 8, 6, 5.0),             // top strip
      softbox(60, 5, 30, 45, 16, 0.8),            // fill right
      softbox(180, 25, 40, 60, 18, 2.0),          // back rim (becomes key for back view)
      softbox(-120, 0, 20, 50, 14, 1.2),          // left rim
      softbox(0, -55, 200, 40, 20, 0.15),         // floor bounce
    ],
  },
  D: {
    ambientTop: 0.03, ambientHorizon: 0.018, ambientBottom: 0.008,
    lights: [
      softbox(-35, 35, 45, 26, 18, 2.4),
      softbox(0, 80, 240, 7, 6, 4.0),
      softbox(60, 5, 26, 40, 16, 0.5),
      softbox(180, 25, 34, 54, 18, 1.5),
      softbox(-120, 0, 18, 46, 14, 0.9),
      softbox(0, -55, 200, 40, 20, 0.08),
    ],
  },
  B: {
    ambientTop: 0.14, ambientHorizon: 0.08, ambientBottom: 0.03,
    lights: [
      softbox(-30, 35, 80, 40, 18, 6.0),
      softbox(60, 10, 46, 52, 16, 1.8),
      softbox(0, 76, 240, 16, 8, 5.0),
      softbox(180, 20, 70, 76, 20, 3.2),
      softbox(-125, 0, 34, 64, 16, 1.9),
      softbox(0, -55, 200, 40, 20, 0.45),
    ],
  },
};
const P = presets[preset];
const px = new Float32Array(w * h * 3);
for (let y = 0; y < h; y++) {
  const v = 1 - (y + 0.5) / h;             // 1 = top
  const el = (v - 0.5) * 180;              // elevation in degrees
  for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w;
    const ang = (u - 0.5) * 360;           // three.js: u=0.5 → +X ; this angle is atan2(z,x)
    // convert to our az (0 → +Z, 90 → +X): dir = (cos ang, ·, sin ang); az = atan2(x, z) = atan2(cos ang, sin ang)
    let az = Math.atan2(Math.cos(rad(ang)), Math.sin(rad(ang))) * 180 / Math.PI;
    // ambient gradient
    let base = el > 0 ? P.ambientHorizon + (P.ambientTop - P.ambientHorizon) * smooth(el / 90)
                      : P.ambientHorizon + (P.ambientBottom - P.ambientHorizon) * smooth(-el / 90);
    let r = base, g = base, b = base;
    for (const L of P.lights) {
      let dAz = Math.abs(((az - L.az + 540) % 360) - 180);
      const dEl = Math.abs(el - L.el);
      // shrink azimuth distance near the poles so boxes stay roughly rectangular on the sphere
      dAz *= Math.cos(rad(Math.min(85, Math.abs(el))));
      const fa = 1 - smooth((dAz - L.aw / 2) / L.feather);
      const fe = 1 - smooth((dEl - L.eh / 2) / L.feather);
      const f = fa * fe;
      if (f > 0) { r += L.intensity * L.tint[0] * f; g += L.intensity * L.tint[1] * f; b += L.intensity * L.tint[2] * f; }
    }
    const i = (y * w + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }
}
// RGBE encode
function rgbe(r, g, b) {
  const m = Math.max(r, g, b);
  if (m < 1e-32) return [0, 0, 0, 0];
  let e = Math.ceil(Math.log2(m)); if (Math.pow(2, e) <= m) e += 1; // ensure m/2^e in (0.5,1]
  const s = 256 / Math.pow(2, e);
  return [Math.min(255, Math.floor(r * s)), Math.min(255, Math.floor(g * s)), Math.min(255, Math.floor(b * s)), e + 128];
}
const chunks = [Buffer.from(`#?RADIANCE\n# Atomic Phone neutral studio (procedural)\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'ascii')];
for (let y = 0; y < h; y++) {
  const line = [[], [], [], []];
  for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; const q = rgbe(px[i], px[i + 1], px[i + 2]); for (let c = 0; c < 4; c++) line[c].push(q[c]); }
  const outb = [2, 2, (w >> 8) & 0xff, w & 0xff];
  for (let c = 0; c < 4; c++) {
    const a = line[c]; let i = 0;
    while (i < w) {
      // find run
      let run = 1; while (i + run < w && run < 127 && a[i + run] === a[i]) run++;
      if (run >= 3) { outb.push(128 + run, a[i]); i += run; continue; }
      // literal: gather until a run of >=3 starts
      let j = i; while (j < w && j - i < 128) { let rr = 1; while (j + rr < w && rr < 3 && a[j + rr] === a[j]) rr++; if (rr >= 3) break; j++; }
      if (j === i) j = i + 1;
      outb.push(j - i); for (let k = i; k < j; k++) outb.push(a[k]); i = j;
    }
  }
  chunks.push(Buffer.from(outb));
}
fs.writeFileSync(out, Buffer.concat(chunks));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB', `${w}x${h}`, 'preset', preset);
