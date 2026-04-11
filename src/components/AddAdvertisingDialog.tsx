import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Plus } from 'lucide-react';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useInventory } from '@/hooks/useInventory';
import { toast } from '@/components/ui/toast-utils';

interface AddAdvertisingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddAdvertisingDialog({ open, onOpenChange }: AddAdvertisingDialogProps) {
  const { addAd } = useAdvertising();
  const { vehicles } = useInventory();
  
  const [formData, setFormData] = useState({
    campaignName: '',
    platform: 'Facebook',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    amountSpent: '',
    linkedVehicleId: 'none',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAd({
        campaignName: formData.campaignName,
        platform: formData.platform,
        startDate: formData.startDate,
        endDate: formData.endDate,
        amountSpent: parseFloat(formData.amountSpent),
        linkedVehicleId: formData.linkedVehicleId === 'none' ? undefined : formData.linkedVehicleId,
      });
      toast.success('Advertising campaign recorded!');
      setFormData({
        campaignName: '',
        platform: 'Facebook',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        amountSpent: '',
        linkedVehicleId: 'none',
      });
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to record campaign');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-900 text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2 bg-profit/10 rounded-lg">
              <Megaphone className="text-profit w-5 h-5" />
            </span>
            <DialogTitle className="text-xl font-black font-display tracking-tight text-white uppercase">
              Launch Campaign
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
            Track marketing spend and platform performance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Campaign Name</Label>
            <Input 
              value={formData.campaignName} 
              onChange={e => setFormData({...formData, campaignName: e.target.value})}
              placeholder="e.g. Summer Blowout, FB Marketplace Promo" required className="bg-zinc-900 border-zinc-800 focus:ring-profit/50"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Platform</Label>
              <Select value={formData.platform} onValueChange={v => setFormData({...formData, platform: v})}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Select Platform" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-900">
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Google">Google</SelectItem>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="Tiktok">TikTok</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Budget ($)</Label>
              <Input 
                type="number" value={formData.amountSpent} 
                onChange={e => setFormData({...formData, amountSpent: e.target.value})}
                placeholder="0.00" required className="bg-zinc-900 border-zinc-800 focus:ring-profit/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Date</Label>
              <Input 
                type="date" value={formData.startDate} 
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                required className="bg-zinc-900 border-zinc-800 focus:ring-profit/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">End Date</Label>
              <Input 
                type="date" value={formData.endDate} 
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                required className="bg-zinc-900 border-zinc-800 focus:ring-profit/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Link to Vehicle (Optional)</Label>
            <Select value={formData.linkedVehicleId} onValueChange={v => setFormData({...formData, linkedVehicleId: v})}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Select a Vehicle" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-900">
                <SelectItem value="none">General / No Vehicle</SelectItem>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} ({v.vin.slice(-6)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full bg-profit text-zinc-950 font-black h-12 uppercase tracking-widest text-xs mt-2" type="submit">
            <Plus className="w-4 h-4 mr-2" /> Launch Campaign
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
