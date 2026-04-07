/**
 * Calculate remaining stay days from today.
 * Used for treatment downtime validation (PRD business rule).
 */
export function getRemainingDays(
  endDate: string | null,
  stayDays: number | null,
): number | null {
  if (endDate) {
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }
  if (stayDays !== null) {
    return stayDays; // conservative estimate
  }
  return null;
}

/**
 * Check if treatment downtime is safe for traveler.
 * Returns: "safe" | "warning" | "excluded" | "unknown"
 */
export function checkDowntimeSafety(
  downtimeDays: number | null,
  remainingDays: number | null,
): "safe" | "warning" | "excluded" | "unknown" {
  if (downtimeDays === null || remainingDays === null) return "unknown";
  if (downtimeDays > remainingDays) return "excluded";
  if (downtimeDays >= remainingDays * 0.5) return "warning";
  return "safe";
}
