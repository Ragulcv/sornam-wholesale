// Rupee amounts spelled out in Indian English (lakh / crore, not million).
// Shown under the money fields on the entry screen so a large figure can be
// eyeballed before it is saved.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), r = n % 10;
  return r ? `${TENS[t]} ${ONES[r]}` : TENS[t];
}

function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (h && r) return `${ONES[h]} Hundred ${under100(r)}`;
  if (h) return `${ONES[h]} Hundred`;
  return under100(r);
}

/** 1234567 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven" */
export function indianWords(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(v / 10000000);
  const lakh = Math.floor((v % 10000000) / 100000);
  const thousand = Math.floor((v % 100000) / 1000);
  const rest = v % 1000;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}

/**
 * Full money phrase: "Rupees Two Lakh Fifty Thousand and Fifty Paise Only".
 * Negative amounts are prefixed "Minus" so a received-as-negative figure reads
 * correctly instead of silently losing its sign.
 */
export function rupeesInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  if (whole === 0 && paise === 0) return "Zero Only";
  const bits: string[] = [];
  if (neg) bits.push("Minus");
  bits.push("Rupees", indianWords(whole));
  if (paise > 0) bits.push("and", indianWords(paise), "Paise");
  bits.push("Only");
  return bits.join(" ").replace(/\s+/g, " ").trim();
}
