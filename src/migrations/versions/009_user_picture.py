"""Keep the Google profile picture on app_users.

The name was already stored at sign-in; the picture URL now travels with it so the app can
show the person's own avatar. Existing rows stay '' until their next Google sign-in.

Revision ID: 009
Revises: 008
"""

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS picture_url TEXT NOT NULL DEFAULT ''")


def downgrade() -> None:
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS picture_url")
