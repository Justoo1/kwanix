import { z } from "zod";

// Ghana phone numbers: +233XXXXXXXXX or 0XXXXXXXXX (9 digits after country/trunk code)
const GHANA_REGEX = /^(\+233|0)[2-9]\d{8}$/;

export const ghanaPhone = z
  .string()
  .trim()
  .regex(GHANA_REGEX, "Enter a valid Ghana phone number (e.g. 0244123456)");

export function formatGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }
  return phone;
}
