// NPO trust score panel — shows the computed 0–100 reliability score and how it
// was derived. Rendered on the NPO portal (their own score) and readable by admins
// in the verification queue. Nothing is persisted: the score is recomputed from the
// donation_batches + donation_checkins history every render.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Info } from 'lucide-react';
import { computeTrustScore, trustBand, type TrustScoreBreakdown } from '@/utils/trustScore';
import type { DonationBatch, DonationCheckin } from '@/types/increment2';

export function TrustScorePanel({
  npoId, organisationName, batches, checkins,
}: {
  npoId: string;
  organisationName?: string;
  batches: DonationBatch[];
  checkins: DonationCheckin[];
}) {
  const result: TrustScoreBreakdown | null = computeTrustScore(npoId, batches, checkins);
  const band = result ? trustBand(result.score) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Trust score{organisationName ? ` — ${organisationName}` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result ? (
          <p className="text-sm text-slate-500">
            No collection history yet, so no score is shown. A score appears once this
            organisation has been allocated food surplus.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold tabular-nums text-[#1e3a5f] dark:text-blue-300">{result.score}</div>
              <div className="space-y-1">
                {band && <Badge className={band.className}>{band.label}</Badge>}
                <p className="text-xs text-slate-500">Confidence: {result.confidence} ({result.totalCheckins + result.completed} recorded events)</p>
              </div>
            </div>

            <div className="space-y-2">
              {result.components.map((c) => (
                <div key={c.label}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-slate-500">{c.points}/{c.max}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded mt-1">
                    <div className="h-1.5 bg-[#1e3a5f] dark:bg-blue-400 rounded" style={{ width: `${(c.points / c.max) * 100}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{c.detail}</p>
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500 space-y-1 border-t pt-3">
              <p className="flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  The score is calculated from your collection record: {result.completed} completed
                  collection{result.completed === 1 ? '' : 's'}, {result.onTime} on-time
                  hand-off{result.onTime === 1 ? '' : 's'} of {result.totalCheckins}, and
                  {result.missed} window{result.missed === 1 ? '' : 's'} that elapsed without a
                  collection{result.expiredUncollected > 0 ? ` (${result.expiredUncollected} after the food's use-by time)` : ''}.
                  It is recalculated automatically and is never used to reject an application.
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}