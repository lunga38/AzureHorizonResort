// UC44 — Open Shifts Board: manager publishes surge shifts; eligible staff claim (tx).
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Zap, Trash2, Clock } from 'lucide-react';
import {
  listenOpenShifts, listenStaffAvailability, createOpenShift, claimOpenShift,
  cancelOpenShift, autoCloseElapsedOpenShifts, filterEligibleOpenShifts,
} from '@/services/increment2-services';
import type { OpenShift, StaffAvailability } from '@/types/increment2';
import { isOpenShiftElapsed, openShiftFill } from '@/types/increment2';
import { formatStatus } from '@/utils/statusLabels';
import { useAuth } from '@/hooks/useAuth';

const URGENCY_BADGE: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-700',
  urgent: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
};

export function OpenShiftsBoard({ managerView, staffRole }: { managerView?: boolean; staffRole?: string }) {
  const { user } = useAuth();
  const staffId = user?.uid || user?.id || '';
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [form, setForm] = useState({ department: 'Food & Beverage', date: '', start: '08:00', end: '17:00', role: '', skill: '', urgency: 'normal' as 'normal' | 'urgent' | 'critical', requested: '1' });
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const u1 = listenOpenShifts(setShifts, !managerView);
    const u2 = listenStaffAvailability(setAvailability);
    return () => { u1(); u2(); };
  }, [managerView]);

  // Staff see only claimable shifts (elapsed / fully covered are filtered out by
  // the service). Managers see everything, elapsed ones grouped separately.
  const eligible = managerView ? shifts : filterEligibleOpenShifts({
    shifts, staffId, role: staffRole || '', availability, weekHoursSoFar: 0,
  });
  const managerRows = managerView
    ? [...shifts].sort((a, b) => {
      const aElapsed = isOpenShiftElapsed(a) ? 1 : 0;
      const bElapsed = isOpenShiftElapsed(b) ? 1 : 0;
      if (aElapsed !== bElapsed) return aElapsed - bElapsed;
      return `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
    })
    : eligible;
  const elapsedCount = managerView ? shifts.filter((s) => s.status === 'open' && isOpenShiftElapsed(s)).length : 0;

  const create = async () => {
    setBusy(true);
    try {
      const requested = Math.max(1, Math.round(Number(form.requested) || 1));
      await createOpenShift({
        department: form.department, date: form.date, startTime: form.start, endTime: form.end,
        role: form.role, requiredSkill: form.skill || undefined, urgency: form.urgency,
        requestedCount: requested, authorUid: staffId,
      });
      setAlert({ open: true, title: 'Open shift published', message: `Eligible staff can now claim ${requested} slot${requested === 1 ? '' : 's'}.`, type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Publish failed', message: e instanceof Error ? e.message : 'Could not publish.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const claim = async (id: string) => {
    setBusy(true);
    try {
      await claimOpenShift({ openShiftDocId: id, claimerUid: staffId });
      setAlert({ open: true, title: 'Shift claimed', message: 'Added to your roster.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Claim failed', message: e instanceof Error ? e.message : 'Shift may have just been filled.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await cancelOpenShift(id, 'Removed by manager');
      setAlert({ open: true, title: 'Open shift removed', message: 'It was cancelled and no longer appears on the staff board. The record is kept for audit.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Remove failed', message: e instanceof Error ? e.message : 'Could not remove.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const closeElapsed = async () => {
    setBusy(true);
    try {
      const closed = await autoCloseElapsedOpenShifts();
      setAlert({
        open: true,
        title: closed.length ? `${closed.length} elapsed shift${closed.length === 1 ? '' : 's'} closed` : 'Nothing to close',
        message: closed.length
          ? 'Elapsed shifts were cancelled with the reason "shift window elapsed" and left the staff board.'
          : 'No open shifts have elapsed yet.',
        type: 'success',
      });
    } catch (e) {
      setAlert({ open: true, title: 'Auto-close failed', message: e instanceof Error ? e.message : 'Could not close elapsed shifts.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      {managerView && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Publish Open Shift</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} /></div>
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>Start</Label><Input type="time" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></div>
              <div><Label>End</Label><Input type="time" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></div>
              <div><Label>Role</Label><Input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} /></div>
              <div><Label>Skill (opt)</Label><Input value={form.skill} onChange={(e) => setForm((p) => ({ ...p, skill: e.target.value }))} /></div>
              <div>
                <Label>Employees requested</Label>
                <Input type="number" min={1} max={20} value={form.requested}
                  onChange={(e) => setForm((p) => ({ ...p, requested: e.target.value }))} />
              </div>
              <div><Label>Urgency</Label>
                <select className="w-full border rounded-md p-2 text-sm" value={form.urgency} onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value as typeof form.urgency }))}>
                  <option value="normal">normal</option><option value="urgent">urgent</option><option value="critical">critical</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={create} disabled={busy || !form.date || !form.role.trim()}>Publish shift</Button>
              {elapsedCount > 0 && (
                <Button variant="outline" disabled={busy} onClick={closeElapsed}>
                  <Clock className="h-4 w-4 mr-1" /> Close {elapsedCount} elapsed shift{elapsedCount === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {managerView ? 'All open shifts' : 'Available for you'} ({managerRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {managerRows.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No open shifts</p>}
          {managerRows.map((s) => {
            const fill = openShiftFill(s);
            const elapsed = managerView && isOpenShiftElapsed(s);
            return (
              <div key={s.id} className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${s.urgency === 'critical' ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20' : ''}`}>
                <div>
                  <p className="text-sm font-medium">
                    {s.date} {s.startTime}–{s.endTime} · {s.role}{' '}
                    <Badge className="ml-1">{formatStatus(s.status)}</Badge>{' '}
                    <Badge className={`ml-1 ${URGENCY_BADGE[s.urgency || 'normal']}`}>{formatStatus(s.urgency)}</Badge>
                    {elapsed && <Badge className="ml-1 bg-slate-200 text-slate-700">elapsed</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.department} · {s.hours}h{s.requiredSkill ? ` · ${s.requiredSkill}` : ''} · {fill.filled}/{fill.requested} filled
                    {fill.complete ? ' · fully covered' : ` · ${fill.remaining} still needed`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!managerView && s.status === 'open' && (
                    <Button size="sm" disabled={busy} onClick={() => claim(s.id)}>Claim a slot</Button>
                  )}
                  {managerView && s.status === 'open' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(s.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
