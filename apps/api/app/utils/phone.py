"""
Ghana phone number normalization utilities.

Supported input formats:
  - 0XXXXXXXXX    (local format, 10 digits)
  - +233XXXXXXXXX (E.164 with +)
  - 00233XXXXXXXXX (E.164 with 00)
  - 233XXXXXXXXX  (already normalized)

All are normalized to 233XXXXXXXXX (12 digits, no + prefix)
for use with the Arkesel API.

Known Ghana carrier prefixes (first 3 digits after 233):
  MTN:        024, 054, 055, 059
  Vodafone:   020, 050
  AirtelTigo: 026, 056, 027
"""

import re

GHANA_COUNTRY_CODE = "233"

# Valid first-two digits after country code (covering all carriers)
_VALID_GHANA_PREFIXES = {
    "20",
    "24",
    "26",
    "27",
    "50",
    "54",
    "55",
    "56",
    "59",
}


def normalize_gh_phone(raw: str) -> str:
    """
    Normalize a raw Ghanaian phone number to the 233XXXXXXXXX format.

    Raises ValueError if the number cannot be recognized as a valid Ghana number.
    """
    # Strip whitespace, dashes, dots, and parentheses
    cleaned = re.sub(r"[\s\-\.\(\)]", "", raw)

    if cleaned.startswith("+233"):
        local = cleaned[4:]
    elif cleaned.startswith("00233"):
        local = cleaned[5:]
    elif cleaned.startswith("233") and len(cleaned) == 12:
        local = cleaned[3:]
    elif cleaned.startswith("0") and len(cleaned) == 10:
        local = cleaned[1:]
    else:
        raise ValueError(f"Unrecognized Ghana phone number format: {raw!r}")

    # local should now be 9 digits (e.g. "541234567")
    if not re.fullmatch(r"\d{9}", local):
        raise ValueError(
            f"Ghana phone number must have 9 local digits after country code, got: {local!r}"
        )

    prefix = local[:2]
    if prefix not in _VALID_GHANA_PREFIXES:
        raise ValueError(f"Unrecognized Ghana carrier prefix '{prefix}' in number: {raw!r}")

    return f"{GHANA_COUNTRY_CODE}{local}"


def is_valid_gh_phone(raw: str) -> bool:
    """Returns True if the number can be normalized, False otherwise."""
    try:
        normalize_gh_phone(raw)
        return True
    except ValueError:
        return False
