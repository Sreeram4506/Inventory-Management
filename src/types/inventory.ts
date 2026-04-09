export type VehicleStatus = 'Available' | 'Reserved' | 'Sold' | 'Returned';
export type PaymentMethod = 'Cash' | 'Check' | 'Bank Transfer' | 'Loan';
export type PurchaseSource = 'Dealer' | 'Auction' | 'Individual';

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  color: string;
  purchaseDate: string;
  purchasedFrom: PurchaseSource;
  purchasePrice: number;
  paymentMethod: string;
  transportCost: number;
  repairCost: number;
  inspectionCost: number;
  registrationCost: number;
  totalPurchaseCost: number;
  status: VehicleStatus;
  daysInInventory: number;
  documentBase64?: string | null;
  repairs?: Repair[];
}

export interface ExtractedVehicleDocumentInfo extends Partial<Vehicle> {
  usedVehicleSourceName?: string;
  usedVehicleSourceAddress?: string;
  usedVehicleSourceCity?: string;
  usedVehicleSourceState?: string;
  usedVehicleSourceZipCode?: string;
}

export interface LoanDetails {
  financeCompany: string;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: number;
  monthlyPayment: number;
}

export interface Sale {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle; // Nested vehicle object
  customerName: string;
  phone: string;
  address: string;
  driverLicense?: string;
  saleDate: string;
  salePrice: number;
  paymentMethod: PaymentMethod;
  loanDetails?: LoanDetails;
  profit: number;
}

export interface AdvertisingExpense {
  id: string;
  campaignName: string;
  platform: string;
  startDate: string;
  endDate: string;
  amountSpent: number;
  linkedVehicleId?: string;
}

export interface BusinessExpense {
  id: string;
  category: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface Repair {
  id: string;
  vehicleId: string;
  repairShop: string;
  partsCost: number;
  laborCost: number;
  description?: string;
  repairDate: string;
}
