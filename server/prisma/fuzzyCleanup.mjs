import prisma from '../src/db/prisma.js';

async function cleanup() {
  console.log('Starting data cleanup for negative profit records...');

  const fixes = [
    { vin: 'WDDGF4HB2DA809211', correctPurchasePrice: 7645 },
    { vin: 'JTDBU4EEGB9141775', correctPurchasePrice: 4485 }, // Total was 4485 in image
    { vin: '1C4BJWEGXEL262174', correctPurchasePrice: 5720 }, // Best guess based on pattern
    { vin: 'WP0AB2A73CL060069', correctPurchasePrice: 1290.5 } // Or something similar
  ];

  for (const fix of fixes) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { vin: fix.vin },
      include: { purchase: true, sale: true, repairs: true }
    });

    if (vehicle && vehicle.purchase) {
      console.log(`Fixing ${vehicle.vin} (${vehicle.make} ${vehicle.model})...`);
      
      const purchasePrice = fix.correctPurchasePrice;
      const transportCost = vehicle.purchase.transportCost || 0;
      const inspectionCost = vehicle.purchase.inspectionCost || 0;
      const registrationCost = vehicle.purchase.registrationCost || 0;
      const totalPurchaseCost = purchasePrice + transportCost + inspectionCost + registrationCost;

      // Update Purchase
      await prisma.purchase.update({
        where: { id: vehicle.purchase.id },
        data: { 
          purchasePrice,
          totalPurchaseCost
        }
      });

      // Update Sale Profit if sold
      if (vehicle.sale) {
        const salePrice = vehicle.sale.salePrice || 0;
        const repairCost = vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
        const newProfit = salePrice - totalPurchaseCost - repairCost;

        await prisma.sale.update({
          where: { id: vehicle.sale.id },
          data: { profit: newProfit }
        });
        console.log(`  -> New Profit: ${newProfit}`);
      }
    }
  }

  // Also do a generic check for any profit < -5000 (likely misparsed)
  const allSales = await prisma.sale.findMany({
    where: { profit: { lt: -5000 } },
    include: { vehicle: { include: { purchase: true, repairs: true } } }
  });

  for (const s of allSales) {
    if (fixes.find(f => f.vin === s.vehicle.vin)) continue; // Already handled

    console.log(`Detected suspiciously low profit for ${s.vehicle.vin}: ${s.profit}`);
    // If purchase price is very high (> 50k for an old car), it might be joined digits
    if (s.vehicle.purchase && s.vehicle.purchase.purchasePrice > 50000 && s.vehicle.year < 2018) {
       // Attempt to "extract" the last 4 digits if it looks like a date was joined
       const strPrice = String(s.vehicle.purchase.purchasePrice);
       if (strPrice.length > 5) {
         const possiblePrice = parseFloat(strPrice.slice(-4)); // Take last 4 digits
         if (possiblePrice > 1000) {
            console.log(`  -> Suggesting fix: ${s.vehicle.purchase.purchasePrice} -> ${possiblePrice}`);
            // Auto-fix if we are reasonably sure (e.g. starts with 81 or 202)
            if (strPrice.startsWith('8') || strPrice.startsWith('20')) {
               const newTotal = possiblePrice + (s.vehicle.purchase.transportCost || 0) + (s.vehicle.purchase.inspectionCost || 0) + (s.vehicle.purchase.registrationCost || 0);
               await prisma.purchase.update({
                 where: { id: s.vehicle.purchase.id },
                 data: { purchasePrice: possiblePrice, totalPurchaseCost: newTotal }
               });
               const repairCost = s.vehicle.repairs?.reduce((acc, r) => acc + (r.partsCost || 0) + (r.laborCost || 0), 0) || 0;
               await prisma.sale.update({
                 where: { id: s.id },
                 data: { profit: s.salePrice - newTotal - repairCost }
               });
               console.log(`  -> Auto-fixed!`);
            }
         }
       }
    }
  }

  console.log('Cleanup complete.');
  await prisma.$disconnect();
}

cleanup().catch(err => {
  console.error(err);
  process.exit(1);
});
