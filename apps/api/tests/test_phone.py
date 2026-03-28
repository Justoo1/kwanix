import pytest

from app.utils.phone import is_valid_gh_phone, normalize_gh_phone


class TestNormalizeGhPhone:
    def test_local_format_mtn(self):
        assert normalize_gh_phone("0541234567") == "233541234567"

    def test_local_format_vodafone(self):
        assert normalize_gh_phone("0201234567") == "233201234567"

    def test_local_format_airteltigo(self):
        assert normalize_gh_phone("0261234567") == "233261234567"

    def test_e164_plus_prefix(self):
        assert normalize_gh_phone("+233541234567") == "233541234567"

    def test_e164_00_prefix(self):
        assert normalize_gh_phone("00233541234567") == "233541234567"

    def test_already_normalized(self):
        assert normalize_gh_phone("233541234567") == "233541234567"

    def test_strips_spaces(self):
        assert normalize_gh_phone("0541 234 567") == "233541234567"

    def test_strips_dashes(self):
        assert normalize_gh_phone("054-123-4567") == "233541234567"

    def test_strips_dots(self):
        assert normalize_gh_phone("054.123.4567") == "233541234567"

    def test_all_mtn_prefixes(self):
        for prefix in ["024", "054", "055", "059"]:
            result = normalize_gh_phone(f"0{prefix[1:]}1234567")
            assert result.startswith("233")

    def test_all_vodafone_prefixes(self):
        for prefix in ["020", "050"]:
            result = normalize_gh_phone(f"0{prefix[1:]}1234567")
            assert result.startswith("233")

    def test_all_airteltigo_prefixes(self):
        for prefix in ["026", "056", "027"]:
            result = normalize_gh_phone(f"0{prefix[1:]}1234567")
            assert result.startswith("233")

    def test_invalid_too_short(self):
        with pytest.raises(ValueError):
            normalize_gh_phone("054123")

    def test_invalid_too_long(self):
        with pytest.raises(ValueError):
            normalize_gh_phone("05412345678901")

    def test_invalid_prefix(self):
        with pytest.raises(ValueError):
            normalize_gh_phone("0301234567")  # 030 is not a valid Ghana prefix

    def test_invalid_non_numeric(self):
        with pytest.raises(ValueError):
            normalize_gh_phone("054-ABC-1234")

    def test_invalid_empty(self):
        with pytest.raises(ValueError):
            normalize_gh_phone("")


class TestIsValidGhPhone:
    def test_valid_returns_true(self):
        assert is_valid_gh_phone("0541234567") is True

    def test_invalid_returns_false(self):
        assert is_valid_gh_phone("0301234567") is False

    def test_empty_returns_false(self):
        assert is_valid_gh_phone("") is False

    def test_e164_valid(self):
        assert is_valid_gh_phone("+233541234567") is True
