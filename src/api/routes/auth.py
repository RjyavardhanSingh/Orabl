"""Auth — verified caller profile."""

from fastapi import APIRouter, Depends

from api.schemas import MeResponse
from services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me", response_model=MeResponse, summary="Auth — verified caller profile")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Return the caller's Neon Auth user id (and email when claimed)."""
    return MeResponse(id=user.id, email=user.email)
