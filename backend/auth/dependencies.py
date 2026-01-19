import logging
import re
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from .jwt_validator import validate_token, get_user_id_from_token, AuthError

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Auth0 namespace for custom claims
AUTH0_NAMESPACE = "https://watch2play.local"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Dependency to validate token and return user info"""
    try:
        token = credentials.credentials
        payload = validate_token(token)

        # Extract roles from custom namespace claim
        roles = payload.get(f"{AUTH0_NAMESPACE}/roles", [])

        return {
            "sub": payload.get("sub"),
            "user_id": get_user_id_from_token(payload),
            "email": payload.get("email"),
            "permissions": payload.get("permissions", []),
            "roles": roles,
        }
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.error)


async def get_user_id(current_user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency to get just the sanitized user ID"""
    return current_user["user_id"]


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the user to have admin role"""
    roles = current_user.get("roles", [])
    if "Admin" not in roles:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def sanitize_user_id(sub: str) -> str:
    """Sanitize Auth0 user ID for use in K8s namespace names"""
    return re.sub(r'[^a-z0-9-]', '-', sub.lower())[:40]


async def get_effective_user_id(
    current_user: dict = Depends(get_current_user),
    x_impersonate_user: Optional[str] = Header(None, alias="X-Impersonate-User")
) -> str:
    """
    Get the effective user ID, supporting admin impersonation.

    If the X-Impersonate-User header is present and the current user is an admin,
    returns the sanitized ID of the impersonated user instead.
    """
    if not x_impersonate_user:
        # No impersonation, return current user's ID
        return current_user["user_id"]

    # Check if current user is admin
    roles = current_user.get("roles", [])
    if "Admin" not in roles:
        logger.warning(
            f"Non-admin user {current_user['sub']} attempted to impersonate {x_impersonate_user}"
        )
        raise HTTPException(
            status_code=403,
            detail="Only admins can impersonate other users"
        )

    # Validate the target user is not an admin (check via Management API)
    from .auth0_management import is_user_admin
    if is_user_admin(x_impersonate_user):
        logger.warning(
            f"Admin {current_user['sub']} attempted to impersonate another admin {x_impersonate_user}"
        )
        raise HTTPException(
            status_code=403,
            detail="Cannot impersonate admin users"
        )

    # Log the impersonation
    logger.info(
        f"IMPERSONATION: Admin {current_user['sub']} is impersonating user {x_impersonate_user}"
    )

    # Return the sanitized user ID of the impersonated user
    return sanitize_user_id(x_impersonate_user)
