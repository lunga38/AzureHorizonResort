// NPO trust score — a COMPUTED reliability metric (not persisted, no schema change).
//
// Purpose: give NPOs and administrators a single 0–100 number summarising how
//dependable an organisation is in the surplus-food collection chain.
//
// Inputs are only facts already recorded by the food-rescue chain:
//   donation_batches  — allocations offered to, claimed by and collected for an NPO
//   donation_checkins — signed, verified handovers (one per completed collection)
//
// Four weighted components:
//   completion  40  collected / (collected + expired-uncollected)
//   punctuality 30 on-time arrivals inside the agreed pickup window
//   coldchain   20 perishable batches collected before their use-by time
//   compliance  10 proportion of offered batches that were actually claimed
//
// With no history the score is null (never a misleading 0 or 100). Confidence
// grows with volume: `confidence` reports how much history backs the number.

import type { DonationBatch, DonationCheckin } from '@/types/increment2';

export interface TrustScoreBreakdown {
  score: number;              // 0-100, rounded
  confidence: 'low' | 'medium' | 'high';
  completed: number;
  offered: number;
  missed: number;             // window elapsed, never collected
  expiredUncollected: number;
  onTime: number;
  totalCheckins: number;
  lateOrEarly: number;
  perishableCollected: number;
  perishableTotal: number;
  expiredAtPickup: number;    // used before its expiry — a cold-chain miss
  components: { label: string; points: number; max: number; detail: string }[];
}

const ON_TIME_GRACE_MIN = 30;   // early arrivals inside this margin still count as on time
const LATE_GRACE_MIN = 30;      // same tolerance past the window end

function minutesBetween(a: string, b: string): number | null {
  const t = new Date(a).getTime();
  const u = new Date(b).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(u)) return null;
  return Math.round((u - t) / 60000);
}

const isPerishable = (b: DonationBatch) =>
  /dairy|meat|fish|chicken|frozen|chilled|yoghurt|egg|leaf|green|salad/i
    .test(`${b.itemName} ${b.mealCategory}`);

export function computeTrustScore(
  npoId: string,
  batches: DonationBatch[],
  checkins: DonationCheckin[],
): TrustScoreBreakdown | null {
  const mine = batches.filter((b) => b.allocatedNpoId === npoId);
  const completed = mine.filter((b) => b.status === 'collected_completed');

  // Offered = anything allocated to this NPO. A batch whose pickup window has
  // fully elapsed without a check-in counts as missed, not as "still pending".
  const now = Date.now();
  const missed = mine.filter((b) => {
    if (b.status === 'collected_completed' || b.status === 'cancelled') return false;
    const end = b.pickupWindowEnd;
    return !!end && new Date(end).getTime() < now;
  });
  const expiredUncollected = missed.filter((b) => new Date(b.expiryAt).getTime() < now);

  const myCheckins = checkins.filter((c) => c.npoId === npoId);
  let onTime = 0;
  let lateOrEarly = 0;
  let expiredAtPickup = 0;
  for (const c of myCheckins) {
    const b = mine.find((x) => x.batchId === c.batchId);
    const collectedAt = c.collectedAt || b?.collectedAt;
    const start = b?.pickupWindowStart;
    const end = b?.pickupWindowEnd;
    if (!collectedAt || !start || !end) { lateOrEarly += 1; continue; }
    const fromStart = minutesBetween(start, collectedAt);
    const fromEnd = minutesBetween(end, collectedAt);
    if (fromStart === null || fromEnd === null) { lateOrEarly += 1; continue; }
    const arrivedEarly = fromStart < -ON_TIME_GRACE_MIN;
    const arrivedLate = fromEnd > LATE_GRACE_MIN;
    if (arrivedEarly || arrivedLate) lateOrEarly += 1; else onTime += 1;
    // Cold chain: did the food reach them before its use-by time?
    if (b && new Date(collectedAt).getTime() > new Date(b.expiryAt).getTime()) expiredAtPickup += 1;
  }

  const perishableTotal = mine.filter(isPerishable).length;
  const perishableCollected = mine.filter((b) => b.status === 'collected_completed' && isPerishable(b)).length;

  // Nothing recorded yet — do not invent a score.
  if (mine.length === 0 && myCheckins.length === 0) return null;

  const completionRatio = completed.length / Math.max(1, completed.length + missed.length);
  const punctualityRatio = myCheckins.length ? onTime / myCheckins.length : 0;
  const coldChainRatio = perishableTotal
    ? Math.max(0, (perishableCollected - expiredAtPickup) / perishableTotal)
    : 1; // nothing perishable handled → full marks, stated explicitly in the UI
  const complianceRatio = completed.length / Math.max(1, mine.length);

  const components = [
    {
      label: 'Completion rate',
      points: Math.round(completionRatio * 40),
      max: 40,
      detail: `${completed.length} collected, ${missed.length} window(s) elapsed without collection`,
    },
    {
      label: 'On-time pickup',
      points: Math.round(punctualityRatio * 30),
      max: 30,
      detail: myCheckins.length ? `${onTime} of ${myCheckins.length} handovers inside the window` : 'No verified handovers yet',
    },
    {
      label: 'Cold-chain handling',
      points: Math.round(Math.min(1, coldChainRatio) * 20),
      max: 20,
      detail: perishableTotal
        ? `${perishableCollected - expiredAtPickup} of ${perishableTotal} perishable batches collected before use-by`
        : 'No perishable batches allocated',
    },
    {
      label: 'Allocation uptake',
      points: Math.round(complianceRatio * 10),
      max: 10,
      detail: `${completed.length} of ${mine.length} offered allocations taken up`,
    },
  ];

  const raw = components.reduce((sum, c) => sum + c.points, 0);
  const volume = myCheckins.length + completed.length;
  return {
    score: Math.max(0, Math.min(100, raw)),
    confidence: volume >= 8 ? 'high' : volume >= 3 ? 'medium' : 'low',
    completed: completed.length,
    offered: mine.length,
    missed: missed.length,
    expiredUncollected: expiredUncollected.length,
    onTime,
    totalCheckins: myCheckins.length,
    lateOrEarly,
    perishableCollected,
    perishableTotal,
    expiredAtPickup,
    components,
  };
}

export function trustBand(score: number): { label: string; className: string } {
  if (score >= 85) return { label: 'Excellent', className: 'bg-emerald-100 text-emerald-800' };
  if (score >= 70) return { label: 'Good', className: 'bg-blue-100 text-blue-800' };
  if (score >= 50) return { label: 'Fair', className: 'bg-amber-100 text-amber-800' };
  return { label: 'At risk', className: 'bg-red-100 text-red-800' };
}