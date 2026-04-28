import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast-utils';
import { apiUrl } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, DollarSign, User, MapPin, Calendar } from 'lucide-react';

interface EditSaleDialogProps {
  sale: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
}

export default function EditSaleDialog({ sale, open, onOpenChange, token }: EditSaleDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    salePrice: '',
    saleDate: '',
    customerName: '',
    phone: '',
    address: '',
    paymentMethod: ''
  });

  useEffect(() => {
    if (sale) {
      setFormData({
        salePrice: sale.salePrice.toString(),
        saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString().split('T')[0] : '',
        customerName: sale.customerName || '',
        phone: sale.phone || '',
        address: sale.address || '',
        paymentMethod: sale.paymentMethod || 'Cash'
      });
    }
  }, [sale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !sale) return;

    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/sales/${sale.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          salePrice: parseFloat(formData.salePrice)
        })
      });

      if (!response.ok) throw new Error('Failed to update sale');

      toast.success('Sale record updated successfully');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Error updating sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">Edit Sale Details</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Correct the sale price or buyer information. Profit will be recalculated automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sale Price ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-profit" />
                <Input
                  type="number"
                  step="0.01"
                  value={formData.salePrice}
                  onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                  className="pl-10 bg-muted/30 border-profit/20 h-11 font-bold text-profit focus-visible:ring-profit/20"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sale Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={formData.saleDate}
                  onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                  className="pl-10 bg-muted/30 border-border h-11 focus-visible:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="pl-10 bg-muted/30 border-border h-11 focus-visible:ring-primary/20"
                  placeholder="Full Name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="pl-10 bg-muted/30 border-border h-11 focus-visible:ring-primary/20"
                  placeholder="Street Address, City, State"
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="font-bold uppercase tracking-widest text-[10px]"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-profit hover:bg-profit/90 text-primary-foreground font-black uppercase tracking-widest px-8 shadow-lg shadow-profit/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
