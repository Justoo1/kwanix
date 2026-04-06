"""PDF generation utilities using ReportLab."""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def generate_manifest_pdf(
    trip: object,
    company_name: str | None = None,
    brand_color: str | None = None,
) -> bytes:
    """Return PDF bytes for a trip manifest listing all passengers."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    elements = []

    title_company = company_name or "RoutePass"
    elements.append(Paragraph(f"{title_company} — Trip Manifest", styles["Title"]))
    elements.append(Spacer(1, 0.4 * cm))

    departure = getattr(getattr(trip, "departure_station", None), "name", "?")
    destination = getattr(getattr(trip, "destination_station", None), "name", "?")
    plate = getattr(getattr(trip, "vehicle", None), "plate_number", "?")
    dep_time = trip.departure_time.strftime("%Y-%m-%d %H:%M") if trip.departure_time else "?"

    for line in [
        f"Route: {departure} → {destination}",
        f"Vehicle: {plate}",
        f"Departure: {dep_time}",
        f"Status: {trip.status}",
    ]:
        elements.append(Paragraph(line, styles["Normal"]))
    elements.append(Spacer(1, 0.6 * cm))

    tickets = sorted(
        list(getattr(trip, "tickets", []) or []),
        key=lambda t: t.seat_number,
    )
    if tickets:
        table_data = [["Seat", "Passenger Name", "Phone", "Fare (GHS)"]]
        for t in tickets:
            table_data.append(
                [
                    str(t.seat_number),
                    t.passenger_name,
                    t.passenger_phone,
                    f"{float(t.fare_ghs):.2f}",
                ]
            )

        col_widths = [2 * cm, 7 * cm, 5 * cm, 3.5 * cm]
        table = Table(table_data, colWidths=col_widths)
        header_color = colors.HexColor(brand_color) if brand_color else colors.darkblue
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), header_color),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(table)
    else:
        elements.append(Paragraph("No passengers booked yet.", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


def generate_receipt_pdf(
    parcel: object,
    company_name: str | None = None,
    brand_color: str | None = None,  # noqa: ARG001 — reserved for future header styling
) -> bytes:
    """Return PDF bytes for a parcel collection receipt."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    elements = []

    title_company = company_name or "RoutePass"
    elements.append(Paragraph(f"{title_company} — Parcel Collection Receipt", styles["Title"]))
    elements.append(Spacer(1, 0.5 * cm))

    tracking_number = getattr(parcel, "tracking_number", "?")
    sender_name = getattr(parcel, "sender_name", "?")
    receiver_name = getattr(parcel, "receiver_name", "?")
    fee_ghs = getattr(parcel, "fee_ghs", 0)
    created_at = getattr(parcel, "created_at", None)
    origin_station = getattr(getattr(parcel, "origin_station", None), "name", "?")
    destination_station = getattr(getattr(parcel, "destination_station", None), "name", "?")

    collection_date = "?"
    if created_at is not None:
        try:
            collection_date = created_at.strftime("%Y-%m-%d %H:%M")
        except AttributeError:
            collection_date = str(created_at)

    fields = [
        ("Tracking Number", tracking_number),
        ("Sender", sender_name),
        ("Receiver", receiver_name),
        ("Origin", origin_station),
        ("Destination", destination_station),
        ("Fee (GHS)", f"{float(fee_ghs):.2f}"),
        ("Collected On", collection_date),
    ]

    col_widths = [5 * cm, 11 * cm]
    table_data = [
        [Paragraph(f"<b>{label}</b>", styles["Normal"]), Paragraph(value, styles["Normal"])]
        for label, value in fields
    ]
    table = Table(table_data, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 0.8 * cm))
    elements.append(
        Paragraph(
            "This receipt confirms that the above parcel has been collected by the receiver.",
            styles["Normal"],
        )
    )

    doc.build(elements)
    return buf.getvalue()
