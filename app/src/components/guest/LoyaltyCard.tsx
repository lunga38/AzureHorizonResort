import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  listenForLoyaltyLog,
  listenForUserVouchers,
  calculateLoyaltyTier,
  db
} from '@/services/firebase-services';
import { doc, onSnapshot } from 'firebase/firestore';
import type { RedemptionVoucher, LoyaltyLogEntry, User as AppUser } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, Trophy, Star, Gift, Gem, 
  TrendingUp, Clock, Sparkles, Store, Ticket, 
  ArrowRight, Copy, Check, Target 
} from 'lucide-react';
import { LoyaltyStore } from '@/components/guest/LoyaltyStore';

type AuthUserBridge = AppUser & { uid?: string };

interface LoyaltyCardProps {
  onBack: () => void;
}

const TIERS = [
  { name: 'Bronze', min: 0, color: 'from-amber-700 to-amber-900', textColor: 'text-amber-200', icon: Star, badge: 'bg-amber-700' },
  { name: 'Silver', min: 500, color: 'from-gray-400 to-gray-600', textColor: 'text-gray-200', icon: Trophy, badge: 'bg-gray-500' },
  { name: 'Gold', min: 1500, color: 'from-yellow-500 to-amber-600', textColor: 'text-yellow-100', icon: Gift, badge: 'bg-yellow-600' },
  { name: 'Platinum', min: 5000, color: 'from-slate-700 to-slate-900', textColor: 'text-blue-200', icon: Gem, badge: 'bg-slate-800' },
];

const MILESTONE_REWARDS = [
  { title: 'Complimentary Dessert & Coffee', pts: 100 },
  { title: 'Complimentary Welcome Drink', pts: 150 },
  { title: '2-for-1 Cocktails at Sunset Lounge', pts: 200 },
  { title: 'Dessert Platter for Two', pts: 250 },
  { title: '10% Dining Discount Voucher', pts: 300 },
];

export function LoyaltyCard({ onBack }: LoyaltyCardProps) {
  const { user } = useAuth();
  const currentUser = user as AuthUserBridge;
  const [logEntries, setLogEntries] = useState<LoyaltyLogEntry[]>([]);
  const [vouchers, setVouchers] = useState<RedemptionVoucher[]>([]);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Live Database Points Sync state
  const [livePoints, setLivePoints] = useState<number | null>(null);

  // Live points fallback chain: Firestore Live State -> Auth Context State -> 0
  const points = livePoints !== null ? livePoints : (currentUser?.loyaltyPoints || 0);
  
  // Calculate tier dynamically from points balance to ensure 100% accuracy
  const effectiveTier = calculateLoyaltyTier(points);
  const currentTier = TIERS.find(t => t.name.toLowerCase() === effectiveTier) || TIERS[0];
  const currentTierIdx = TIERS.indexOf(currentTier);
  const nextTier = TIERS[currentTierIdx + 1];
  const progressToNext = nextTier 
    ? Math.min(100, Math.round(((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100)) 
    : 100;

  const TierIcon = currentTier.icon;

  // Find next milestone reward
  const nextGoal = MILESTONE_REWARDS.find(r => r.pts > points) || MILESTONE_REWARDS[MILESTONE_REWARDS.length - 1];
  const goalProgress = Math.min(100, Math.round((points / nextGoal.pts) * 100));

  // Listen to live user profile changes in Firestore to sync exact points.
  // NOTE: the 'users' collection is keyed by EMAIL (registerUser/loginUser/seed all
  // use doc(db,'users',email)). Listening on the uid doc never fires, so points stayed
  // stuck at the stale login-time value. Listen on email first, fall back to id/uid.
  useEffect(() => {
    const guestId = currentUser?.id || currentUser?.uid || currentUser?.email;
    if (!guestId) return;

    const candidates = [
      currentUser?.email,
      currentUser?.id,
      currentUser?.uid,
    ].filter(Boolean) as string[];

    const unsubscribers: (() => void)[] = [];
    let synced = false;

    for (const candidate of candidates) {
      const userRef = doc(db, 'users', candidate);
      const unsub = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data()?.role) {
          const data = docSnap.data();
          if (typeof data.loyaltyPoints === 'number' && !synced) {
            synced = true;
            setLivePoints(data.loyaltyPoints);
          }
        }
      }, (error) => {
        console.warn("Error listening to live user points on card:", error);
      });
      unsubscribers.push(unsub);
    }

    return () => {
      unsubscribers.forEach(u => u());
    };
  }, [currentUser?.id, currentUser?.uid, currentUser?.email]);

  useEffect(() => {
    const guestId = currentUser?.id || currentUser?.uid || currentUser?.email;
    if (!guestId) return;

    const unsubLogs = listenForLoyaltyLog(guestId, setLogEntries);
    const unsubVouchers = listenForUserVouchers(guestId, setVouchers);

    return () => {
      if (typeof unsubLogs === 'function') unsubLogs();
      if (typeof unsubVouchers === 'function') unsubVouchers();
    };
  }, [currentUser?.id, currentUser?.uid, currentUser?.email]);

  const activeVouchers = vouchers.filter(v => v.status === 'active');

  const copyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (isStoreOpen) {
    return <LoyaltyStore onBack={() => setIsStoreOpen(false)} />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-[#1e3a5f]">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Button>

        <Button 
          onClick={() => setIsStoreOpen(true)} 
          className="bg-[#c9a227] hover:bg-[#b08d22] text-white gap-2 font-semibold shadow-md transition-all hover:scale-105"
        >
          <Store className="h-4 w-4" /> Open Loyalty Store
        </Button>
      </div>

      {/* Main Tier Membership Pass */}
      <Card className={`overflow-hidden border-none shadow-xl bg-gradient-to-r ${currentTier.color} text-white relative`}>
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 pointer-events-none flex items-center justify-end pr-8">
          <TierIcon className="h-64 w-64 text-white" />
        </div>

        <CardContent className="p-6 md:p-8 relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold tracking-widest uppercase text-white/70">Azure Horizon Rewards</span>
              <h2 className="text-2xl md:text-3xl font-bold font-serif mt-1">{currentUser?.name || 'Valued Guest'}</h2>
              <p className="text-sm text-white/80">{currentUser?.email}</p>
            </div>
            <Badge className={`${currentTier.badge} text-white px-3 py-1.5 text-xs uppercase tracking-wider font-bold border border-white/20 shadow-sm flex items-center gap-1.5`}>
              <TierIcon className="h-3.5 w-3.5" />
              {currentTier.name} Member
            </Badge>
          </div>

          <div className="mt-8 grid md:grid-cols-2 gap-6 items-end">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Available Balance</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl md:text-5xl font-black font-mono tracking-tight">{points.toLocaleString()}</span>
                <span className="text-sm font-semibold text-amber-200">POINTS</span>
              </div>
            </div>

            {nextTier && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-white/80">Progress to {nextTier.name}</span>
                  <span className={currentTier.textColor}>{nextTier.min - points} pts remaining</span>
                </div>
                <div className="w-full bg-black/20 rounded-full h-2.5 p-0.5 overflow-hidden backdrop-blur-sm">
                  <div 
                    className="bg-gradient-to-r from-amber-300 to-amber-100 h-full rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${progressToNext}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/20 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{logEntries.length}</p>
              <p className={`text-xs ${currentTier.textColor}`}>Transactions</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{logEntries.reduce((sum, e) => sum + (e.points > 0 ? e.points : 0), 0)}</p>
              <p className={`text-xs ${currentTier.textColor}`}>Points Earned</p>
            </div>
            <div>
              <p className="text-2xl font-bold">R{(points * 10).toLocaleString()}</p>
              <p className={`text-xs ${currentTier.textColor}`}>Est. Spend Value</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tier Perks Card */}
      <Card className="border-none shadow-sm bg-white">
        <CardContent className="p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Gift className="h-5 w-5 text-[#c9a227]" /> Tier Privileges & Perks
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TIERS.map((tier, i) => (
              <div
                key={tier.name}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  tier.name.toLowerCase() === effectiveTier
                    ? 'border-[#c9a227] bg-[#c9a227]/5 shadow-sm'
                    : 'border-gray-100 opacity-60'
                }`}
              >
                <tier.icon
                  className={`h-6 w-6 mx-auto mb-2 ${
                    tier.name.toLowerCase() === effectiveTier ? 'text-[#c9a227]' : 'text-gray-400'
                  }`}
                />
                <p className="font-bold text-sm text-gray-900">{tier.name}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {i === 0 && '1x Points Earn Rate'}
                  {i === 1 && 'Priority Dining Seating'}
                  {i === 2 && 'Priority Sunset Lounge Seating'}
                  {i === 3 && 'Complimentary Welcome Drink'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Next Milestone Reward Goal Tracker */}
      <Card className="border-none shadow-sm bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-l-4 border-l-[#c9a227]">
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-lg">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
              <Target className="h-4 w-4 text-[#c9a227]" /> Next Reward Goal
            </div>
            <h4 className="text-lg font-bold text-gray-900">{nextGoal.title}</h4>
            <p className="text-xs text-gray-600">
              {points >= nextGoal.pts ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5" /> You have enough points to unlock this reward now!
                </span>
              ) : (
                `You need ${nextGoal.pts - points} more points to unlock this reward (${nextGoal.pts} pts total).`
              )}
            </p>
            <div className="w-full bg-amber-100 rounded-full h-2 mt-2">
              <div 
                className="bg-[#c9a227] h-full rounded-full transition-all duration-500" 
                style={{ width: `${goalProgress}%` }} 
              />
            </div>
          </div>

          <Button 
            onClick={() => setIsStoreOpen(true)}
            className="bg-[#1e3a5f] hover:bg-[#163058] text-white shrink-0 gap-2 font-medium"
          >
            Browse Rewards <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Active Digital Vouchers Quick Access */}
      {activeVouchers.length > 0 && (
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Ticket className="h-5 w-5 text-emerald-600" /> My Active Digital Vouchers
              </h3>
              <Badge className="bg-emerald-100 text-emerald-800 border-none font-semibold">
                {activeVouchers.length} Ready to Present
              </Badge>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {activeVouchers.map((voucher) => (
                <div 
                  key={voucher.id} 
                  className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Voucher Code
                    </span>
                    <p className="font-mono font-bold text-lg text-[#1e3a5f] tracking-wider">
                      {voucher.voucherCode}
                    </p>
                    <p className="text-xs font-medium text-gray-700 mt-0.5">{voucher.rewardTitle}</p>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" /> Expires {new Date(voucher.expiresAt).toLocaleDateString()}
                    </p>
                  </div>

                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 gap-1 font-semibold shrink-0"
                    onClick={() => copyVoucherCode(voucher.voucherCode)}
                  >
                    {copiedCode === voucher.voucherCode ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Code
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Points Activity History */}
      <Card className="border-none shadow-sm bg-white">
        <CardContent className="p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" /> Points Activity History
          </h3>
          {logEntries.length === 0 ? (
            <p className="text-gray-400 text-center py-8 italic text-sm">No points transactions recorded yet.</p>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {logEntries.slice(0, 20).map((entry) => {
                const isRedemption = entry.points < 0;
                return (
                  <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full ${
                          isRedemption ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                        } flex items-center justify-center font-bold text-sm shrink-0`}
                      >
                        {isRedemption ? '−' : '+'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{entry.reason}</p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`${isRedemption ? 'text-red-600' : 'text-emerald-600'} font-mono font-bold text-sm`}>
                      {isRedemption ? '' : '+'}{entry.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}