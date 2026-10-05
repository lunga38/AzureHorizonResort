// Annual leave balance — COMPUTED from the existing leave_requests history.
//
// Why computed: no entitlement field exists on the user profile and adding one
// would be a schema change. The balance is derived instead, so it is always in
// step with what was actually approved and nothing can drift.
//
// Rules (South African Basic Conditions of Employment aligned, annual cycle):
//   * Annual leave entitlement = 15 working days per full year of service,
//     pro-rated to 15/12 per completed month for the current leave year.
//   * Only APPROVED requests consume entitlement. Pending and rejected requests
//     do not.
//   * A calendar year that has not been served yet shows entitlement 0 with an
//     explanatory note rather than a misleading number.
//   * Sick/family leave are tracked separately and never drawn from annual leave.

const MS_PER_DAY = 86400000;

export const ANNUAL_LEAVE_DAYS_PER_YEAR = 15;
export const WORKING_DAYS_PER_WEEK = 5;

/** Leave types that draw on the annual leave entitlement. */
export function isAnnualLeaveType(type: string): boolean {
  return /annual|vacation|leave\b/i.test(type || '') && !/sick|medical|family|maternity|parental|unpaid/i.test(type || '');
}

function parseDay(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive working-day count between two ISO dates (Mon–Fri). */
export function workingDaysBetween(startDate: string, endDate: string): number {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end || end < start) return 0;
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    const dow = new Date(t).getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/**
 * Pro-rated annual entitlement for the leave year containing `onDate`.
 * Completes on the 1st of each month; days accrue per completed month.
 */
export function annualEntitlementFor(onDate: Date = new Date()): { days: number; completedMonths: number; note: string } {
  const year = onDate.getFullYear();
  const start = new Date(year, 0, 1);
  if (onDate < start) return { days: 0, completedMonths: 0, note: 'Leave year has not started.' };
  // Months completed since 1 January (the current month only counts after it ends).
  const completedMonths = onDate.getMonth();
  const days = Math.round(((ANNUAL_LEAVE_DAYS_PER_YEAR / 12) * completedMonths) * 10) / 10;
  return {
    days,
    completedMonths,
    note: `${ANNUAL_LEAVE_DAYS_PER_YEAR} days per year, pro-rated by completed months (${completedMonths} month${completedMonths === 1 ? '' : 's'} of ${year} accrued).`,
  };
}

export interface LeaveBalance {
  year: number;
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
  note: string;
}

/**
 * Balance for one employee in the leave year containing `onDate`.
 * `requests` may include every employee; only this staff member's rows count.
 */
export function computeLeaveBalance(
  staffId: string,
  requests: { staffId: string; leaveType: string; startDate: string; endDate: string; status: string }[],
  onDate: Date = new Date(),
): LeaveBalance {
  const year = onDate.getFullYear();
  const ent = annualEntitlementFor(onDate);
  const mine = requests.filter((r) => r.staffId === staffId && isAnnualLeaveType(r.leaveType));

  const inYear = (iso: string) => {
    const d = parseDay(iso);
    return !!d && d.getFullYear() === year;
  };

  const sumDays = (rows: typeof mine) =>
    rows
      .filter((r) => inYear(r.startDate))
      .reduce((sum, r) => sum + workingDaysBetween(r.startDate, r.endDate), 0);

  const used = sumDays(mine.filter((r) => r.status === 'approved'));
  const pending = sumDays(mine.filter((r) => r.status === 'pending'));

  return {
    year,
    entitlement: ent.days,
    used,
    pending,
    remaining: Math.max(0, Math.round((ent.days - used) * 10) / 10),
    note: ent.note,
  };
}

export function leaveBalanceTone(remaining: number, entitlement: number): 'ok' | 'warn' | 'low' {
  if (entitlement <= 0) return 'low';
  const ratio = remaining / entitlement;
  if (ratio <= 0.15) return 'low';
  if (ratio <= 0.4) return 'warn';
  return 'ok';
}