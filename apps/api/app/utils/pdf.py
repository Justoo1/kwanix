"""PDF generation utilities using ReportLab."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def generate_manifest_pdf(trip: object) -> bytes:
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

    elements.append(Paragraph("RoutePass — Trip Manifest", styles["Title"]))
    elements.append(Spacer(1, 0.4 * cm))

    departure = getattr(getattr(trip, "departure_station", None), "name", "?")
    destination = getattr(getattr(trip, "destination_station", None), "name", "?")
    plate = getattr(getattr(trip, "vehicle", None), "plate_number", "?")
    dep_time = (
        trip.departure_time.strftime("%Y-%m-%d %H:%M") if trip.departure_time else "?"
    )

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
            table_data.append([
                str(t.seat_number),
                t.passenger_name,
                t.passenger_phone,
                f"{float(t.fare_ghs):.2f}",
            ])

        col_widths = [2 * cm, 7 * cm, 5 * cm, 3.5 * cm]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
    else:
        elements.append(Paragraph("No passengers booked yet.", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()
