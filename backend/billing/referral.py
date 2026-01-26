"""Referral/affiliate program logic."""

import logging
import secrets
import string
from datetime import datetime, timezone
from typing import Optional, Tuple

import stripe

from auth import auth0_management

logger = logging.getLogger(__name__)

# Characters for referral code generation (excluding confusing: 0, O, I, L, 1)
REFERRAL_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
REFERRAL_CODE_LENGTH = 8

# Maximum credits a referrer can earn (6 months worth)
# Cap is calculated per-user based on their plan price
MAX_REFERRAL_CREDITS = 6

# Price in cents for each plan (used for credit calculation)
PLAN_PRICES_CENTS = {
    "2gb": 499,
    "4gb": 999,
    "6gb": 1499,
    "8gb": 1999,
}

# Default price if plan not found
DEFAULT_PLAN_PRICE_CENTS = 499


def generate_referral_code() -> str:
    """
    Generate a random 8-character alphanumeric referral code.
    Excludes confusing characters: 0, O, I, L, 1

    Returns:
        8-character uppercase alphanumeric code
    """
    return ''.join(secrets.choice(REFERRAL_CODE_CHARS) for _ in range(REFERRAL_CODE_LENGTH))


def get_or_create_referral_code(user_id: str) -> str:
    """
    Get a user's referral code, creating one if it doesn't exist.

    Args:
        user_id: Auth0 user ID

    Returns:
        The user's referral code
    """
    metadata = auth0_management.get_user_metadata(user_id)

    existing_code = metadata.get("referral_code")
    if existing_code:
        return existing_code

    # Generate a new unique code
    # In practice, collisions are extremely rare with 8 chars from 32 chars = ~1 trillion possibilities
    new_code = generate_referral_code()

    # Initialize referral stats
    referral_metadata = {
        "referral_code": new_code,
        "referral_stats": {
            "successful_referrals": 0,
            "credits_earned_cents": 0,
            "credits_cap_reached": False
        }
    }

    auth0_management.update_user_metadata(user_id, referral_metadata)
    logger.info(f"Created referral code {new_code} for user {user_id}")

    return new_code


def get_referral_stats(user_id: str) -> dict:
    """
    Get the referral statistics for a user.

    Args:
        user_id: Auth0 user ID

    Returns:
        Dict containing referral_code, successful_referrals, credits_earned_cents, credits_cap_reached
    """
    metadata = auth0_management.get_user_metadata(user_id)

    referral_code = metadata.get("referral_code")
    stats = metadata.get("referral_stats", {})

    return {
        "referral_code": referral_code,
        "successful_referrals": stats.get("successful_referrals", 0),
        "credits_earned_cents": stats.get("credits_earned_cents", 0),
        "credits_cap_reached": stats.get("credits_cap_reached", False),
        "referred_by": metadata.get("referred_by"),
        "referred_at": metadata.get("referred_at")
    }


def validate_referral_code(code: str, current_user_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validate a referral code and find its owner.

    Args:
        code: The referral code to validate
        current_user_id: The user ID attempting to use the code

    Returns:
        Tuple of (is_valid, referrer_user_id, error_message)
    """
    if not code:
        return False, None, "Referral code is required"

    code = code.upper().strip()

    if len(code) != REFERRAL_CODE_LENGTH:
        return False, None, "Invalid referral code format"

    # Check if current user already has been referred
    current_metadata = auth0_management.get_user_metadata(current_user_id)
    if current_metadata.get("referred_by"):
        return False, None, "You have already used a referral code"

    # Check if current user owns this code (can't use your own code)
    if current_metadata.get("referral_code") == code:
        return False, None, "You cannot use your own referral code"

    # Search for the code owner using Auth0 Management API
    # Note: Auth0 doesn't support direct metadata queries, so we search all users
    # In production, consider caching codes or using a separate database
    referrer_user_id = find_user_by_referral_code(code)

    if not referrer_user_id:
        return False, None, "Invalid referral code"

    return True, referrer_user_id, None


def find_user_by_referral_code(code: str) -> Optional[str]:
    """
    Find the user ID who owns a referral code.

    Note: This searches through Auth0 users. For production scale,
    consider caching codes or using a separate lookup table.

    Args:
        code: The referral code to look up

    Returns:
        The Auth0 user_id of the code owner, or None if not found
    """
    code = code.upper().strip()

    # Auth0 doesn't support querying by app_metadata fields directly
    # We need to paginate through users - in practice this should be cached
    page = 0
    per_page = 100

    while True:
        try:
            result = auth0_management.list_users(search="", page=page, per_page=per_page)
            users = result.get("users", [])

            if not users:
                break

            for user in users:
                user_id = user.get("user_id")
                if user_id:
                    metadata = auth0_management.get_user_metadata(user_id)
                    if metadata.get("referral_code") == code:
                        return user_id

            # Check if we've retrieved all users
            total = result.get("total", 0)
            if (page + 1) * per_page >= total:
                break

            page += 1

            # Safety limit to prevent infinite loops
            if page > 100:
                logger.warning("Reached pagination limit while searching for referral code")
                break

        except Exception as e:
            logger.error(f"Error searching for referral code: {e}")
            break

    return None


def check_referral_cap(user_id: str, plan_id: str = None) -> Tuple[bool, int]:
    """
    Check if a referrer has reached their credit cap.

    Args:
        user_id: The referrer's Auth0 user ID
        plan_id: Optional plan ID to calculate cap (uses referrer's plan if not provided)

    Returns:
        Tuple of (can_receive_credit, remaining_credits_count)
    """
    metadata = auth0_management.get_user_metadata(user_id)
    stats = metadata.get("referral_stats", {})

    successful_referrals = stats.get("successful_referrals", 0)
    remaining = MAX_REFERRAL_CREDITS - successful_referrals

    return remaining > 0, max(0, remaining)


def get_referrer_plan_price(referrer_user_id: str) -> int:
    """
    Get the price in cents for the referrer's current plan.

    Args:
        referrer_user_id: The referrer's Auth0 user ID

    Returns:
        Price in cents for their plan
    """
    metadata = auth0_management.get_user_metadata(referrer_user_id)
    plan_id = metadata.get("plan_id", "2gb")
    return PLAN_PRICES_CENTS.get(plan_id, DEFAULT_PLAN_PRICE_CENTS)


def credit_referrer(referrer_user_id: str, referred_user_id: str, referred_plan_id: str) -> Tuple[bool, str]:
    """
    Credit the referrer with one month's value after a successful referral.

    The credit amount equals the price of the referrer's current plan,
    applied as a negative balance to their Stripe customer account.

    Args:
        referrer_user_id: The referrer's Auth0 user ID
        referred_user_id: The new user's Auth0 user ID
        referred_plan_id: The plan the new user subscribed to

    Returns:
        Tuple of (success, message)
    """
    # Check if referrer has reached their cap
    can_receive, remaining = check_referral_cap(referrer_user_id)

    if not can_receive:
        logger.info(f"Referrer {referrer_user_id} has reached credit cap, no credit applied")
        return False, "Referrer has reached maximum referral credits"

    # Get referrer's Stripe customer ID and plan price
    referrer_metadata = auth0_management.get_user_metadata(referrer_user_id)
    stripe_customer_id = referrer_metadata.get("stripe_customer_id")

    if not stripe_customer_id:
        logger.warning(f"Referrer {referrer_user_id} has no Stripe customer ID")
        return False, "Referrer does not have a billing account"

    # Calculate credit amount (equal to referrer's plan price)
    credit_amount_cents = get_referrer_plan_price(referrer_user_id)

    try:
        # Apply credit to Stripe customer balance (negative balance = credit)
        stripe.Customer.modify(
            stripe_customer_id,
            balance=-credit_amount_cents  # Negative = credit
        )

        logger.info(f"Applied {credit_amount_cents} cents credit to referrer {referrer_user_id}")

        # Update referrer's stats
        stats = referrer_metadata.get("referral_stats", {})
        new_successful = stats.get("successful_referrals", 0) + 1
        new_credits_earned = stats.get("credits_earned_cents", 0) + credit_amount_cents

        auth0_management.update_user_metadata(referrer_user_id, {
            "referral_stats": {
                "successful_referrals": new_successful,
                "credits_earned_cents": new_credits_earned,
                "credits_cap_reached": new_successful >= MAX_REFERRAL_CREDITS
            }
        })

        return True, f"Credit of ${credit_amount_cents / 100:.2f} applied"

    except stripe.StripeError as e:
        logger.error(f"Failed to credit referrer {referrer_user_id}: {e}")
        return False, f"Failed to apply credit: {str(e)}"


def mark_user_as_referred(user_id: str, referrer_user_id: str) -> bool:
    """
    Mark a user as having been referred by another user.

    Args:
        user_id: The new user's Auth0 user ID
        referrer_user_id: The referrer's Auth0 user ID

    Returns:
        True if successful
    """
    try:
        auth0_management.update_user_metadata(user_id, {
            "referred_by": referrer_user_id,
            "referred_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Marked user {user_id} as referred by {referrer_user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to mark user as referred: {e}")
        return False
