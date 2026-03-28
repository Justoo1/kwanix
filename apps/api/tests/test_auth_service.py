"""Tests for app/services/auth_service.py"""

from types import SimpleNamespace

import pytest
from jose import jwt

from app.config import settings
from app.models.user import UserRole
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("secret123")
        assert hashed != "secret123"

    def test_verify_correct_password(self):
        hashed = hash_password("secret123")
        assert verify_password("secret123", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("secret123")
        assert verify_password("wrongpass", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt salts each hash — same input must produce different hashes."""
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2

    def test_verify_empty_password_fails(self):
        hashed = hash_password("secret123")
        assert verify_password("", hashed) is False


class TestCreateAccessToken:
    def _make_user(self, role=UserRole.station_clerk, company_id=1, station_id=2):
        return SimpleNamespace(id=99, company_id=company_id, station_id=station_id, role=role)

    def test_token_is_decodable(self):
        user = self._make_user()
        token = create_access_token(user)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["sub"] == "99"

    def test_token_contains_company_id(self):
        user = self._make_user(company_id=5)
        token = create_access_token(user)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["company_id"] == 5

    def test_token_contains_role(self):
        user = self._make_user(role=UserRole.station_manager)
        token = create_access_token(user)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["role"] == "station_manager"

    def test_token_has_expiry(self):
        user = self._make_user()
        token = create_access_token(user)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert "exp" in payload

    def test_super_admin_has_no_company_id(self):
        user = self._make_user(role=UserRole.super_admin, company_id=None)
        token = create_access_token(user)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["company_id"] is None


class TestAuthenticateUser:
    @pytest.mark.asyncio
    async def test_valid_credentials_returns_user(self, db, clerk_user):
        user = await authenticate_user(db, "clerk@test.io", "testpass123")
        assert user is not None
        assert user.id == clerk_user.id

    @pytest.mark.asyncio
    async def test_wrong_password_returns_none(self, db, clerk_user):
        user = await authenticate_user(db, "clerk@test.io", "wrongpassword")
        assert user is None

    @pytest.mark.asyncio
    async def test_unknown_email_returns_none(self, db):
        user = await authenticate_user(db, "nobody@test.io", "anything")
        assert user is None

    @pytest.mark.asyncio
    async def test_inactive_user_returns_none(self, db, clerk_user):
        clerk_user.is_active = False
        await db.flush()
        user = await authenticate_user(db, "clerk@test.io", "testpass123")
        assert user is None
