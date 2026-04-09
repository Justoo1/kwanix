"""Tests for app/services/tracking_number.py"""

import re

import pytest

from app.services.tracking_number import generate_tracking_number


class TestGenerateTrackingNumber:
    @pytest.mark.asyncio
    async def test_format_is_correct(self, db, company, tracking_seq):
        tn = await generate_tracking_number(db, company.id, "STC")
        # Expected: KX-STC-YYYY-NNNNN
        assert re.fullmatch(r"KX-STC-\d{4}-\d{5}", tn), f"Unexpected format: {tn}"

    @pytest.mark.asyncio
    async def test_company_code_is_uppercased(self, db, company, tracking_seq):
        tn = await generate_tracking_number(db, company.id, "stc")
        assert tn.startswith("KX-STC-")

    @pytest.mark.asyncio
    async def test_serial_increments_on_each_call(self, db, company, tracking_seq):
        tn1 = await generate_tracking_number(db, company.id, "TST")
        tn2 = await generate_tracking_number(db, company.id, "TST")
        serial1 = int(tn1.split("-")[-1])
        serial2 = int(tn2.split("-")[-1])
        assert serial2 == serial1 + 1

    @pytest.mark.asyncio
    async def test_serial_starts_at_one(self, db, company, tracking_seq):
        tn = await generate_tracking_number(db, company.id, "TST")
        serial = int(tn.split("-")[-1])
        assert serial == 1

    @pytest.mark.asyncio
    async def test_serial_is_zero_padded_to_5_digits(self, db, company, tracking_seq):
        tn = await generate_tracking_number(db, company.id, "TST")
        serial_part = tn.split("-")[-1]
        assert len(serial_part) == 5

    @pytest.mark.asyncio
    async def test_creates_sequence_if_missing(self, db, company):
        """Should auto-create the TrackingSequence row if it doesn't exist yet."""
        tn = await generate_tracking_number(db, company.id, "TST")
        assert tn is not None
