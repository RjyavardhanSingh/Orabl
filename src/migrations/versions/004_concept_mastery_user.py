"""per-user scoping: user_id on concept_mastery

Revision ID: 004
Revises: 003
Create Date: 2026-09-26
"""

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable like the 003 columns: orphan mastery rows (unreachable while
    # their parent contexts are NULL-owned) stay invisible. No backfill —
    # mastery is recomputed on the next completed session.
    op.execute("ALTER TABLE concept_mastery ADD COLUMN IF NOT EXISTS user_id TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS idx_concept_mastery_user_id ON concept_mastery(user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_concept_mastery_user_id")
    op.execute("ALTER TABLE concept_mastery DROP COLUMN IF EXISTS user_id")
