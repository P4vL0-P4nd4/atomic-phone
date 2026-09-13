import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'node:fs';
const OUT = new URL('../posters', import.meta.url).pathname;
const models = ['one-black-turquoise','one-white-pink','one-white-black','one-black-white','one-black-red','one-gold-green','one-s-black-turquoise','one-s-white-black','one-s-white-pink','one-xs-black-turquoise','one-xs-white-black','one-xs-white-pink'];
const views = { hero: ['-152deg 80deg auto', 'auto auto auto'] };
const browser = await puppeteer.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 });
for (const m of models) for (const [vname, [o, t]] of Object.entries(views)) {
  await page.goto(`http://127.0.0.1:8765/tools/_poster.html?m=${m}&o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => new Promise(r => { const mv = document.getElementById('mv'); if (mv.loaded) r(); else mv.addEventListener('load', r, { once: true }); }));
  await new Promise(r => setTimeout(r, 2500));
  const dataUrl = await page.evaluate(() => window.capture());
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const meta = await sharp(buf).metadata();
  const suffix = vname === 'hero' ? '' : `-${vname}`;
  await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 90 }).toFile(`${OUT}/${m}${suffix}.webp`);
  await sharp(buf).resize({ width: 360, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 85 }).toFile(`${OUT}/${m}${suffix}-thumb.webp`);
  console.log(m, vname, `${meta.width}x${meta.height}`, '→', (fs.statSync(`${OUT}/${m}${suffix}.webp`).size / 1024).toFixed(0) + 'KB');
}
await browser.close();
