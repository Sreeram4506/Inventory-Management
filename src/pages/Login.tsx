import { useState } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from '@/components/ui/toast-utils';
import { Car } from 'lucide-react';
import { apiUrl } from '@/lib/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        toast.success(`Welcome back, ${data.user.name}!`);
      } else {
        toast.error(data.message || 'Login failed');
      }
    } catch (error) {
      toast.error('Connection error. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(24,24,27,1)_0%,rgba(9,9,11,1)_100%)]" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-profit/20 to-transparent" />
      
      <Card className="w-full max-w-md bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-700 relative z-10">
        <CardHeader className="space-y-3 text-center pb-8">
          <div className="mx-auto w-14 h-14 bg-profit/10 rounded-2xl flex items-center justify-center mb-2 border border-profit/20 shadow-inner">
            <Car className="text-profit w-7 h-7" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-display text-white tracking-tight">AutoProfitHub</CardTitle>
            <CardDescription className="text-zinc-400 font-medium">
              Dealer Management & Analytics Portal
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-200 font-semibold text-xs uppercase tracking-wider">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@autoprofithub.com" 
                className="bg-zinc-950/50 border-zinc-700/50 text-white placeholder:text-zinc-600 focus:border-profit/50 focus:ring-profit/20 h-11 transition-all" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-200 font-semibold text-xs uppercase tracking-wider">Password</Label>
              <Input 
                id="password" 
                type="password" 
                className="bg-zinc-950/50 border-zinc-700/50 text-white focus:border-profit/50 focus:ring-profit/20 h-11 transition-all" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="pt-4 flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-profit hover:bg-profit/90 text-zinc-950 font-bold h-11 text-base shadow-lg shadow-profit/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Secure Sign In'}
            </Button>
            
            <div className="p-3 bg-zinc-950/50 border border-zinc-800 rounded-lg w-full">
              <p className="text-[10px] text-zinc-500 uppercase font-bold text-center mb-1 tracking-widest text-white/40">Demo Access</p>
              <div className="flex justify-center gap-3 text-xs">
                <span className="text-zinc-300 font-mono">admin@gmail.com</span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-300 font-mono">password123</span>
              </div>
            </div>
          </CardFooter>
        </form>
      </Card>
      
      <div className="fixed bottom-6 text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold z-0">
        © 2026 AutoProfitHub Systems
      </div>
    </div>
  );
};

export default Login;
