import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  Lock, 
  Unlock, 
  Bluetooth,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface DigitalKeyProps {
  roomNumber: string;
  guestName: string;
}

export function DigitalKey({ roomNumber, guestName }: DigitalKeyProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const handleUnlock = () => {
    setIsUnlocking(true);
    // Simulate NFC/Bluetooth handshake
    setTimeout(() => {
      setIsUnlocking(false);
      setIsUnlocked(true);
      toast.success(`Room ${roomNumber} Unlocked`, {
        description: 'Welcome back to your suite.',
        icon: <Unlock className="h-4 w-4 text-emerald-500" />
      });
      
      // Auto-lock after 5 seconds
      setTimeout(() => setIsUnlocked(false), 5000);
    }, 1500);
  };

  return (
    <Card className="bg-slate-900 border-none text-white overflow-hidden shadow-2xl relative group max-w-sm mx-auto">
      {/* Background glow effects */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-purple-600/20" />
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl transition-opacity duration-1000 ${isUnlocking ? 'opacity-100' : 'opacity-40'}`} />

      <CardContent className="p-8 relative z-10 flex flex-col items-center text-center">
        <div className="flex justify-between w-full mb-8">
          <Badge className="bg-white/10 hover:bg-white/20 text-white border-none gap-1 py-1 px-3">
            <Bluetooth className="h-3 w-3 text-blue-400" /> Connected
          </Badge>
          <div className="flex gap-2">
            <Wifi className="h-4 w-4 text-emerald-400" />
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
        </div>

        <div className="w-20 h-20 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center mb-6 relative">
          {isUnlocked ? (
            <Unlock className="h-10 w-10 text-emerald-400 animate-in zoom-in duration-300" />
          ) : (
            <Lock className={`h-10 w-10 ${isUnlocking ? 'text-blue-400 animate-pulse' : 'text-white/40'}`} />
          )}
          {isUnlocking && (
            <div className="absolute inset-0 border-2 border-blue-500 rounded-3xl animate-ping opacity-30" />
          )}
        </div>

        <div className="space-y-1 mb-8">
          <h2 className="text-3xl font-serif font-bold tracking-tight">Room {roomNumber}</h2>
          <p className="text-blue-200/60 text-sm uppercase tracking-widest font-medium">Digital Suite Access</p>
        </div>

        <div className="w-full space-y-4">
          <Button 
            onClick={handleUnlock}
            disabled={isUnlocking || isUnlocked}
            className={`w-full h-14 rounded-2xl font-bold text-lg transition-all duration-500 ${
              isUnlocked 
                ? 'bg-emerald-500 hover:bg-emerald-600' 
                : isUnlocking 
                  ? 'bg-blue-600' 
                  : 'bg-white text-slate-900 hover:bg-blue-50'
            }`}
          >
            {isUnlocked ? 'Room Unlocked' : isUnlocking ? 'Authenticating...' : 'Tap to Unlock'}
          </Button>
          
          <div className="flex items-center justify-center gap-2 text-[10px] text-white/30 uppercase font-bold tracking-tighter">
            <ShieldCheck className="h-3 w-3" /> Encrypted via Azure SecureKey™
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 w-full text-left">
          <p className="text-[10px] text-white/40 uppercase font-bold">Primary Guest</p>
          <p className="text-sm font-semibold text-blue-100">{guestName}</p>
        </div>
      </CardContent>
    </Card>
  );
}
