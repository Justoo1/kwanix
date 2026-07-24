"""add ticket pickup_station_id and tracking_link_sent_at

Revision ID: 7f28570ecbaa
Revises: 0028
Create Date: 2026-07-24 10:26:23.962582

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f28570ecbaa'
down_revision: Union[str, None] = '0028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('pickup_station_id', sa.Integer(), nullable=True))
    op.add_column('tickets', sa.Column('tracking_link_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_tickets_pickup_station_id_stations',
        'tickets', 'stations', ['pickup_station_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tickets_pickup_station_id_stations', 'tickets', type_='foreignkey')
    op.drop_column('tickets', 'tracking_link_sent_at')
    op.drop_column('tickets', 'pickup_station_id')
