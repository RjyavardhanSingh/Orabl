"""Persist prepared question sets and their generation state.

Revision ID: 008
Revises: 007
"""

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS question_sets (
        context_id TEXT PRIMARY KEY REFERENCES contexts(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed')),
        requested_count INTEGER NOT NULL,
        questions JSONB,
        error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )""")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_question_sets_jobs ON question_sets(status, updated_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS question_sets")
