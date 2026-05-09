import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractVehicleInfo } from '../services/documentParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testParser() {
  const imagePath = 'C:\\Users\\SREER\\.gemini\\antigravity\\brain\\bc650a43-b05a-45cc-ab9b-c9ad6e7f2218\\media__1778276218786.png';
  console.log(`Testing parser on ${imagePath}`);
  
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found at path');
    return;
  }
  
  const buffer = fs.readFileSync(imagePath);
  try {
    const info = await extractVehicleInfo(buffer, 'image/png');
    console.log('Result:', JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('Error parsing:', e);
  }
}

testParser();
