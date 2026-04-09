"""
Core parcel business logic.

All functions receive an AsyncSession that already has RLS set
(injected by get_db_for_user dependency). They never filter by
company_id themselves — RLS handles that at the DB level.
"""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.parcel import Parcel, ParcelLog, ParcelStatus
from app.models.trip import Trip
from app.services.otp_service import (
    generate_otp,
    is_otp_locked,
    verify_otp,
)


async def get_parcel_or_404(db: AsyncSession, parcel_id: int) -> Parcel:
    result = await db.execute(
        select(Parcel)
        .where(Parcel.id == parcel_id)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcel not found")
    return parcel


async def get_parcel_by_tracking_or_404(db: AsyncSession, tracking_number: str) -> Parcel:
    result = await db.execute(
        select(Parcel)
        .where(Parcel.tracking_number == tracking_number)
        .options(
            selectinload(Parcel.origin_station),
            selectinload(Parcel.destination_station),
            selectinload(Parcel.current_trip).selectinload(Trip.vehicle),
        )
    )
    parcel = result.scalar_one_or_none()
    if parcel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcel not found")
    return parcel


async def validate_and_load(
    db: AsyncSession,
    parcel_id: int,
    trip_id: int,
    clerk_id: int,
) -> Parcel:
    """
    The "No-Mistake" engine.
    Compares parcel.destination_station_id vs trip.destination_station_id.
    Raises HTTP 400 (DESTINATION_MISMATCH) if they differ.
    """
    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.status != ParcelStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parcel is already in status '{parcel.status}'. Cannot load again.",
        )

    trip_result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(selectinload(Trip.destination_station), selectinload(Trip.vehicle))
    )
    trip = trip_result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    # ── THE ERROR PREVENTER ────────────────────────────────────────────────────
    if parcel.destination_station_id != trip.destination_station_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "DESTINATION_MISMATCH",
                "correct_destination": parcel.destination_station.name,
                "bus_destination": trip.destination_station.name,
                "bus_plate": trip.vehicle.plate_number,
            },
        )

    # Update parcel
    previous_status = parcel.status
    parcel.status = ParcelStatus.in_transit
    parcel.current_trip_id = trip.id
    parcel.loaded_at = datetime.now(UTC)

    # Audit log
    log = ParcelLog(
        parcel_id=parcel.id,
        clerk_id=clerk_id,
        previous_status=previous_status.value,
        new_status=ParcelStatus.in_transit.value,
        note=f"Loaded onto bus {trip.vehicle.plate_number} (trip {trip.id})",
        occurred_at=datetime.now(UTC),
    )
    db.add(log)
    await db.flush()
    return parcel


async def unload_parcel(db: AsyncSession, parcel_id: int, clerk_id: int) -> tuple[Parcel, str]:
    """
    Marks parcel as arrived. Generates OTP for collection.
    Returns (parcel, otp_code) — caller should send otp_code via SMS.
    """
    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.status != ParcelStatus.in_transit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot unload a parcel in status '{parcel.status}'.",
        )

    otp_code, otp_expires_at = generate_otp()
    previous_status = parcel.status

    parcel.status = ParcelStatus.arrived
    parcel.otp_code = otp_code
    parcel.otp_expires_at = otp_expires_at
    parcel.otp_attempt_count = 0
    parcel.arrived_at = datetime.now(UTC)

    log = ParcelLog(
        parcel_id=parcel.id,
        clerk_id=clerk_id,
        previous_status=previous_status.value,
        new_status=ParcelStatus.arrived.value,
        note="Arrived at destination station",
        occurred_at=datetime.now(UTC),
    )
    db.add(log)
    await db.flush()
    return parcel, otp_code


async def return_parcel(
    db: AsyncSession,
    parcel_id: int,
    clerk_id: int,
    reason: str | None,
) -> Parcel:
    """Marks a parcel as returned. Parcel must be in 'arrived' status."""
    parcel = await get_parcel_or_404(db, parcel_id)

    if parcel.status != ParcelStatus.arrived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATUS", "current": parcel.status.value},
        )

    previous_status = parcel.status
    parcel.status = ParcelStatus.returned
    parcel.return_reason = reason

    log = ParcelLog(
        parcel_id=parcel.id,
        clerk_id=clerk_id,
        previous_status=previous_status.value,
        new_status=ParcelStatus.returned.value,
        note=reason or "Returned to sender",
        occurred_at=datetime.now(UTC),
    )
    db.add(log)
    await db.flush()
    return parcel


async def collect_parcel(
    db: AsyncSession,
    tracking_number: str,
    user_otp: str,
    clerk_id: int,
) -> Parcel:
    """
    Verifies OTP and marks the parcel as picked_up.
    Raises 403 on wrong OTP and 400 if locked (too many attempts).
    """
    parcel = await get_parcel_by_tracking_or_404(db, tracking_number)

    if parcel.status == ParcelStatus.picked_up:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Parcel already collected."
        )
    if parcel.status != ParcelStatus.arrived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parcel is not ready for collection (status: '{parcel.status}').",
        )

    if is_otp_locked(parcel.otp_attempt_count):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many incorrect OTP attempts. Ask the station manager to resend the OTP.",
        )

    if not verify_otp(parcel.otp_code, parcel.otp_expires_at, user_otp):
        parcel.otp_attempt_count += 1
        # Commit immediately so the count is durable even if the outer
        # transaction rolls back — prevents the attempt counter from
        # being reset and bypassing the 5-attempt lockout.
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired OTP. Please check the SMS sent to the receiver.",
        )

    previous_status = parcel.status
    parcel.status = ParcelStatus.picked_up
    parcel.otp_code = None
    parcel.otp_expires_at = None
    parcel.collected_at = datetime.now(UTC)

    log = ParcelLog(
        parcel_id=parcel.id,
        clerk_id=clerk_id,
        previous_status=previous_status.value,
        new_status=ParcelStatus.picked_up.value,
        note="Collected by receiver (OTP verified)",
        occurred_at=datetime.now(UTC),
    )
    db.add(log)
    await db.flush()
    return parcel
