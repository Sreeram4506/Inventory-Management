import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isFuzzyMatch(vin1, vin2) {
  if (!vin1 || !vin2) return false;
  const v1 = vin1.toUpperCase();
  const v2 = vin2.toUpperCase();
  
  if (v1 === v2) return true;
  
  // Last 8 match
  if (v1.length >= 8 && v2.length >= 8) {
    if (v1.substring(v1.length - 8) === v2.substring(v2.length - 8)) return true;
  }
  
  // One character difference with common OCR swaps
  if (v1.length === v2.length) {
    const swaps = { '5': 'S', 'S': '5', '0': 'O', 'O': '0', '1': 'I', 'I': '1', 'B': '8', '8': 'B' };
    let diffs = 0;
    let matchWithSwaps = true;
    
    for (let i = 0; i < v1.length; i++) {
      if (v1[i] !== v2[i]) {
        diffs++;
        if (diffs > 1 || !swaps[v1[i]] || swaps[v1[i]] !== v2[i]) {
          matchWithSwaps = false;
          break;
        }
      }
    }
    if (diffs === 1 && matchWithSwaps) return true;
  }
  
  return false;
}

async function cleanupFuzzyDuplicates() {
  console.log('--- STARTING FUZZY REGISTRY CLEANUP ---');
  
  try {
    const allLogs = await prisma.documentRegistry.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Total entries: ${allLogs.length}`);
    
    const kept = [];
    const deleted = [];
    
    for (const log of allLogs) {
      const type = log.documentType || 'Used Vehicle Record';
      
      // Check if we already have a fuzzy match for this vehicle in 'kept'
      const duplicate = kept.find(k => 
        (k.documentType || 'Used Vehicle Record') === type && 
        isFuzzyMatch(k.vin, log.vin)
      );
      
      if (duplicate) {
        deleted.push(log.id);
        console.log(`Fuzzy Duplicate Found: ${log.vin} matches kept entry ${duplicate.vin}`);
      } else {
        kept.push(log);
      }
    }
    
    console.log(`Unique vehicles (kept): ${kept.length}`);
    console.log(`Duplicates to remove: ${deleted.length}`);
    
    if (deleted.length > 0) {
      const result = await prisma.documentRegistry.deleteMany({
        where: { id: { in: deleted } }
      });
      console.log(`Deleted ${result.count} fuzzy duplicates.`);
    } else {
      console.log('No fuzzy duplicates found.');
    }
    
    console.log('--- CLEANUP COMPLETE ---');
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupFuzzyDuplicates();
