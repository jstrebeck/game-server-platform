import logging
import re
from fastapi import WebSocket, status

from .jwt_validator import validate_token, get_user_id_from_token, AuthError

logger = logging.getLogger(__name__)

# Auth0 namespace for custom claims
AUTH0_NAMESPACE = "https://watch2play.local"


def sanitize_user_id(sub: str) -> str:
    """Sanitize Auth0 user ID for use in K8s namespace names"""
    return re.sub(r'[^a-z0-9-]', '-', sub.lower())[:40]


async def authenticate_websocket(websocket: WebSocket) -> dict:
    """
    Authenticate WebSocket connection using token from query params.
    Supports admin impersonation via 'impersonate' query param.

    Returns user info dict if authenticated, otherwise closes connection and raises exception.
    """
    token = websocket.query_params.get("token")
    impersonate_user_id = websocket.query_params.get("impersonate")

    if not token:
        logger.warning("WebSocket connection attempted without token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        raise Exception("Authentication required")

    try:
        payload = validate_token(token)
        roles = payload.get(f"{AUTH0_NAMESPACE}/roles", [])

        user_info = {
            "sub": payload.get("sub"),
            "user_id": get_user_id_from_token(payload),
            "roles": roles,
            "is_admin": "Admin" in roles,
        }

        # Handle impersonation for admins
        if impersonate_user_id:
            if not user_info["is_admin"]:
                logger.warning(
                    f"Non-admin user {user_info['sub']} attempted WebSocket impersonation"
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                raise Exception("Only admins can impersonate users")

            # Check target is not an admin
            from .auth0_management import is_user_admin
            if is_user_admin(impersonate_user_id):
                logger.warning(
                    f"Admin {user_info['sub']} attempted to impersonate admin {impersonate_user_id} via WebSocket"
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                raise Exception("Cannot impersonate admin users")

            # Set effective user ID to the impersonated user
            user_info["effective_user_id"] = sanitize_user_id(impersonate_user_id)
            user_info["impersonating"] = impersonate_user_id
            logger.info(
                f"WebSocket authenticated for admin {user_info['sub']} impersonating {impersonate_user_id}"
            )
        else:
            user_info["effective_user_id"] = user_info["user_id"]
            logger.info(f"WebSocket authenticated for user: {user_info['sub']}")

        return user_info
    except AuthError as e:
        logger.warning(f"WebSocket authentication failed: {e.error}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        raise Exception(f"Authentication failed: {e.error}")
