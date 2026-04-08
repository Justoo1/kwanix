"""
Paystack payment integration.
Docs: https://paystack.com/docs/api/
"""

import hashlib
import hmac

import httpx
import structlog
from fastapi import HTTPException, status

from app.config import settings

logger = structlog.get_logger()

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"
PAYSTACK_REFUND_URL = "https://api.paystack.co/refund"


def verify_paystack_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Return True if the HMAC-SHA512 signature matches the payload."""
    expected = hmac.new(secret.encode(), payload, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


async def initialize_transaction(
    amount_kobo: int,
    email: str,
    reference: str,
    callback_url: str | None = None,
    cancel_action: str | None = None,
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
    payload: dict = {
        "amount": amount_kobo,
        "email": email,
        "reference": reference,
        "currency": "GHS",
    }
    if callback_url:
        payload["callback_url"] = callback_url
    if cancel_action:
        payload["cancel_action"] = cancel_action

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


async def verify_transaction(reference: str) -> dict:
    """
    Calls GET /transaction/verify/{reference} on Paystack.

    Returns the Paystack data dict (with 'status': 'success' | 'failed' etc.)
    or raises HTTP 502 on a non-2xx response.
    Silently returns {} if paystack_secret_key is not configured (test/CI).
    """
    if not settings.paystack_secret_key:
        logger.warning("paystack.verify.skipped", reason="API key not configured")
        return {}

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
    }
    url = f"https://api.paystack.co/transaction/verify/{reference}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers)

    if not response.is_success:
        logger.error(
            "paystack.verify.failed",
            status_code=response.status_code,
            reference=reference,
            body=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — could not verify transaction",
        )

    data = response.json().get("data", {})
    logger.info("paystack.verify.success", reference=reference, gateway_status=data.get("status"))
    return data


async def refund_transaction(reference: str, amount_kobo: int) -> dict:
    """
    Calls POST /refund on Paystack to refund a previously-paid transaction.

    Args:
        reference: The payment reference of the original transaction.
        amount_kobo: Amount to refund in smallest currency unit (pesewas for GHS).

    Returns:
        Paystack data dict for the refund.

    Raises:
        HTTP 502 if Paystack returns a non-2xx response.
    """
    if not settings.paystack_secret_key:
        logger.warning("paystack.refund.skipped", reason="API key not configured")
        return {}

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "transaction": reference,
        "amount": amount_kobo,
        "currency": "GHS",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(PAYSTACK_REFUND_URL, json=payload, headers=headers)

    if not response.is_success:
        logger.error(
            "paystack.refund.failed",
            status_code=response.status_code,
            reference=reference,
            body=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — Paystack refund returned a non-2xx response",
        )

    data = response.json().get("data", {})
    logger.info("paystack.refund.success", reference=reference)
    return data
