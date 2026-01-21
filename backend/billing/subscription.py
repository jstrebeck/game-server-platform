"""Subscription management logic."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException

from auth.dependencies import get_current_user
from auth import auth0_management
from .models import SubscriptionStatus, PLANS, DEFAULT_TRIAL_PLAN

logger = logging.getLogger(__name__)

# Trial duration in hours
TRIAL_DURATION_HOURS = 48


def get_memory_for_plan(plan_id: str) -> str:
    """Get the memory allocation for a plan ID."""
    plan = PLANS.get(plan_id, PLANS[DEFAULT_TRIAL_PLAN])
    return plan["memory"]


def get_subscription_status(user_id: str) -> SubscriptionStatus:
    """
    Get the current subscription status for a user from Auth0 metadata.

    Args:
        user_id: Auth0 user ID (full ID like "auth0|xxx")

    Returns:
        SubscriptionStatus with current status details
    """
    metadata = auth0_management.get_user_metadata(user_id)

    if not metadata:
        return SubscriptionStatus(
            subscription_status="none",
            can_access_server=False
        )

    status = metadata.get("subscription_status", "none")
    trial_ends_at_str = metadata.get("trial_ends_at")
    trial_started_at_str = metadata.get("trial_started_at")
    plan_id = metadata.get("plan_id", DEFAULT_TRIAL_PLAN)

    # Parse trial dates
    trial_ends_at = None
    trial_started_at = None
    is_trial_expired = False

    if trial_ends_at_str:
        try:
            trial_ends_at = datetime.fromisoformat(trial_ends_at_str.replace("Z", "+00:00"))
            is_trial_expired = datetime.now(timezone.utc) > trial_ends_at
        except (ValueError, TypeError):
            pass

    if trial_started_at_str:
        try:
            trial_started_at = datetime.fromisoformat(trial_started_at_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    # Determine if user can access server
    can_access = False
    if status == "active":
        can_access = True
    elif status == "trialing" and not is_trial_expired:
        can_access = True

    # Get memory for the plan
    memory = get_memory_for_plan(plan_id)

    return SubscriptionStatus(
        subscription_status=status,
        stripe_customer_id=metadata.get("stripe_customer_id"),
        subscription_id=metadata.get("subscription_id"),
        trial_started_at=trial_started_at,
        trial_ends_at=trial_ends_at,
        is_trial_expired=is_trial_expired,
        can_access_server=can_access,
        plan_id=plan_id,
        memory=memory
    )


def start_trial(user_id: str) -> SubscriptionStatus:
    """
    Start a 48-hour trial for a user.

    Args:
        user_id: Auth0 user ID

    Returns:
        Updated SubscriptionStatus
    """
    now = datetime.now(timezone.utc)
    trial_ends = now + timedelta(hours=TRIAL_DURATION_HOURS)

    metadata = {
        "subscription_status": "trialing",
        "trial_started_at": now.isoformat(),
        "trial_ends_at": trial_ends.isoformat(),
        "plan_id": DEFAULT_TRIAL_PLAN  # Trial users get 2GB
    }

    auth0_management.update_user_metadata(user_id, metadata)
    logger.info(f"Started 48-hour trial for user {user_id}, expires at {trial_ends.isoformat()}")

    return SubscriptionStatus(
        subscription_status="trialing",
        trial_started_at=now,
        trial_ends_at=trial_ends,
        is_trial_expired=False,
        can_access_server=True,
        plan_id=DEFAULT_TRIAL_PLAN,
        memory=get_memory_for_plan(DEFAULT_TRIAL_PLAN)
    )


def has_started_trial(user_id: str) -> bool:
    """
    Check if a user has already started a trial.

    Args:
        user_id: Auth0 user ID

    Returns:
        True if user has started a trial before
    """
    metadata = auth0_management.get_user_metadata(user_id)
    return metadata is not None and metadata.get("trial_started_at") is not None


async def require_active_subscription(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    FastAPI dependency that requires an active subscription or valid trial.

    Raises:
        HTTPException 402 if subscription/trial is not active

    Returns:
        Current user dict if subscription is valid
    """
    user_id = current_user.get("sub")  # Full Auth0 user ID

    status = get_subscription_status(user_id)

    if not status.can_access_server:
        if status.is_trial_expired:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "trial_expired",
                    "message": "Your 48-hour trial has expired. Please subscribe to continue using your server.",
                    "trial_ended_at": status.trial_ends_at.isoformat() if status.trial_ends_at else None
                }
            )
        elif status.subscription_status == "canceled":
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "subscription_canceled",
                    "message": "Your subscription has been canceled. Please resubscribe to continue using your server."
                }
            )
        elif status.subscription_status == "past_due":
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "payment_failed",
                    "message": "Your payment has failed. Please update your payment method to continue using your server."
                }
            )
        else:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "no_subscription",
                    "message": "You need an active subscription to access this feature."
                }
            )

    return current_user
