// ─────────────────────────────────────────────────────────────
// Single source of truth for all commission logic.
// Import calculateCommission() anywhere you need it.
// ─────────────────────────────────────────────────────────────

export const COMMISSION_RATES = {
  electronics: 0.08,
  fashion:     0.12,
  beauty:      0.10,
  food:        0.05,
  health:      0.08,
  home:        0.10,
  sports:      0.10,
  books:       0.07,
  toys:        0.10,
  automotive:  0.06,
  default:     0.10,
};

// How much of the base category rate each plan actually pays.
// basic  = 100% of rate  (no discount)
// silver = 50%  of rate  (half commission)
// gold   = 0%   of rate  (zero commission)
export const PLAN_MULTIPLIER = {
  basic:  1.0,
  silver: 0.5,
  gold:   0.0,
};

// FIX: silver productLimit corrected to 50 (was 20 in frontend).
// Gold uses 999999 as "unlimited" sentinel — UI should display "Unlimited".
export const PLAN_CONFIG = {
  basic: {
    productLimit: 5,
    isVerified:   false,
    monthlyPrice: 0,
    label:        "Basic",
  },
  silver: {
    productLimit: 50,        // ← was 20 in old frontend; canonical value is 50
    isVerified:   true,
    monthlyPrice: 5000,      // ₦5,000 / month
    label:        "Silver",
  },
  gold: {
    productLimit: 999999,    // unlimited — display as "Unlimited" in UI
    isVerified:   true,
    monthlyPrice: 12000,     // ₦12,000 / month  (was ₦15,000 in some files — pick one and stick to it)
    label:        "Gold",
  },
};

// ─────────────────────────────────────────────────────────────
// MAIN CALCULATOR — call this wherever an order is processed.
//
// price      — sale price in Naira        e.g. 10000
// category   — product category string    e.g. "fashion"
// vendorPlan — vendor's current plan      e.g. "silver"
// ─────────────────────────────────────────────────────────────
export const calculateCommission = (price, category, vendorPlan) => {
  const key          = category?.toLowerCase().trim();
  const baseRate     = COMMISSION_RATES[key] ?? COMMISSION_RATES.default;
  const multiplier   = PLAN_MULTIPLIER[vendorPlan] ?? PLAN_MULTIPLIER.basic;
  const effectiveRate    = baseRate * multiplier;
  const commissionAmount = parseFloat((price * effectiveRate).toFixed(2));
  const vendorEarns      = parseFloat((price - commissionAmount).toFixed(2));

  return {
    baseRate,          // raw category rate        e.g. 0.12
    multiplier,        // plan discount factor     e.g. 0.5
    effectiveRate,     // final rate applied       e.g. 0.06
    commissionAmount,  // what the platform keeps  e.g. 600
    vendorEarns,       // what the vendor receives e.g. 9400
  };
};