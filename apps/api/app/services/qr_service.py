import base64
import io

import qrcode
from qrcode.image.pil import PilImage


def generate_qr_base64(data: str, box_size: int = 10, border: int = 4) -> str:
    """
    Generates a QR code for the given data string.
    Returns a base64-encoded PNG string suitable for embedding in JSON responses
    or <img src="data:image/png;base64,..."> tags.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.read()).decode("utf-8")
