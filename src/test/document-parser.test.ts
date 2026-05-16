import { describe, expect, it } from 'vitest';
import {
  cleanDispositionName,
  extractAcquisitionDetailsFromText,
  extractDispositionDetailsFromText,
  extractTitleFromText,
  extractTotalFromText,
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

  it('parses acquisition total due and ignores sale price lines', () => {
    const text = `
      Motor Vehicle Purchase Contract
      Sale Price: $23,000
      Buyer Fee: $1,200
      Total Due: $24,200
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(24200);
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

  it('extracts CarMax auction acquisition details without treating boilerplate purchaser text as disposition', () => {
    const text = `
      Wholesale Bill of Sale
      CarMax ("Seller") agrees to sell and Purchaser agrees to buy the vehicle identified below.
      Seller: CarMax - Westborough
      170 Turnpike Rd
      Westborough, MA 01581
      Purchaser hereby acknowledges that Purchaser has read the terms.
    `;

    const acquisition = extractAcquisitionDetailsFromText(text);
    const disposition = extractDispositionDetailsFromText(text);

    expect(acquisition.purchasedFrom).toBe('CarMax - Westborough');
    expect(acquisition.usedVehicleSourceAddress).toBe('170 Turnpike Rd');
    expect(acquisition.usedVehicleSourceCity).toBe('Westborough');
    expect(acquisition.usedVehicleSourceState).toBe('MA');
    expect(acquisition.usedVehicleSourceZipCode).toBe('01581');
    expect(disposition).toEqual({});
  });

  it('extracts CMAA facility details for acquisition', () => {
    const text = `
      CMAA BILL OF SALE AND TITLE WARRANTY
      Central Mass. Auto Auction
      12 Industrial Park East - Oxford, MA 01540
      Buyer Fee
      BROADWAY USED AUTO SALES INC
      100 BROADWAY
      NORWOOD, MA 02062
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('Central Mass. Auto Auction');
    expect(info.usedVehicleSourceAddress).toBe('12 Industrial Park East');
    expect(info.usedVehicleSourceCity).toBe('Oxford');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01540');
  });

  it('uses known auction details instead of seller details on ADESA documents', () => {
    const text = `
      Invoice to Buyer from ADESA Boston
      Buyer: Broadway Used Auto Sales Inc
      Seller: Bernardi Toyota-Scion
      Seller Address: 500 Worcester Road
      Framingham, MA 01702
      VIN 1HGCM82633A004352
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('ADESA Boston');
    expect(info.usedVehicleSourceAddress).toBe('63 Western Avenue');
    expect(info.usedVehicleSourceCity).toBe('Framingham');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01702');
  });

  it('extracts MA title transfer buyer details only when sale labels are present', () => {
    const text = `
      Print Name(s) of Purchaser(s) OL State DL Number
      Nathaniel Eli Kianovsky
      Address City State Zip Code
      127 Sydney Street Boston MA 02125
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Nathaniel Eli Kianovsky');
    expect(info.disposedAddress).toBe('127 Sydney Street');
    expect(info.disposedCity).toBe('Boston');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02125');
  });

  it('removes customer, license, phone, and date numbers from disposition names', () => {
    expect(cleanDispositionName('Nathaniel Eli Kianovsky 1/31/26 AHTL # 12345')).toBe('Nathaniel Eli Kianovsky');
    expect(cleanDispositionName('Buyer Name: Jane Customer DL Number S12345678 Phone 617-555-1212')).toBe('Jane Customer');
  });

  it('extracts ADESA title state/number without returning title heading words', () => {
    expect(extractTitleFromText('TITLE INFORMATION\nTitle State/Number: MA/BN355731 Certificate of Origin: No')).toBe('BN355731');
    expect(extractTitleFromText('TITLE INFORMATION\nTitle State/Number: MABT686155 Certificate of Origin: No')).toBe('BT686155');
    expect(extractTitleFromText('TITLE INFORMATION\nVehicle Information')).toBeNull();
  });

  it('extracts CMAA title numbers from State / Title # / VIN layouts', () => {
    expect(extractTitleFromText('State Title # V.I.N. No.\nMA CK320305 2T1BU4EEXCC883365')).toBe('CK320305');
    expect(extractTitleFromText('State | Title # | V.I.N. No.\nCT | AA2606042 1FMCU9JXXGUB02440')).toBe('AA2606042');
  });

  it('rejects title announcement words and warranty headings', () => {
    expect(extractTitleFromText('CMAA BILL OF SALE AND TITLE WARRANTY')).toBeNull();
    expect(extractTitleFromText('Announcements: TITLE ATTACHED')).toBeNull();
    expect(extractTitleFromText('Announcements: TITLE ABSENT STRUCTURAL DAMAGE')).toBeNull();
  });
});
