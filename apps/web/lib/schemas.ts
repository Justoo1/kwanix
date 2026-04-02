import { z } from "zod";

const GHANA_PHONE_ERROR =
  "Must be a valid Ghana number (MTN: 024/054/055/059, Vodafone: 020/050, AirtelTigo: 026/056/027)";

/**
 * Normalising schema — transforms any accepted input format into
 * the canonical 233XXXXXXXXX form (12 digits, no leading +).
 *
 * Accepted inputs: 0XXXXXXXXX, +233XXXXXXXXX, 00233XXXXXXXXX, 233XXXXXXXXX
 */
export const ghanaPhone = z
  .string()
  .transform((val) => {
    const s = val.trim();
    if (s.startsWith("+233"))  return "233" + s.slice(4);
    if (s.startsWith("00233")) return "233" + s.slice(5);
    if (s.startsWith("0"))     return "233" + s.slice(1);
    return s;
  })
  .pipe(
    z.string().regex(
      /^233(24|54|55|59|20|50|26|56|27)\d{7}$/,
      GHANA_PHONE_ERROR
    )
  );

/**
 * Display-only schema (no transform) — used for onChange inline validation
 * where we want to show errors without side-effecting the form value.
 */
export const ghanaPhoneDisplay = z
  .string()
  .regex(
    /^(\+233|00233|0|233)(24|54|55|59|20|50|26|56|27)\d{7}$/,
    GHANA_PHONE_ERROR
  );

/** Returns the first error message string, or null if valid. */
export function validateGhanaPhone(value: string): string | null {
  const result = ghanaPhoneDisplay.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}
