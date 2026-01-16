from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .jwt_validator import validate_token, get_user_id_from_token, AuthError

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Dependency to validate token and return user info"""
    try:
        token = credentials.credentials
        payload = validate_token(token)
        return {
            "sub": payload.get("sub"),
            "user_id": get_user_id_from_token(payload),
            "email": payload.get("email"),
            "permissions": payload.get("permissions", []),
        }
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.error)


async def get_user_id(current_user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency to get just the sanitized user ID"""
    return current_user["user_id"]
