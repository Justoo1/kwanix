"""Shared helper for resolving a ticket's pickup point (station name + time)."""

from datetime import datetime

from app.models.ticket import Ticket
from app.models.trip import Trip


def resolve_pickup(ticket: Ticket, trip: Trip | None) -> tuple[str | None, datetime | None]:
    """
    Resolve (pickup_station_name, pickup_time) for a ticket.

    Falls back to the trip's departure station/time when the ticket has no
    pickup_station_id set, or when it matches the departure station itself.
    Requires trip.stops (with .station) to be eager-loaded.
    """
    if trip is None:
        return (None, None)
    if ticket.pickup_station_id is None or ticket.pickup_station_id == trip.departure_station_id:
        name = trip.departure_station.name if trip.departure_station else None
        return (name, trip.departure_time)
    for stop in trip.stops:
        if stop.station_id == ticket.pickup_station_id:
            return (stop.station.name if stop.station else None, stop.eta)
    return (None, None)
