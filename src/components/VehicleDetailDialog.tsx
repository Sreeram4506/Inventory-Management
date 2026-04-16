import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Vehicle } from '@/types/inventory';
import { useRepairs } from '@/hooks/useRepairs';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useSales } from '@/hooks/useSales';
import { toast } from '@/components/ui/toast-utils';
import { Pencil, Receipt, Megaphone, Info, Plus, FileText, Download, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VehicleDetailDialog({ vehicle, open, onOpenChange }: VehicleDetailDialogProps) {
  const { token } = useAuth();
  const { addRepair } = useRepairs();
  const { addAd } = useAdvertising();
  const { addSale } = useSales();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    make: '',
    model: '',
    year: '',
    vin: '',
    color: '',
    mileage: '',
    purchasedFrom: '',
    sellerAddress: '',
    sellerCity: '',
    sellerState: '',
    sellerZip: '',
    purchasePrice: '',
    transportCost: '',
    inspectionCost: '',
    registrationCost: '',
    titleNumber: '',
    purchaseDate: '',
  });

  const [repairForm, setRepairForm] = useState({
    shop: '',
    parts: '',
    labor: '',
    desc: '',
  });

  const [adForm, setAdForm] = useState({
    name: '',
    platform: 'Facebook',
    amount: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const [saleForm, setSaleForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    salePrice: '',
    saleDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
  });

  if (!vehicle) return null;

  const startEditing = () => {
    setEditForm({
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: String(vehicle.year || ''),
      vin: vehicle.vin || '',
      color: vehicle.color || '',
      mileage: String(vehicle.mileage || ''),
      purchasedFrom: vehicle.purchase?.sellerName || '',
      sellerAddress: vehicle.purchase?.sellerAddress || '',
      sellerCity: vehicle.purchase?.sellerCity || '',
      sellerState: vehicle.purchase?.sellerState || '',
      sellerZip: vehicle.purchase?.sellerZip || '',
      purchasePrice: String(vehicle.purchase?.purchasePrice || ''),
      transportCost: String(vehicle.purchase?.transportCost || ''),
      inspectionCost: String(vehicle.purchase?.inspectionCost || ''),
      registrationCost: String(vehicle.purchase?.registrationCost || ''),
      titleNumber: vehicle.titleNumber || '',
      purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split('T')[0] : '',
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(apiUrl(`/vehicles/${vehicle.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...editForm,
          year: parseInt(editForm.year),
          mileage: parseInt(editForm.mileage),
          purchasePrice: parseFloat(editForm.purchasePrice) || 0,
          transportCost: parseFloat(editForm.transportCost) || 0,
          inspectionCost: parseFloat(editForm.inspectionCost) || 0,
          registrationCost: parseFloat(editForm.registrationCost) || 0,
          titleNumber: editForm.titleNumber || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to update vehicle');
      }

      toast.success('Vehicle updated and PDF regenerated');
      setIsEditing(false);
      // We should ideally trigger a refresh of the vehicle list here.
      // For now, we'll suggest the user to refresh or rely on the parent component.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  };

  const handleRepairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addRepair({
        vehicleId: vehicle.id,
        repairShop: repairForm.shop,
        partsCost: parseFloat(repairForm.parts),
        laborCost: parseFloat(repairForm.labor),
        description: repairForm.desc,
      });
      toast.success('Repair cost added to vehicle inventory');
      setRepairForm({ shop: '', parts: '', labor: '', desc: '' });
    } catch (err) {
      toast.error('Failed to add repair cost');
    }
  };

  const handleAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAd({
        campaignName: adForm.name,
        platform: adForm.platform,
        amountSpent: parseFloat(adForm.amount),
        startDate: adForm.startDate,
        endDate: adForm.endDate,
        linkedVehicleId: vehicle.id,
      });
      toast.success('Advertising campaign linked to vehicle');
      setAdForm({ ...adForm, name: '', amount: '' });
    } catch (err) {
      toast.error('Failed to link advertising campaign');
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addSale({
        vehicleId: vehicle.id,
        customerName: saleForm.customerName,
        phone: saleForm.phone,
        address: saleForm.address,
        saleDate: saleForm.saleDate,
        salePrice: parseFloat(saleForm.salePrice),
        paymentMethod: saleForm.paymentMethod,
      });
      toast.success('Vehicle marked as sold!');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to record sale');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-900 text-foreground custom-scrollbar">
        <DialogHeader>
          <DialogDescription className="sr-only">Vehicle details and management tabs.</DialogDescription>
          <div className="flex items-start justify-between">
            <DialogTitle className="flex items-center gap-3 text-2xl font-black font-display tracking-tight text-white line-clamp-1">
              <span className="p-2 bg-profit/10 rounded-lg"><Info className="text-profit" /></span>
              {isEditing ? 'Editing Vehicle Record' : `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            </DialogTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={isEditing ? () => setIsEditing(false) : startEditing}
                className="border-profit/30 text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-profit/10"
              >
                {isEditing ? 'Cancel' : <><Pencil className="w-3.5 h-3.5 mr-2" /> Edit Details</>}
              </Button>
              {vehicle.hasDocument && !isEditing && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open(apiUrl(`/vehicles/${vehicle.id}/document?token=${token}`), '_blank')}
                  className="border-border/50 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-white/5"
                >
                  <Download className="w-3.5 h-3.5 mr-2" /> Download PDF
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground bg-secondary/30 px-3 py-1 rounded-full">
              VIN: {vehicle.vin}
            </span>
            {vehicle.titleNumber && (
              <span className="text-xs font-bold uppercase tracking-widest text-blue-300 bg-blue-500/10 px-3 py-1 rounded-full">
                Title #: {vehicle.titleNumber}
              </span>
            )}
            <span className="text-xs font-bold uppercase tracking-widest text-white/90 bg-profit/80 px-3 py-1 rounded-full">
               Total Cost: ${((vehicle.totalPurchaseCost || 0) + (vehicle.repairCost || 0)).toLocaleString()}
            </span>
          </div>
        </DialogHeader>

        <Tabs defaultValue={isEditing ? "edit" : "financials"} value={isEditing ? "edit" : undefined} className="mt-6">
          <TabsList className={`bg-secondary/20 border border-border/50 p-1 rounded-xl h-auto flex flex-wrap gap-1 ${isEditing ? 'hidden' : ''}`}>
            <TabsTrigger value="financials" className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 px-5 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest gap-2 transition-all">
              <Receipt className="w-3.5 h-3.5" /> Financials
            </TabsTrigger>
            <TabsTrigger value="repairs" className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 px-5 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest gap-2 transition-all">
              <Pencil className="w-3.5 h-3.5" /> Manage Repairs
            </TabsTrigger>
            <TabsTrigger value="ads" className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 px-5 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest gap-2 transition-all">
              <Megaphone className="w-3.5 h-3.5" /> Advertising
            </TabsTrigger>
            {vehicle.status !== 'Sold' && (
              <TabsTrigger value="sale" className="data-[state=active]:bg-info data-[state=active]:text-zinc-950 px-5 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest gap-2 transition-all">
                <ShoppingCart className="w-3.5 h-3.5" /> Record Sale
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="edit" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-6">
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-profit border-b border-profit/20 pb-2">Vehicle Details</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year</Label>
                       <Input value={editForm.year} onChange={e => setEditForm({...editForm, year: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Make</Label>
                       <Input value={editForm.make} onChange={e => setEditForm({...editForm, make: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Model</Label>
                       <Input value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Color</Label>
                       <Input value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mileage (In)</Label>
                       <Input type="number" value={editForm.mileage} onChange={e => setEditForm({...editForm, mileage: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">VIN</Label>
                       <Input value={editForm.vin} onChange={e => setEditForm({...editForm, vin: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Title Number</Label>
                       <Input value={editForm.titleNumber} onChange={e => setEditForm({...editForm, titleNumber: e.target.value})} placeholder="e.g. T-12345678" className="bg-zinc-900 border-blue-500/20 h-9 text-sm" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-profit border-b border-profit/20 pb-2">Purchase & Seller Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Seller Name (Obtained From)</Label>
                        <Input value={editForm.purchasedFrom} onChange={e => setEditForm({...editForm, purchasedFrom: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                     </div>
                     <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Seller Address</Label>
                        <Input value={editForm.sellerAddress} onChange={e => setEditForm({...editForm, sellerAddress: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                     </div>
                     <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">City</Label>
                        <Input value={editForm.sellerCity} onChange={e => setEditForm({...editForm, sellerCity: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                       <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">State</Label>
                          <Input value={editForm.sellerState} onChange={e => setEditForm({...editForm, sellerState: e.target.value})} maxLength={2} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                       </div>
                       <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Zip</Label>
                          <Input value={editForm.sellerZip} onChange={e => setEditForm({...editForm, sellerZip: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                       </div>
                     </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-profit border-b border-profit/20 pb-2">Purchase Breakdown (Financials)</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Purchase Price ($)</Label>
                       <Input type="number" value={editForm.purchasePrice} onChange={e => setEditForm({...editForm, purchasePrice: e.target.value})} className="bg-zinc-900 border-profit/20 h-9 text-sm font-bold text-profit" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Transport ($)</Label>
                       <Input type="number" value={editForm.transportCost} onChange={e => setEditForm({...editForm, transportCost: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Inspection ($)</Label>
                       <Input type="number" value={editForm.inspectionCost} onChange={e => setEditForm({...editForm, inspectionCost: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fees ($)</Label>
                       <Input type="number" value={editForm.registrationCost} onChange={e => setEditForm({...editForm, registrationCost: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Purchase Date</Label>
                       <Input type="date" value={editForm.purchaseDate} onChange={e => setEditForm({...editForm, purchaseDate: e.target.value})} className="bg-zinc-900 border-zinc-800 h-9 text-sm" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" className="flex-1 bg-profit text-zinc-950 font-black uppercase tracking-tighter h-12 hover:bg-profit/90">
                    Update Vehicle & Regenerate PDF
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="px-8 border-border h-12 uppercase font-black text-xs tracking-widest">
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="financials" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-secondary/10 border border-border/40 rounded-xl p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-profit">Purchase Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Purchase Price</span>
                    <span className="font-bold text-white">${vehicle.purchasePrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="font-bold text-white">${vehicle.transportCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Inspection</span>
                    <span className="font-bold text-white">${vehicle.inspectionCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Fees</span>
                    <span className="font-bold text-white">${vehicle.registrationCost.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40 flex justify-between text-sm">
                    <span className="font-black uppercase tracking-widest text-[10px] text-profit">Initial Total</span>
                    <span className="font-black text-profit">${vehicle.totalPurchaseCost.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-secondary/10 border border-border/40 rounded-xl p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-profit">Maintenance & Other</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Repair Total</span>
                    <span className="font-bold text-white">${(vehicle.repairs?.reduce((acc, r) => acc + r.partsCost + r.laborCost, 0) || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-border/20 pt-2 mt-2">
                    <span className="text-muted-foreground font-bold">Total Investment</span>
                    <span className="font-black text-white text-base">
                      ${(vehicle.totalPurchaseCost + (vehicle.repairs?.reduce((acc, r) => acc + r.partsCost + r.laborCost, 0) || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {vehicle.repairs && vehicle.repairs.length > 0 && (
              <div className="mt-4 bg-secondary/5 border border-border/20 rounded-xl p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Recent Repair History</h4>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {vehicle.repairs.map((repair) => (
                    <div key={repair.id} className="flex justify-between items-center text-[11px] bg-black/20 p-2 rounded-lg border border-white/5">
                      <div>
                        <p className="font-bold text-white">{repair.repairShop}</p>
                        <p className="text-muted-foreground italic">{repair.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-profit">${(repair.partsCost + repair.laborCost).toLocaleString()}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">{new Date(repair.repairDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vehicle.status === 'Sold' && (
              <div className="mt-4 bg-info/5 border border-info/20 rounded-xl p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-info mb-3">Buyer Information</h4>
                <BuyerInfoSection vehicleId={vehicle.id} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="repairs" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-profit">Add Post-Purchase Repair</h4>
              <form onSubmit={handleRepairSubmit} className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Repair Shop<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    value={repairForm.shop} 
                    onChange={e => setRepairForm({...repairForm, shop: e.target.value})}
                    placeholder="e.g. Master Auto" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Parts Cost ($)<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    type="number" value={repairForm.parts} 
                    onChange={e => setRepairForm({...repairForm, parts: e.target.value})}
                    placeholder="0.00" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Labor Cost ($)<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    type="number" value={repairForm.labor} 
                    onChange={e => setRepairForm({...repairForm, labor: e.target.value})}
                    placeholder="0.00" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Description</Label>
                  <Input 
                    value={repairForm.desc} 
                    onChange={e => setRepairForm({...repairForm, desc: e.target.value})}
                    placeholder="Brief description" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <Button className="col-span-2 bg-profit text-zinc-950 font-black h-11 uppercase" type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Record Repair Cost
                </Button>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="ads" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-profit">Link Advertising Campaign</h4>
              <form onSubmit={handleAdSubmit} className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Campaign Name</Label>
                  <Input 
                    value={adForm.name} 
                    onChange={e => setAdForm({...adForm, name: e.target.value})}
                    placeholder="e.g. FB Ad for Honda Civic" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Platform</Label>
                  <Input 
                    value={adForm.platform} 
                    onChange={e => setAdForm({...adForm, platform: e.target.value})}
                    placeholder="Facebook / Google" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Spend Amount ($)</Label>
                  <Input 
                    type="number" value={adForm.amount} 
                    onChange={e => setAdForm({...adForm, amount: e.target.value})}
                    placeholder="0.00" required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Start Date</Label>
                  <Input 
                    type="date" value={adForm.startDate} 
                    onChange={e => setAdForm({...adForm, startDate: e.target.value})}
                    required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                 <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">End Date</Label>
                  <Input 
                    type="date" value={adForm.endDate} 
                    onChange={e => setAdForm({...adForm, endDate: e.target.value})}
                    required className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <Button className="col-span-2 bg-profit text-zinc-950 font-black h-11 uppercase" type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Link Ad Campaign
                </Button>
              </form>
            </div>
          </TabsContent>

          {vehicle.status !== 'Sold' && (
            <TabsContent value="sale" className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-info">Process Vehicle Sale</h4>
                <form onSubmit={handleSaleSubmit} className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Name<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.customerName} 
                      onChange={e => setSaleForm({...saleForm, customerName: e.target.value})}
                      placeholder="e.g. John Doe" required className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Phone Number<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.phone} 
                      onChange={e => setSaleForm({...saleForm, phone: e.target.value})}
                      placeholder="e.g. 555-0199" required className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Address<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.address} 
                      onChange={e => setSaleForm({...saleForm, address: e.target.value})}
                      placeholder="123 Main St, Springfield" required className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Sale Price ($)<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      type="number" value={saleForm.salePrice} 
                      onChange={e => setSaleForm({...saleForm, salePrice: e.target.value})}
                      placeholder="0.00" required className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Sale Date<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      type="date" value={saleForm.saleDate} 
                      onChange={e => setSaleForm({...saleForm, saleDate: e.target.value})}
                      required className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Payment Method</Label>
                    <select
                      value={saleForm.paymentMethod}
                      onChange={e => setSaleForm({...saleForm, paymentMethod: e.target.value})}
                      className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-profit/50 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Loan">Loan / Finance</option>
                      <option value="Check">Check</option>
                    </select>
                  </div>
                  <Button className="col-span-2 bg-info text-zinc-950 hover:bg-info/90 font-black h-11 uppercase mt-2" type="submit">
                    <ShoppingCart className="w-4 h-4 mr-2" /> Mark as Sold
                  </Button>
                </form>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function BuyerInfoSection({ vehicleId }: { vehicleId: string }) {
  const { sales } = useSales();
  const sale = sales.find(s => s.vehicleId === vehicleId);

  if (!sale) {
    return <p className="text-xs text-muted-foreground italic">Sale record not found.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Buyer Name</span>
        <span className="font-bold text-white">{sale.customerName}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Phone</span>
        <span className="font-bold text-white">{sale.phone}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Address</span>
        <span className="font-bold text-white">{sale.address}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sale Price</span>
        <span className="font-bold text-profit">${sale.salePrice.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sale Date</span>
        <span className="font-bold text-white">{new Date(sale.saleDate).toLocaleDateString()}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Payment Method</span>
        <span className="font-bold text-white">{sale.paymentMethod}</span>
      </div>
      <div className="flex justify-between text-xs pt-2 border-t border-border/40">
        <span className="font-black uppercase tracking-widest text-[10px] text-info">Net Profit</span>
        <span className={`font-black ${sale.profit >= 0 ? 'text-profit' : 'text-loss'}`}>${sale.profit.toLocaleString()}</span>
      </div>
    </div>
  );
}
