import logging
from fastapi import WebSocket, status

from .jwt_validator import validate_token, get_user_id_from_token, AuthError

logger = logging.getLogger(__name__)


async def authenticate_websocket(websocket: WebSocket) -> dict:
    """
    Authenticate WebSocket connection using token from query params.

    Returns user info dict if authenticated, otherwise closes connection and raises exception.
    """
    token = websocket.query_params.get("token")

    if not token:
        logger.warning("WebSocket connection attempted without token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        raise Exception("Authentication required")

    try:
        payload = validate_token(token)
        user_info = {
            "sub": payload.get("sub"),
            "user_id": get_user_id_from_token(payload),
        }
        logger.info(f"WebSocket authenticated for user: {user_info['sub']}")
        return user_info
    except AuthError as e:
        logger.warning(f"WebSocket authentication failed: {e.error}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        raise Exception(f"Authentication failed: {e.error}")
