"""
Paystack payment integration.
Docs: https://paystack.com/docs/api/
"""

import httpx
import structlog
from fastapi import HTTPException, status

from app.config import settings

logger = structlog.get_logger()

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"


async def initialize_transaction(
    amount_kobo: int,
    email: str,
    reference: str,
) -> dict:
    """
    Calls POST /transaction/initialize on Paystack.

    Args:
        amount_kobo: Amount in the smallest currency unit (pesewas for GHS).
        email: Customer email (required by Paystack).
        reference: Unique transaction reference.

    Returns:
        Paystack data dict with authorization_url, access_code, reference.

    Raises:
        HTTP 502 if Paystack returns a non-2xx response.
    """
    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "amount": amount_kobo,
        "email": email,
        "reference": reference,
        "currency": "GHS",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(PAYSTACK_INITIALIZE_URL, json=payload, headers=headers)

    if not response.is_success:
        logger.error(
            "paystack.initialize.failed",
            status_code=response.status_code,
            reference=reference,
            body=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — Paystack returned a non-2xx response",
        )

    data = response.json().get("data", {})
    logger.info(
        "paystack.initialize.success",
        reference=reference,
        authorization_url=data.get("authorization_url"),
    )
    return data
