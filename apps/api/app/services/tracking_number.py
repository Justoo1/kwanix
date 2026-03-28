from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tracking_sequence import TrackingSequence


async def generate_tracking_number(db: AsyncSession, company_id: int, company_code: str) -> str:
    """
    Generates a unique tracking number in the format RP-{CODE}-{YEAR}-{SERIAL}.
    Uses SELECT ... FOR UPDATE to atomically increment the per-company counter,
    preventing collisions under concurrent requests.

    Example: RP-STC-2026-00247
    """
    year = datetime.now(UTC).year

    # Lock the row for this company and increment
    result = await db.execute(
        select(TrackingSequence).where(TrackingSequence.company_id == company_id).with_for_update()
    )
    seq = result.scalar_one_or_none()

    if seq is None:
        # First parcel for this company — initialize the sequence
        seq = TrackingSequence(company_id=company_id, last_serial=0)
        db.add(seq)
        await db.flush()

    seq.last_serial += 1
    await db.flush()

    return f"RP-{company_code.upper()}-{year}-{seq.last_serial:05d}"
