export function money(value: unknown, compact = false) {
  const numeric = Number(value ?? 0);
  const hasSubCentPrecision = Math.abs(numeric * 100 - Math.round(numeric * 100)) > 0.00001;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: compact ? 1 : hasSubCentPrecision ? 4 : 2, minimumFractionDigits: 0, notation: compact ? "compact" : "standard" }).format(numeric);
}
export function number(value: unknown, digits = 6) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(Number(value ?? 0));
}
export function date(value: unknown, full = false) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(full ? { year: "numeric" as const } : {}) });
}
export function relative(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return date(value);
}
export function label(value: unknown) { return String(value ?? "—").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
export function today() { return new Date().toLocaleDateString("en-CA"); }
export function dueIn30Days() { const value = new Date(); value.setDate(value.getDate() + 30); return value.toLocaleDateString("en-CA"); }
/** Quantities enter and leave the API as exact six-place decimal strings. */
export function quantityScaled(value: string) {
  const [whole, fraction = ""] = String(value || "0").split(".");
  return BigInt(whole || "0") * 1000000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}
export function quantitySubtract(left: string, right: string) {
  const result = quantityScaled(left) - quantityScaled(right);
  if (result <= 0n) return "0";
  return `${result / 1000000n}.${String(result % 1000000n).padStart(6, "0")}`.replace(/\.?0+$/, "");
}
