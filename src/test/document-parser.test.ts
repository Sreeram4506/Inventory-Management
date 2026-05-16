import { describe, expect, it } from 'vitest';
import {
  extractAcquisitionDetailsFromText,
  extractDispositionDetailsFromText,
  extractVehicleInfoFromText
} from '../../server/services/documentParser.js';

describe('document parser fallback extraction', () => {
  it('parses OCR-style used vehicle record fields without dropping numeric zip values', () => {
    const text = `
      Mfrs. Model Year: 2015 Make: Honda Model: Fit LX Color: Gray
      Vehicle Ident. No. 1 H G C M 8 2 6 3 3 A 0 0 4 3 5 2
      Title No. BP239263

      Acquisition of Motor Vehicle/Part
      Obtained From (Source): BROADWAY USED AUTO SALES INC Transaction Date: 26-JUN-2025
      Address (number and street): 100 BROADWAY
      City or Town: NORWOOD State: MA Zip Code: 02062 Odometer In: 20000

      Disposition of Motor Vehicle/Part
      Transferred To: BROADWAY USED AUTO SALES INC Transaction Date: 26-JUN-2025
      Address (number and street): 100 BROADWAY
      City or Town: NORWOOD State: MA Zip Code: 02062 Odometer Out: 20000
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.vin).toBe('1HGCM82633A004352');
    expect(info.year).toBe(2015);
    expect(info.make).toBe('Honda');
    expect(info.model).toBe('Fit LX');
    expect(info.color).toBe('Gray');
    expect(info.titleNumber).toBe('BP239263');
    expect(info.purchasedFrom).toBe('BROADWAY USED AUTO SALES INC');
    expect(info.usedVehicleSourceAddress).toBe('100 BROADWAY');
    expect(info.usedVehicleSourceCity).toBe('NORWOOD');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('02062');
    expect(info.mileage).toBe(20000);
    expect(info.disposedTo).toBe('BROADWAY USED AUTO SALES INC');
    expect(info.disposedAddress).toBe('100 BROADWAY');
    expect(info.disposedCity).toBe('NORWOOD');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02062');
    expect(info.disposedOdometer).toBe(20000);
  });

  it('keeps state and zip when AI-style data sends zip as a number', () => {
    const text = `
      VIN: 1O4RJEAG0PC123456
      Year: 2023 Make: Jeep Model: Grand Cherokee Color: White
      Seller: Test Motors
      Address: 42 Market Street City: Boston State: MA Zip: 02118
      Buyer Name: Jane Customer Address: 9 Main Street City: Quincy State: MA Zip: 02169
      Odometer Reading: 18000 Sale Price: $28000
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.vin).toBe('104RJEAG0PC123456');
    expect(info.usedVehicleSourceZipCode).toBe('02118');
    expect(info.disposedZip).toBe('02169');
  });

  it('prefers auction facility details over Broadway buyer details for acquisitions', () => {
    const text = `
      ADESA Boston Bill of Sale
      Facility: ADESA Boston
      Address: 63 Western Avenue
      Framingham, MA 01702

      Buyer: Broadway Used Auto Sales Inc
      Address: 100 Broadway
      Norwood, MA 02062

      Seller: Bernardi Toyota-Scion
      VIN: 1HGCM82633A004352
      Total Due $5,785.00
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('ADESA Boston');
    expect(info.usedVehicleSourceAddress).toBe('63 Western Avenue');
    expect(info.usedVehicleSourceCity).toBe('Framingham');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01702');
  });

  it('extracts disposition buyer details from bill of sale text, not Broadway seller details', () => {
    const text = `
      Motor Vehicle Purchase Contract
      Dealer/Seller Name and Address: Broadway Used Auto Sales Inc
      100 Broadway
      Norwood, MA 02062

      Purchaser(s) Name(s) and Address(es): Jane Customer
      Address: 9 Main Street City: Quincy State: MA Zip: 02169
      Vehicle Sales Price: $12,500
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Jane Customer');
    expect(info.disposedAddress).toBe('9 Main Street');
    expect(info.disposedCity).toBe('Quincy');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02169');
  });
});
