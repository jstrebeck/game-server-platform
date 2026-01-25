"""Auth0 Management API client for admin features like user listing and role checking."""

import os
import time
import logging
import httpx

logger = logging.getLogger(__name__)

# Cache for Management API token
_token_cache = {
    "token": None,
    "expires_at": 0
}

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_MGMT_DOMAIN = os.getenv("AUTH0_MGMT_DOMAIN", AUTH0_DOMAIN)  # Tenant domain for Management API
AUTH0_MGMT_CLIENT_ID = os.getenv("AUTH0_MGMT_CLIENT_ID", "")
AUTH0_MGMT_CLIENT_SECRET = os.getenv("AUTH0_MGMT_CLIENT_SECRET", "")


def get_management_token() -> str:
    """
    Get an Auth0 Management API token with caching.
    Tokens are cached until 5 minutes before expiration.
    """
    global _token_cache

    # Check if we have a valid cached token
    if _token_cache["token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["token"]

    if not AUTH0_DOMAIN or not AUTH0_MGMT_CLIENT_ID or not AUTH0_MGMT_CLIENT_SECRET:
        raise ValueError(
            "Auth0 Management API credentials not configured. "
            "Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET environment variables."
        )

    # Request a new token (must use tenant domain, not custom domain)
    token_url = f"https://{AUTH0_MGMT_DOMAIN}/oauth/token"
    payload = {
        "client_id": AUTH0_MGMT_CLIENT_ID,
        "client_secret": AUTH0_MGMT_CLIENT_SECRET,
        "audience": f"https://{AUTH0_MGMT_DOMAIN}/api/v2/",
        "grant_type": "client_credentials"
    }

    with httpx.Client(timeout=10.0) as client:
        response = client.post(token_url, json=payload)
        response.raise_for_status()
        data = response.json()

    token = data["access_token"]
    expires_in = data.get("expires_in", 86400)  # Default 24 hours

    # Cache the token (expire 5 minutes early for safety)
    _token_cache["token"] = token
    _token_cache["expires_at"] = time.time() + expires_in - 300

    logger.info("Obtained new Auth0 Management API token")
    return token


def list_users(search: str = "", page: int = 0, per_page: int = 50) -> dict:
    """
    List users from Auth0.

    Args:
        search: Optional search query (searches email, name, etc.)
        page: Page number (0-indexed)
        per_page: Number of users per page (max 100)

    Returns:
        Dict with 'users' list and 'total' count
    """
    token = get_management_token()

    # Build query parameters
    params = {
        "page": page,
        "per_page": min(per_page, 100),  # Auth0 limits to 100
        "include_totals": "true",
        "fields": "user_id,email,name,picture,created_at,last_login",
    }

    if search:
        # Search in email, name, or user_id
        params["q"] = f'email:*{search}* OR name:*{search}*'
        params["search_engine"] = "v3"

    url = f"https://{AUTH0_MGMT_DOMAIN}/api/v2/users"

    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {token}"}
        )
        response.raise_for_status()
        data = response.json()

    return {
        "users": data.get("users", data if isinstance(data, list) else []),
        "total": data.get("total", len(data) if isinstance(data, list) else 0),
        "page": page,
        "per_page": per_page
    }


def get_user_roles(user_id: str) -> list:
    """
    Get the roles assigned to a user.

    Args:
        user_id: The Auth0 user ID (e.g., 'auth0|123456')

    Returns:
        List of role objects with 'id', 'name', and 'description'
    """
    token = get_management_token()

    # URL encode the user_id as it may contain special characters like |
    import urllib.parse
    encoded_user_id = urllib.parse.quote(user_id, safe='')

    url = f"https://{AUTH0_MGMT_DOMAIN}/api/v2/users/{encoded_user_id}/roles"

    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            url,
            headers={"Authorization": f"Bearer {token}"}
        )
        response.raise_for_status()
        return response.json()


def is_user_admin(user_id: str) -> bool:
    """
    Check if a user has the Admin role.

    Args:
        user_id: The Auth0 user ID

    Returns:
        True if user has Admin role, False otherwise
    """
    try:
        roles = get_user_roles(user_id)
        return any(role.get("name") == "Admin" for role in roles)
    except Exception as e:
        logger.error(f"Error checking admin status for {user_id}: {e}")
        return False


def get_user_metadata(user_id: str) -> dict:
    """
    Get the app_metadata for a user.

    Args:
        user_id: The Auth0 user ID (e.g., 'auth0|123456')

    Returns:
        Dict containing app_metadata, or empty dict if not found
    """
    token = get_management_token()

    import urllib.parse
    encoded_user_id = urllib.parse.quote(user_id, safe='')

    url = f"https://{AUTH0_MGMT_DOMAIN}/api/v2/users/{encoded_user_id}"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                url,
                params={"fields": "app_metadata"},
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            data = response.json()
            return data.get("app_metadata", {})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.warning(f"User {user_id} not found")
            return {}
        logger.error(f"Error getting metadata for {user_id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Error getting metadata for {user_id}: {e}")
        return {}


def is_email_verified(user_id: str) -> bool:
    """
    Check if a user's email is verified via the Management API.

    This is useful when the JWT claim may be stale (e.g., user verified
    email after logging in but before token refresh).

    Args:
        user_id: The Auth0 user ID (e.g., 'auth0|123456')

    Returns:
        True if email is verified, False otherwise
    """
    token = get_management_token()

    import urllib.parse
    encoded_user_id = urllib.parse.quote(user_id, safe='')

    url = f"https://{AUTH0_MGMT_DOMAIN}/api/v2/users/{encoded_user_id}"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                url,
                params={"fields": "email_verified"},
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            data = response.json()
            return data.get("email_verified", False)
    except Exception as e:
        logger.error(f"Error checking email verification for {user_id}: {e}")
        return False


def update_user_metadata(user_id: str, metadata: dict) -> bool:
    """
    Update the app_metadata for a user.

    Args:
        user_id: The Auth0 user ID (e.g., 'auth0|123456')
        metadata: Dict of metadata fields to update (merged with existing)

    Returns:
        True if successful, False otherwise
    """
    token = get_management_token()

    import urllib.parse
    encoded_user_id = urllib.parse.quote(user_id, safe='')

    url = f"https://{AUTH0_MGMT_DOMAIN}/api/v2/users/{encoded_user_id}"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.patch(
                url,
                json={"app_metadata": metadata},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            response.raise_for_status()
            logger.info(f"Updated metadata for user {user_id}")
            return True
    except httpx.HTTPStatusError as e:
        logger.error(f"Error updating metadata for {user_id}: {e.response.text}")
        raise
    except Exception as e:
        logger.error(f"Error updating metadata for {user_id}: {e}")
        return False
