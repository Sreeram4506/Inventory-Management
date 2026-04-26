import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const registryEntries = [
  {
    vin: '1G4GC5EG2AF235244', make: 'Buick', model: 'LaCrosse', year: '2010', color: 'Silver', mileage: '112250',
    purchasedFrom: 'McGovern GMC', purchaseDate: '2025-05-02',
    disposedTo: 'Peter Joseph Mullen', disposedAddress: '12 Vernon st', disposedCity: 'Norwood', disposedState: 'MA', disposedZip: '02062',
    disposedDate: '2025-06-06', disposedPrice: '5945.00', disposedDlNumber: 'S65595144', disposedDlState: 'MA'
  },
  {
    vin: 'JTDKN3DU9B1362964', make: 'Toyota', model: 'Prius', year: '2011', color: 'Blue', mileage: '125174',
    purchasedFrom: 'Bernardi Toyota-Scion', purchaseDate: '2025-03-14',
    disposedTo: 'Nanci Haze', disposedAddress: '19 Blanchard Rd', disposedCity: 'SCITUATE', disposedState: 'MA', disposedZip: '02066',
    disposedDate: '2025-05-28', disposedPrice: '11710.38', disposedDlNumber: 'N/A', disposedDlState: 'MA'
  },
  {
    vin: '2T1BU4EEXCC883365', make: 'Toyota', model: 'Corolla LE', year: '2012', color: 'Silver', mileage: '131575',
    purchasedFrom: "Linder's INC", purchaseDate: '2025-01-30'
  },
  {
    vin: '4T1BF1FK9EU446777', make: 'Toyota', model: 'Camry LE', year: '2014', color: 'Gray', mileage: '98989',
    purchasedFrom: 'Toyota of Colchester', purchaseDate: '2024-08-29',
    disposedTo: 'Chase Laraia Abbott', disposedAddress: '1 Deer Run', disposedCity: 'Charlton', disposedState: 'MA', disposedZip: '01507',
    disposedDate: '2025-02-25', disposedPrice: '13448.00'
  },
  {
    vin: 'KNAFK4A68G5471659', make: 'Kia', model: 'Forte LX', year: '2016', color: 'Red', mileage: '110595',
    purchasedFrom: "Ron Bouchard's Auto Sales INC", purchaseDate: '2025-06-03',
    disposedTo: 'Maikel M Abdelmalak', disposedAddress: '7 Dailey St', disposedCity: 'Attleboro', disposedState: 'MA', disposedZip: '02703',
    disposedDate: '2025-06-23', disposedPrice: '6507.00', disposedDlNumber: 'SA9341711', disposedDlState: 'MA'
  },
  {
    vin: 'JTDKN3DU8E0384819', make: 'Toyota', model: 'Prius', year: '2014', color: 'Black', mileage: '136623',
    purchasedFrom: 'Unknown', purchaseDate: '2025-06-01',
    disposedTo: 'Ghaly Mahrous Ghaly', disposedAddress: '2519 Francis Ave', disposedCity: 'Mansfield', disposedState: 'MA', disposedZip: '02048',
    disposedDate: '2025-06-30', disposedPrice: '7500.00', disposedDlNumber: 'S26846616', disposedDlState: 'MA'
  },
  {
    vin: '1C4PJMAK5CW109915', make: 'Jeep', model: 'Liberty Sport', year: '2012', color: 'Silver', mileage: '91839',
    purchasedFrom: 'Colonial Volkswagen', purchaseDate: '2024-08-30',
    disposedTo: 'Patricia Ann Rockensies', disposedAddress: '69 hawthrone st', disposedCity: 'wetwood', disposedState: 'MA', disposedZip: '02090',
    disposedDate: '2025-03-19', disposedPrice: '8820.00', disposedDlNumber: 'S18859310', disposedDlState: 'MA'
  },
  {
    vin: 'WDDGF4HB2DA809211', make: 'Mercedes-Benz', model: 'C250', year: '2013', color: 'Red', mileage: '77194',
    purchasedFrom: 'CarMax - Westborough', purchaseDate: '2024-08-19',
    disposedTo: 'Felix Numero', disposedAddress: '9 Standard St', disposedCity: 'Boston', disposedState: 'MA', disposedZip: '02126',
    disposedDate: '2024-12-28', disposedPrice: '12869.63'
  },
  {
    vin: 'JTDBT4K33A4072187', make: 'Toyota', model: 'Yaris', year: '2010', color: 'Silver', mileage: '164348',
    purchasedFrom: 'Bernardi Toyota-Scion', purchaseDate: '2025-03-14',
    disposedTo: 'Ashley Marie Torres Rodriguez', disposedAddress: '114 moreland st', disposedCity: 'Roxbury', disposedState: 'MA', disposedZip: '02119',
    disposedDate: '2025-06-02', disposedPrice: '4999.00'
  },
  {
    vin: '5NPE24AF5GH338985', make: 'Hyundai', model: 'Sonata', year: '2016', color: 'Black', mileage: '91761',
    purchasedFrom: 'McGovern Hyundai Route 93', purchaseDate: '2024-12-20',
    disposedTo: 'James Thomas Sanders, JR', disposedAddress: '74 Orchardhill', disposedCity: 'Bosotn', disposedState: 'MA', disposedZip: '02130',
    disposedDate: '2025-03-31', disposedPrice: '10000.00', disposedDlNumber: 'S23092488', disposedDlState: 'MA'
  },
  {
    vin: 'JF2SJAEC3EH502817', make: 'Subaru', model: 'Forester', year: '2014', color: 'Cherry Red', mileage: '133029',
    purchasedFrom: 'Unknown', purchaseDate: '2025-09-01',
    disposedTo: 'Gregory Paul Hughes', disposedAddress: '165 Marlboro', disposedCity: 'quincy', disposedState: 'MA', disposedZip: '02170',
    disposedDate: '2025-09-27', disposedPrice: '9006.50', disposedDlNumber: 'S44074701', disposedDlState: 'MA'
  },
  {
    vin: '3FADP4EJ5DM191087', make: 'Ford', model: 'Fiesta', year: '2013', color: 'Red', mileage: '64680',
    purchasedFrom: 'Manheim New England', purchaseDate: '2024-12-10',
    disposedTo: 'Emerson Orlando Del Cuadro Mori', disposedAddress: '30 Press Ave', disposedCity: 'Norwood', disposedState: 'MA', disposedZip: '02062',
    disposedDate: '2025-03-08', disposedPrice: '7416.00', disposedDlNumber: 'SA7131050', disposedDlState: 'MA'
  },
  {
    vin: 'JHMGE8H32DC003644', make: 'Honda', model: 'Fit', year: '2013', color: 'Silver', mileage: '90787',
    purchasedFrom: 'CarMax - Westborough', purchaseDate: '2024-11-04',
    disposedTo: 'Bruce M Simone', disposedAddress: '33 New London Tpke', disposedCity: 'Wyoming', disposedState: 'RI', disposedZip: '02898',
    disposedDate: '2025-02-25', disposedPrice: '12077.71'
  },
  {
    vin: '1FADP3F25DL227699', make: 'Ford', model: 'Focus', year: '2013', color: 'Gray', mileage: '117259',
    purchasedFrom: 'Unknown', purchaseDate: '2025-01-01',
    disposedTo: 'Diana Carolina Abad Navarrete', disposedAddress: '18 South Gate park', disposedCity: 'Newton', disposedState: 'MA', disposedZip: '02465',
    disposedDate: '2025-01-16', disposedPrice: '6650.00'
  }
];

async function syncRegistry() {
  console.log('Syncing Document Registry...');
  for (const entry of registryEntries) {
    await prisma.documentRegistry.upsert({
      where: { id: entry.vin }, // We'll just use VIN as a unique id for this script's simplicity or find by VIN
      create: {
        ...entry,
        documentBase64: 'placeholder'
      },
      update: {
        ...entry
      }
    }).catch(async () => {
        // Since id isn't VIN, we find by VIN
        const existing = await prisma.documentRegistry.findFirst({ where: { vin: entry.vin } });
        if (existing) {
            await prisma.documentRegistry.update({ where: { id: existing.id }, data: entry });
        } else {
            await prisma.documentRegistry.create({ data: { ...entry, documentBase64: 'placeholder' } });
        }
    });
  }
  console.log('Registry synced successfully.');
}

syncRegistry()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
