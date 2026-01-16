import os
from functools import lru_cache
from typing import Optional

import httpx
from dotenv import load_dotenv
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError

load_dotenv()

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE")
AUTH0_ALGORITHMS = os.getenv("AUTH0_ALGORITHMS", "RS256").split(",")


class AuthError(Exception):
    """Custom exception for authentication errors"""
    def __init__(self, error: str, status_code: int):
        self.error = error
        self.status_code = status_code


@lru_cache(maxsize=1)
def get_jwks() -> dict:
    """Fetch and cache JWKS from Auth0"""
    if not AUTH0_DOMAIN:
        raise AuthError("AUTH0_DOMAIN not configured", 500)

    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    response = httpx.get(jwks_url, timeout=10.0)
    response.raise_for_status()
    return response.json()


def get_signing_key(token: str) -> dict:
    """Get the signing key for the token from JWKS"""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise AuthError("Invalid token header", 401)

    jwks = get_jwks()

    for key in jwks.get("keys", []):
        if key["kid"] == unverified_header.get("kid"):
            return {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"],
            }

    raise AuthError("Unable to find appropriate signing key", 401)


def validate_token(token: str) -> dict:
    """Validate JWT token and return payload"""
    if not token:
        raise AuthError("No token provided", 401)

    if not AUTH0_DOMAIN or not AUTH0_AUDIENCE:
        raise AuthError("Auth0 configuration incomplete", 500)

    try:
        signing_key = get_signing_key(token)

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=AUTH0_ALGORITHMS,
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/"
        )

        return payload

    except ExpiredSignatureError:
        raise AuthError("Token has expired", 401)
    except JWTError as e:
        raise AuthError(f"Invalid token: {str(e)}", 401)


def get_user_id_from_token(payload: dict) -> str:
    """Extract and sanitize user ID from token payload for K8s namespace compatibility"""
    sub = payload.get("sub", "")
    if not sub:
        raise AuthError("Token missing 'sub' claim", 401)

    # Sanitize for Kubernetes namespace compatibility
    # K8s namespaces: lowercase alphanumeric and hyphens, max 63 chars
    # We use 40 chars to leave room for "server-" prefix
    sanitized = sub.replace("|", "-").replace("@", "-").replace(".", "-")
    sanitized = ''.join(c if c.isalnum() or c == '-' else '-' for c in sanitized)
    sanitized = sanitized.lower().strip('-')[:40]

    # Remove consecutive hyphens
    while '--' in sanitized:
        sanitized = sanitized.replace('--', '-')

    return sanitized
