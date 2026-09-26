"""per-user scoping: user_id on sessions, materials, contexts

Revision ID: 003
Revises: 002
Create Date: 2026-09-26
"""

import os

from alembic import op
from sqlalchemy import text

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

_SCOPED_TABLES = ("sessions", "materials", "contexts")


def upgrade() -> None:
    # 1. Nullable user_id (the Neon Auth JWT `sub`) — nullable so existing
    #    rows survive with zero downtime; unreadable until backfilled.
    for table in _SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS user_id TEXT")
    for table in _SCOPED_TABLES:
        op.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)")

    # 2. Orphan backfill. Set BACKFILL_USER_ID to your Neon Auth `sub` to
    #    claim pre-auth rows; unset leaves them invisible (secure default).
    backfill_user = (os.getenv("BACKFILL_USER_ID") or "").strip()
    if not backfill_user:
        return
    for table in _SCOPED_TABLES:
        op.execute(
            text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL").bindparams(
                uid=backfill_user
            )
        )


def downgrade() -> None:
    for table in _SCOPED_TABLES:
        op.execute(f"DROP INDEX IF EXISTS idx_{table}_user_id")
    for table in _SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS user_id")
