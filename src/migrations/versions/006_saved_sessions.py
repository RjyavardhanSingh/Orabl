"""saved sessions: flag + title on sessions (no data duplication)

Revision ID: 006
Revises: 005
Create Date: 2026-09-29
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ")
    op.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_saved "
        "ON sessions(user_id, is_saved) WHERE is_saved"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_sessions_saved")
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS title")
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS saved_at")
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS is_saved")
