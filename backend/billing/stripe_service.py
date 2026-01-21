"""Stripe API wrapper for billing operations."""

import os
import logging
import stripe

logger = logging.getLogger(__name__)

# Initialize Stripe with API key
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

# Price IDs for each plan (set these in environment variables)
STRIPE_PRICE_IDS = {
    "2gb": os.getenv("STRIPE_PRICE_ID_2GB", ""),
    "4gb": os.getenv("STRIPE_PRICE_ID_4GB", ""),
    "6gb": os.getenv("STRIPE_PRICE_ID_6GB", ""),
    "8gb": os.getenv("STRIPE_PRICE_ID_8GB", ""),
}

# Legacy single price ID (fallback)
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")

STRIPE_SUCCESS_URL = os.getenv("STRIPE_SUCCESS_URL", "https://minecrafthosting.gg?payment=success")
STRIPE_CANCEL_URL = os.getenv("STRIPE_CANCEL_URL", "https://minecrafthosting.gg?payment=canceled")


def get_price_id_for_plan(plan_id: str) -> str:
    """Get the Stripe price ID for a given plan."""
    price_id = STRIPE_PRICE_IDS.get(plan_id, "")
    if not price_id:
        # Fallback to legacy single price ID
        price_id = STRIPE_PRICE_ID
    if not price_id:
        raise ValueError(f"No price ID configured for plan: {plan_id}")
    return price_id


def get_plan_id_from_price(price_id: str) -> str:
    """Get the plan ID from a Stripe price ID."""
    for plan_id, configured_price_id in STRIPE_PRICE_IDS.items():
        if configured_price_id == price_id:
            return plan_id
    # Default to 2gb if not found
    return "2gb"


def create_customer(user_id: str, email: str) -> str:
    """
    Create a Stripe customer for a user.

    Args:
        user_id: Auth0 user ID
        email: User's email address

    Returns:
        Stripe customer ID
    """
    try:
        customer = stripe.Customer.create(
            email=email,
            metadata={"auth0_user_id": user_id}
        )
        logger.info(f"Created Stripe customer {customer.id} for user {user_id}")
        return customer.id
    except stripe.StripeError as e:
        logger.error(f"Failed to create Stripe customer: {e}")
        raise


def get_or_create_customer(user_id: str, email: str, existing_customer_id: str = None) -> str:
    """
    Get existing Stripe customer or create a new one.

    Args:
        user_id: Auth0 user ID
        email: User's email address
        existing_customer_id: Optional existing customer ID from metadata

    Returns:
        Stripe customer ID
    """
    if existing_customer_id:
        try:
            # Verify customer still exists
            customer = stripe.Customer.retrieve(existing_customer_id)
            # Check if customer was deleted (deleted attr only exists if true)
            if not getattr(customer, 'deleted', False):
                return existing_customer_id
        except stripe.StripeError:
            logger.warning(f"Existing customer {existing_customer_id} not found, creating new one")

    return create_customer(user_id, email)


def create_checkout_session(customer_id: str, user_id: str, plan_id: str = "2gb") -> dict:
    """
    Create a Stripe Checkout session for subscription.

    Args:
        customer_id: Stripe customer ID
        user_id: Auth0 user ID (for metadata)
        plan_id: Plan ID ("2gb", "4gb", "6gb", "8gb")

    Returns:
        Dict with checkout_url and session_id
    """
    price_id = get_price_id_for_plan(plan_id)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            mode="subscription",
            success_url=STRIPE_SUCCESS_URL,
            cancel_url=STRIPE_CANCEL_URL,
            metadata={
                "auth0_user_id": user_id,
                "plan_id": plan_id
            },
            subscription_data={
                "metadata": {
                    "auth0_user_id": user_id,
                    "plan_id": plan_id
                }
            }
        )
        logger.info(f"Created checkout session {session.id} for customer {customer_id}, plan {plan_id}")
        return {
            "checkout_url": session.url,
            "session_id": session.id
        }
    except stripe.StripeError as e:
        logger.error(f"Failed to create checkout session: {e}")
        raise


def create_portal_session(customer_id: str) -> str:
    """
    Create a Stripe Customer Portal session.

    Args:
        customer_id: Stripe customer ID

    Returns:
        Portal session URL
    """
    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=STRIPE_SUCCESS_URL.replace("?payment=success", ""),
        )
        logger.info(f"Created portal session for customer {customer_id}")
        return session.url
    except stripe.StripeError as e:
        logger.error(f"Failed to create portal session: {e}")
        raise


def get_subscription(customer_id: str) -> dict:
    """
    Get active subscription details for a customer.

    Args:
        customer_id: Stripe customer ID

    Returns:
        Subscription details or None if no active subscription
    """
    try:
        subscriptions = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=1
        )

        if subscriptions.data:
            sub = subscriptions.data[0]
            return {
                "id": sub.id,
                "status": sub.status,
                "current_period_end": sub.current_period_end,
                "cancel_at_period_end": sub.cancel_at_period_end
            }
        return None
    except stripe.StripeError as e:
        logger.error(f"Failed to get subscription: {e}")
        raise


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    """
    Construct and verify a Stripe webhook event.

    Args:
        payload: Raw request body
        sig_header: Stripe-Signature header value

    Returns:
        Verified Stripe event
    """
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        return event
    except ValueError as e:
        logger.error(f"Invalid webhook payload: {e}")
        raise
    except stripe.SignatureVerificationError as e:
        logger.error(f"Invalid webhook signature: {e}")
        raise


# Plan upgrade order
PLAN_ORDER = ["2gb", "4gb", "6gb", "8gb"]


def get_next_plan(current_plan: str) -> str | None:
    """
    Get the next plan tier from the current plan.

    Args:
        current_plan: Current plan ID

    Returns:
        Next plan ID or None if already at max tier
    """
    try:
        current_index = PLAN_ORDER.index(current_plan)
        if current_index < len(PLAN_ORDER) - 1:
            return PLAN_ORDER[current_index + 1]
        return None
    except ValueError:
        return None


def upgrade_subscription(subscription_id: str, new_plan_id: str, user_id: str) -> dict:
    """
    Upgrade an existing subscription to a new plan.

    Args:
        subscription_id: Stripe subscription ID
        new_plan_id: New plan ID to upgrade to
        user_id: Auth0 user ID (for metadata)

    Returns:
        Dict with updated subscription info
    """
    new_price_id = get_price_id_for_plan(new_plan_id)

    try:
        # Get current subscription
        sub = stripe.Subscription.retrieve(subscription_id)

        if not sub or sub.status not in ["active", "trialing"]:
            raise ValueError("Subscription is not active")

        # Get the current subscription item ID
        if not sub.get("items") or not sub["items"].get("data"):
            raise ValueError("No subscription items found")

        subscription_item_id = sub["items"]["data"][0]["id"]

        # Update the subscription with the new price
        # Using proration_behavior="create_prorations" to charge the difference
        updated_sub = stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": subscription_item_id,
                "price": new_price_id,
            }],
            metadata={
                "auth0_user_id": user_id,
                "plan_id": new_plan_id
            },
            proration_behavior="create_prorations"
        )

        logger.info(f"Upgraded subscription {subscription_id} to plan {new_plan_id}")

        return {
            "subscription_id": updated_sub.id,
            "status": updated_sub.status,
            "plan_id": new_plan_id
        }
    except stripe.StripeError as e:
        logger.error(f"Failed to upgrade subscription: {e}")
        raise
