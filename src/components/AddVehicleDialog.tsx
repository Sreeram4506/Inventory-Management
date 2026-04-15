import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';
import { toast } from '@/components/ui/toast-utils';
import { useAuth } from '@/context/auth-hooks';
import DocumentUpload from './DocumentUpload';
import { FileDown, FileCheck, CheckCircle2 } from 'lucide-react';
import { ExtractedVehicleDocumentInfo, Vehicle } from '@/types/inventory';

interface AddVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewExisting?: (id: string, vin: string) => void;
}

const createInitialFormData = () => ({
  vin: '',
  make: '',
  model: '',
  year: '',
  mileage: '',
  color: '',
  purchaseDate: '',
  purchasedFrom: 'Auction',
  purchasePrice: '',
  paymentMethod: 'Bank Transfer',
  transportCost: '0',
  repairCost: '0',
  inspectionCost: '0',
  registrationCost: '0',
});

const paymentMethodOptions = ['Cash', 'Check', 'Bank Transfer'] as const;

function normalizePurchaseSource(value?: string) {
  const normalized = value?.trim().toLowerCase() || '';

  if (!normalized) {
    return 'Auction';
  }

  if (/(auction|copart|iaai|manheim|acv)/i.test(normalized)) {
    return 'Auction';
  }

  if (/(individual|private|person|owner)/i.test(normalized)) {
    return 'Individual';
  }

  return 'Dealer';
}

function normalizePaymentMethod(value?: string) {
  const match = paymentMethodOptions.find((option) => option.toLowerCase() === value?.trim().toLowerCase());
  return match || 'Bank Transfer';
}

export default function AddVehicleDialog({ open, onOpenChange, onViewExisting }: AddVehicleDialogProps) {
  const { addVehicle } = useInventory();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  // Form States
  const [formData, setFormData] = useState(createInitialFormData);
  const [pdfData, setPdfData] = useState<{ base64: string; fileName: string } | null>(null);

  const resetForm = () => {
    setFormData(createInitialFormData());
    setPdfData(null);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleScanComplete = (
    info: ExtractedVehicleDocumentInfo, 
    pdfInfo?: { base64: string; fileName: string }
  ) => {
    setFormData(prev => ({
      ...prev,
      vin: info.vin || prev.vin,
      make: info.make || prev.make,
      model: info.model || prev.model,
      year: info.year ? String(info.year) : prev.year,
      mileage: info.mileage ? String(info.mileage) : prev.mileage,
      color: info.color || prev.color,
      purchasePrice: info.purchasePrice ? String(info.purchasePrice) : prev.purchasePrice,
      purchasedFrom: normalizePurchaseSource(info.purchasedFrom || prev.purchasedFrom),
      purchaseDate: info.purchaseDate ? info.purchaseDate.split('T')[0] : prev.purchaseDate,
      paymentMethod: normalizePaymentMethod(info.paymentMethod || prev.paymentMethod),
      // Fill additional cost fields
      transportCost: info.transportCost ? String(info.transportCost) : prev.transportCost,
      repairCost: info.repairCost ? String(info.repairCost) : prev.repairCost,
      inspectionCost: info.inspectionCost ? String(info.inspectionCost) : prev.inspectionCost,
      registrationCost: info.registrationCost ? String(info.registrationCost) : prev.registrationCost,
    }));

    if (pdfInfo) {
      setPdfData(pdfInfo);
    }
  };

  const currentDownloadPdf = () => {
    if (!pdfData) return;
    
    const binary = window.atob(pdfData.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfData.fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('Used Vehicle Record downloaded.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const purchasePrice = parseFloat(formData.purchasePrice);
      const transportCost = parseFloat(formData.transportCost || '0');
      const repairCost = parseFloat(formData.repairCost || '0');
      const inspectionCost = parseFloat(formData.inspectionCost || '0');
      const registrationCost = parseFloat(formData.registrationCost || '0');

      await addVehicle({
        ...formData,
        year: parseInt(formData.year),
        mileage: parseInt(formData.mileage),
        purchasePrice,
        transportCost,
        repairCost,
        inspectionCost,
        registrationCost,
        totalPurchaseCost: purchasePrice + transportCost + repairCost + inspectionCost + registrationCost,
        documentBase64: pdfData?.base64 || null,
        status: 'Available',
      } as Partial<Vehicle>);
      
      toast.success('Vehicle added successfully');
      handleDialogChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add vehicle';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-900 text-white selection:bg-profit/30">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-white">Add New Vehicle</DialogTitle>
          <DialogDescription className="sr-only">Add a new vehicle manually or scan a document to push into inventory.</DialogDescription>
          <p className="text-zinc-400 text-sm">Fill in the details manually or use our AI scanner.</p>
        </DialogHeader>

        {/* Document Upload / Photo Section */}
        <div className="mb-6">
          <DocumentUpload onScanComplete={handleScanComplete} onViewExisting={onViewExisting} token={token} />
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Vehicle Details */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-profit uppercase tracking-wider">Vehicle Details</h3>
              {pdfData && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={currentDownloadPdf}
                  className="h-8 text-profit hover:text-profit-hover hover:bg-profit/10 gap-2 text-xs"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Download Filled Record
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">VIN Number</Label>
                <Input name="vin" value={formData.vin} onChange={handleInputChange} placeholder="Enter VIN" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Make</Label>
                <Input name="make" value={formData.make} onChange={handleInputChange} placeholder="e.g. Honda" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Model</Label>
                <Input name="model" value={formData.model} onChange={handleInputChange} placeholder="e.g. Civic" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Year</Label>
                <Input name="year" value={formData.year} onChange={handleInputChange} type="number" placeholder="2024" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Mileage</Label>
                <Input name="mileage" value={formData.mileage} onChange={handleInputChange} type="number" placeholder="0" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Color</Label>
                <Input name="color" value={formData.color} onChange={handleInputChange} placeholder="e.g. Silver" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
            </div>
          </div>

          {/* Purchase Details */}
          <div>
            <h3 className="font-semibold text-sm text-profit uppercase tracking-wider mb-3">Purchase Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Purchase Date</Label>
                <Input name="purchaseDate" value={formData.purchaseDate} onChange={handleInputChange} type="date" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Purchased From</Label>
                <Select onValueChange={(v) => handleSelectChange('purchasedFrom', v)} value={formData.purchasedFrom}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select source">{formData.purchasedFrom || 'Select source'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectItem value="Dealer">Dealer</SelectItem>
                    <SelectItem value="Auction">Auction</SelectItem>
                    <SelectItem value="Individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Purchase Price ($)</Label>
                <Input name="purchasePrice" value={formData.purchasePrice} onChange={handleInputChange} type="number" placeholder="0" required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Payment Method</Label>
                <Select onValueChange={(v) => handleSelectChange('paymentMethod', v)} value={formData.paymentMethod}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select method">{formData.paymentMethod || 'Select method'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Check">Check</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Additional Costs */}
          <div>
            <h3 className="font-semibold text-sm text-profit uppercase tracking-wider mb-3">Additional Costs</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Transport Cost ($)</Label>
                <Input name="transportCost" value={formData.transportCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Repair Cost ($)</Label>
                <Input name="repairCost" value={formData.repairCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Inspection Cost ($)</Label>
                <Input name="inspectionCost" value={formData.inspectionCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Registration Cost ($)</Label>
                <Input name="registrationCost" value={formData.registrationCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} className="border-zinc-700 text-zinc-300">Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-profit hover:bg-profit-hover text-black">
              {loading ? 'Adding...' : 'Add Vehicle'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
