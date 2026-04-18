import fs from 'fs';

const buf = fs.readFileSync(new URL('../used-vechile-report.jpeg', import.meta.url));
console.log('File size:', buf.length, 'bytes');
console.log('Is JPEG:', buf[0] === 0xFF && buf[1] === 0xD8);

// Parse JPEG markers to find SOF0 or SOF2 (contains dimensions)
let i = 2;
while (i < buf.length - 9) {
  if (buf[i] === 0xFF) {
    const marker = buf[i + 1];
    // SOF0=0xC0, SOF1=0xC1, SOF2=0xC2
    if (marker >= 0xC0 && marker <= 0xC2) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      console.log('Width:', w);
      console.log('Height:', h);
      console.log('Aspect ratio (w/h):', (w / h).toFixed(6));
      console.log('PDF Letter ratio (612/792):', (612 / 792).toFixed(6));
      console.log('Match:', Math.abs(w / h - 612 / 792) < 0.01 ? 'YES' : 'NO - coordinates will be skewed!');
      break;
    }
    // Skip to next marker  
    if (marker === 0xD8 || marker === 0xD9) {
      i += 2;
    } else {
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  } else {
    i++;
  }
}
