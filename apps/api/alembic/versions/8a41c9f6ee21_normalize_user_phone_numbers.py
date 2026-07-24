"""backfill: normalize existing users.phone to 233XXXXXXXXX format

Revision ID: 8a41c9f6ee21
Revises: 7f28570ecbaa
Create Date: 2026-07-24

Existing users may have been created (via POST /admin/users, prior to that
endpoint normalizing input) with phone numbers in local (0XX...) or E.164
(+233XX...) format rather than the 233XXXXXXXXX format phone-based login
compares against. This backfills them; rows that don't parse as a
recognizable Ghana number are left untouched and logged.
"""
import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8a41c9f6ee21"
down_revision: str | None = "7f28570ecbaa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VALID_GHANA_PREFIXES = {"20", "24", "26", "27", "50", "54", "55", "56", "59"}


def _normalize_gh_phone(raw: str) -> str | None:
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
        return None

    if not re.fullmatch(r"\d{9}", local):
        return None
    if local[:2] not in _VALID_GHANA_PREFIXES:
        return None
    return f"233{local}"


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, phone FROM users")).fetchall()
    for user_id, phone in rows:
        if not phone:
            continue
        normalized = _normalize_gh_phone(phone)
        if normalized is None or normalized == phone:
            continue
        conn.execute(
            sa.text("UPDATE users SET phone = :phone WHERE id = :id"),
            {"phone": normalized, "id": user_id},
        )


def downgrade() -> None:
    # Backfill is not reversible (original raw formatting isn't recorded).
    pass
