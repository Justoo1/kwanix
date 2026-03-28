from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, get_db_for_user
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User
from app.utils.phone import normalize_gh_phone

router = APIRouter()


class CreateTicketRequest(BaseModel):
    trip_id: int
    passenger_name: str
    passenger_phone: str
    seat_number: int
    fare_ghs: float

    @field_validator("passenger_phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        try:
            return normalize_gh_phone(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class TicketResponse(BaseModel):
    id: int
    trip_id: int
    passenger_name: str
    seat_number: int
    fare_ghs: float
    status: str
    payment_status: str

    model_config = {"from_attributes": True}


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: CreateTicketRequest,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    # Check seat is not already taken for this trip
    existing = await db.execute(
        select(Ticket).where(
            Ticket.trip_id == body.trip_id,
            Ticket.seat_number == body.seat_number,
            Ticket.status != TicketStatus.cancelled,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Seat {body.seat_number} is already booked for this trip.",
        )

    ticket = Ticket(
        company_id=current_user.company_id,
        trip_id=body.trip_id,
        created_by_id=current_user.id,
        passenger_name=body.passenger_name,
        passenger_phone=body.passenger_phone,
        seat_number=body.seat_number,
        fare_ghs=body.fare_ghs,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket
