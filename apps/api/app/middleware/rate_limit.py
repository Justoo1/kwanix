from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_get_client_ip)
