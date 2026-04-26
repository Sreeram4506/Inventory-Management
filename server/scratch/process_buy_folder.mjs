import fs from 'fs';
import path from 'path';
import { extractVehicleInfo } from '../services/documentParser.js';
import { fillUsedVehiclePdf } from '../services/usedVehiclePdfService.js';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const BUY_DIR = path.join(PROJECT_ROOT, 'public', 'buy');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'public', 'results');

async function processBuyFolder() {
  console.log('🚀 Starting Batch Process for public/buy...');

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const files = fs.readdirSync(BUY_DIR).filter(f => /\.(jpe?g|png|pdf)$/i.test(f));
  console.log(`found ${files.length} documents.`);

  const extraInstructions = "IMPORTANT: If the buyer or 'Disposed To' customer is 'Broadway Auto Sales' or any variation of it (e.g. Broadway Used Auto Sales Inc), please leave 'disposedTo' as null or empty. We only want to record a sale if it is to a DIFFERENT company or individual. If Broadway is listed, treat the vehicle as Available in inventory.";

  const results = [];

  for (const file of files) {
    const filePath = path.join(BUY_DIR, file);
    console.log(`\n📄 Processing: ${file}`);

    try {
      const buffer = fs.readFileSync(filePath);
      const mimetype = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      
      // 1. Extract Info
      const info = await extractVehicleInfo(buffer, mimetype, extraInstructions);
      
      if (!info || !info.vin) {
        console.warn(`⚠️ Could not extract VIN for ${file}, skipping.`);
        continue;
      }

      // 2. Generate PDF
      const pdfBase64 = await fillUsedVehiclePdf(buffer, info, mimetype);
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');

      // 3. Save Results
      const folderName = `${info.vin}_${Date.now()}`;
      const folderPath = path.join(RESULTS_DIR, folderName);
      fs.mkdirSync(folderPath, { recursive: true });

      const sourceExt = path.extname(file);
      fs.writeFileSync(path.join(folderPath, `source${sourceExt}`), buffer);
      fs.writeFileSync(path.join(folderPath, 'record.pdf'), pdfBuffer);

      results.push({
        fileName: file,
        vin: info.vin,
        vehicle: `${info.year || ''} ${info.make || ''} ${info.model || ''}`,
        source: `results/${folderName}/source${sourceExt}`,
        generated: `results/${folderName}/record.pdf`,
        buyer: info.disposedTo || 'None (Available)'
      });

      console.log(`✅ Success: ${info.vin}`);
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }

  // Save a summary for the UI/Walkthrough
  fs.writeFileSync(path.join(RESULTS_DIR, 'summary.json'), JSON.stringify(results, null, 2));
  console.log('\n✨ Batch Process Complete!');
  console.log(`Processed ${results.length} files successfully.`);
}

processBuyFolder();
