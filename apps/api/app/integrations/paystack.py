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
PAYSTACK_CHARGE_AUTH_URL = "https://api.paystack.co/transaction/charge_authorization"
PAYSTACK_CUSTOMER_URL = "https://api.paystack.co/customer"
PAYSTACK_SUBACCOUNT_URL = "https://api.paystack.co/subaccount"


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
    subaccount: str | None = None,
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
    if subaccount:
        payload["subaccount"] = subaccount
        payload["bearer"] = "subaccount"  # company bears Paystack transaction fee

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


async def create_customer(email: str, full_name: str, phone: str) -> dict:
    """
    POST /customer — creates or retrieves a Paystack customer.
    Returns the full Paystack customer data dict (including customer_code).
    """
    if not settings.paystack_secret_key:
        return {}

    parts = full_name.strip().split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(PAYSTACK_CUSTOMER_URL, json=payload, headers=headers)

    if not response.is_success:
        logger.error("paystack.create_customer.failed", body=response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — could not create customer",
        )

    data = response.json().get("data", {})
    logger.info("paystack.create_customer.success", customer_code=data.get("customer_code"))
    return data


async def charge_authorization(
    authorization_code: str,
    email: str,
    amount_kobo: int,
    reference: str,
) -> dict:
    """
    POST /transaction/charge_authorization — charges a stored card or MoMo
    without redirecting the user (recurring billing).

    Returns the Paystack data dict. Callers must inspect data["status"]:
      "success"  — settled immediately
      "failed"   — card/MoMo decline
      "send_otp" — MoMo requires OTP; treat as failed for recurring, ask user
                   to retry via the hosted payment page

    Does NOT raise HTTP 502 on failure — a card decline is an application-level
    outcome, not a gateway error. Raises 502 only on non-2xx HTTP responses.
    """
    if not settings.paystack_secret_key:
        return {}

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "authorization_code": authorization_code,
        "email": email,
        "amount": amount_kobo,
        "reference": reference,
        "currency": "GHS",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(PAYSTACK_CHARGE_AUTH_URL, json=payload, headers=headers)

    if not response.is_success:
        logger.error(
            "paystack.charge_authorization.http_error",
            status_code=response.status_code,
            reference=reference,
            body=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — charge authorization failed",
        )

    data = response.json().get("data", {})
    logger.info(
        "paystack.charge_authorization.result",
        reference=reference,
        gateway_status=data.get("status"),
    )
    return data


async def create_subaccount(
    business_name: str,
    bank_code: str,
    account_number: str,
    primary_contact_email: str,
    percentage_charge: float = 0.0,
) -> dict:
    """
    POST /subaccount — creates a split-payment subaccount for a transport company.

    percentage_charge=0.0 means 100% of each ticket payment flows to the company
    (RoutePass earns only through subscription fees, not per-transaction cuts).

    Returns the Paystack data dict (including subaccount_code).
    """
    if not settings.paystack_secret_key:
        return {}

    headers = {
        "Authorization": f"Bearer {settings.paystack_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "business_name": business_name,
        "settlement_bank": bank_code,
        "account_number": account_number,
        "percentage_charge": percentage_charge,
        "primary_contact_email": primary_contact_email,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(PAYSTACK_SUBACCOUNT_URL, json=payload, headers=headers)

    if not response.is_success:
        logger.error(
            "paystack.create_subaccount.failed",
            business_name=business_name,
            body=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error — could not create subaccount. "
            "Verify the bank code and account number.",
        )

    data = response.json().get("data", {})
    logger.info(
        "paystack.create_subaccount.success",
        subaccount_code=data.get("subaccount_code"),
    )
    return data
