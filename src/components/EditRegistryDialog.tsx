import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRegistry, DocumentLog } from '@/hooks/useRegistry';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

interface EditRegistryDialogProps {
  log: DocumentLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditRegistryDialog({ log, open, onOpenChange }: EditRegistryDialogProps) {
  const { updateLog } = useRegistry();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
    color: '',
    mileage: '',
    purchasedFrom: '',
    purchaseDate: '',
  });

  useEffect(() => {
    if (log) {
      setFormData({
        vin: log.vin || '',
        make: log.make || '',
        model: log.model || '',
        year: log.year || '',
        color: log.color || '',
        mileage: log.mileage || '',
        purchasedFrom: log.purchasedFrom || '',
        purchaseDate: log.purchaseDate ? log.purchaseDate.split('T')[0] : '',
      });
    }
  }, [log]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!log) return;

    setLoading(true);
    try {
      await updateLog({
        id: log.id,
        ...formData
      });
      toast.success('Document updated and PDF regenerated.');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to update document.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-900 text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-white">Edit Document Details</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Updating these details will automatically regenerate the associated PDF document.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">VIN</Label>
              <Input
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Year</Label>
              <Input
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Make</Label>
              <Input
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Model</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Color</Label>
              <Input
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Mileage</Label>
              <Input
                value={formData.mileage}
                onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Purchased From</Label>
            <Input
              value={formData.purchasedFrom}
              onChange={(e) => setFormData({ ...formData, purchasedFrom: e.target.value })}
              className="bg-zinc-900 border-zinc-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">Purchase Date</Label>
            <Input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              className="bg-zinc-900 border-zinc-800 text-white"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-profit text-black hover:bg-profit/90 font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
