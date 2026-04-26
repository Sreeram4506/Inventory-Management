/**
 * Render calibration PDF to PNG for visual inspection.
 * Run: node server/scratch/render-calibration.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const pdfBuffer = await readFile(new URL('./calibration-output.pdf', import.meta.url));
const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true, disableFontFace: true });
const doc = await loadingTask.promise;
const page = await doc.getPage(1);

const scale = 2.0;
const viewport = page.getViewport({ scale });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const context = canvas.getContext('2d');

const canvasFactory = {
  create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
  destroy: (t) => { t.canvas.width = 0; t.canvas.height = 0; },
};

await page.render({ canvasContext: context, viewport, canvasFactory }).promise;

const pngBuffer = canvas.toBuffer('image/png');
const outPath = new URL('./calibration-output.png', import.meta.url);
await writeFile(outPath, pngBuffer);
console.log('✅ PNG written to server/scratch/calibration-output.png');
console.log(`   Dimensions: ${canvas.width}x${canvas.height}`);
