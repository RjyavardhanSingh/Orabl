"""Concepts, prerequisite edges, and which concepts each context examines.

Concepts are per user and matched across contexts by key, so the same idea learned from two
sources accumulates one history.

Revision ID: 010
Revises: 009
"""

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, key)
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS concept_edges (
        user_id TEXT NOT NULL,
        concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        prerequisite_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        PRIMARY KEY (concept_id, prerequisite_id)
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS context_concepts (
        context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        importance INTEGER NOT NULL DEFAULT 2,
        PRIMARY KEY (context_id, concept_id)
    )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS context_concepts")
    op.execute("DROP TABLE IF EXISTS concept_edges")
    op.execute("DROP TABLE IF EXISTS concepts")
