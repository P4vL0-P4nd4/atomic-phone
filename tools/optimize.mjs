import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, draco, flatten, join } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [,, inFile, outFile, opts = ''] = process.argv;
const keepTangents = !opts.includes('notangent') ? true : false;
const texSize = Number((opts.match(/tex=(\d+)/) || [])[1] || 2048);
const quality = Number((opts.match(/q=(\d+)/) || [])[1] || 88);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const doc = await io.read(inFile);
const root = doc.getRoot();

// Tag glass textures so they can be downsized further; normal maps get lossless-ish treatment.
const glassTex = new Set();
const normalTex = new Set();
for (const mat of root.listMaterials()) {
  const isGlass = /glass/i.test(mat.getName());
  for (const t of [mat.getBaseColorTexture(), mat.getMetallicRoughnessTexture(), mat.getOcclusionTexture(), mat.getEmissiveTexture()]) {
    if (t && isGlass) glassTex.add(t);
  }
  const n = mat.getNormalTexture();
  if (n) { normalTex.add(n); if (isGlass) glassTex.add(n); }
}

if (!keepTangents) {
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const t = prim.getAttribute('TANGENT'); if (t) { prim.setAttribute('TANGENT', null); }
  }
}

await doc.transform(dedup(), prune());

// Body textures (color/ORM/emissive) → WebP lossy at texSize
await doc.transform(textureCompress({
  encoder: sharp, targetFormat: 'webp', quality, effort: 6,
  resize: [texSize, texSize],
  slots: /^(baseColorTexture|metallicRoughnessTexture|occlusionTexture|emissiveTexture)$/,
}));
// Normal maps → WebP near-lossless (avoid blocky shading artifacts on the brushed metal)
await doc.transform(textureCompress({
  encoder: sharp, targetFormat: 'webp', quality: 95, nearLossless: true, effort: 6,
  resize: [texSize, texSize],
  slots: /^normalTexture$/,
}));
// Glass textures are almost featureless — halve them again
for (const t of glassTex) {
  const img = t.getImage(); if (!img) continue;
  const meta = await sharp(Buffer.from(img)).metadata();
  const target = Math.min(1024, meta.width);
  if (meta.width > target) {
    const buf = await sharp(Buffer.from(img)).resize(target, target).webp({ quality: 90, effort: 6 }).toBuffer();
    t.setImage(new Uint8Array(buf)).setMimeType('image/webp');
  }
}

await doc.transform(prune(), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 }));
await io.write(outFile, doc);
const inB = fs.statSync(inFile).size, outB = fs.statSync(outFile).size;
console.log(`${path.basename(outFile)}: ${(inB/1e6).toFixed(1)}MB → ${(outB/1e6).toFixed(2)}MB (${(100*outB/inB).toFixed(0)}%)  [tangents=${keepTangents} tex=${texSize} q=${quality}]`);
