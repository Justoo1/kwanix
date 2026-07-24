"""per-company billing mode, ticket payment_method, platform default fee pct

Revision ID: 1ca50942d045
Revises: 8a41c9f6ee21
Create Date: 2026-07-24 18:24:53.581601

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1ca50942d045'
down_revision: Union[str, None] = '8a41c9f6ee21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'companies',
        sa.Column('billing_mode', sa.String(length=20), server_default='subscription', nullable=False),
    )
    op.add_column('companies', sa.Column('transaction_fee_pct', sa.Numeric(precision=5, scale=2), nullable=True))

    op.add_column(
        'platform_config',
        sa.Column('default_fee_pct', sa.Numeric(precision=5, scale=2), server_default='5.00', nullable=False),
    )
    op.drop_column('platform_config', 'billing_mode')
    op.drop_column('platform_config', 'ticket_fee_ghs')
    op.drop_column('platform_config', 'parcel_fee_ghs')

    op.add_column('tickets', sa.Column('payment_method', sa.String(length=20), nullable=True))
    # Backfill existing tickets: online bookings always went through Paystack
    # checkout; counter sales always auto-initiated MoMo (no cash option existed
    # before this migration) — so both can be inferred from `source`.
    op.execute(
        "UPDATE tickets SET payment_method = 'online' WHERE source = 'online' AND payment_method IS NULL"
    )
    op.execute(
        "UPDATE tickets SET payment_method = 'momo' WHERE source = 'counter' AND payment_method IS NULL"
    )


def downgrade() -> None:
    op.drop_column('tickets', 'payment_method')

    op.add_column(
        'platform_config',
        sa.Column('parcel_fee_ghs', sa.NUMERIC(precision=10, scale=2), server_default=sa.text('0.50'), nullable=False),
    )
    op.add_column(
        'platform_config',
        sa.Column('ticket_fee_ghs', sa.NUMERIC(precision=10, scale=2), server_default=sa.text('0.50'), nullable=False),
    )
    op.add_column(
        'platform_config',
        sa.Column('billing_mode', sa.VARCHAR(length=20), server_default='subscription', nullable=False),
    )
    op.drop_column('platform_config', 'default_fee_pct')

    op.drop_column('companies', 'transaction_fee_pct')
    op.drop_column('companies', 'billing_mode')
