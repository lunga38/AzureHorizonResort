// Local-time workforce week helpers. Roster/availability weeks start on
// Monday, matching the seed's JHB-anchored `jMonday()` weekStart values
// (seedData.ts), so pickers default to a week that actually has data.
export const currentWeekStart = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
