"""Stripe webhook event handlers."""

import logging
import stripe
from auth import auth0_management
from auth.dependencies import sanitize_user_id
from k8s.k8s_manager import K8sManager

logger = logging.getLogger(__name__)

# Initialize K8s manager for server operations
k8s = K8sManager()


def handle_checkout_session_completed(event: stripe.Event) -> dict:
    """
    Handle checkout.session.completed event.
    Sets subscription status to "active" after successful payment.
    """
    session = event.data.object
    customer_id = session.customer
    subscription_id = session.subscription
    user_id = session.metadata.get("auth0_user_id")
    plan_id = session.metadata.get("plan_id", "2gb")

    if not user_id:
        # Try to get user_id from customer metadata
        try:
            customer = stripe.Customer.retrieve(customer_id)
            user_id = customer.metadata.get("auth0_user_id")
        except stripe.StripeError as e:
            logger.error(f"Failed to retrieve customer: {e}")
            return {"status": "error", "message": "Could not find user_id"}

    if not user_id:
        logger.error(f"No user_id found for checkout session {session.id}")
        return {"status": "error", "message": "No user_id in metadata"}

    # Update Auth0 metadata
    metadata = {
        "stripe_customer_id": customer_id,
        "subscription_id": subscription_id,
        "subscription_status": "active",
        "plan_id": plan_id
    }

    auth0_management.update_user_metadata(user_id, metadata)
    logger.info(f"User {user_id} subscription activated via checkout, plan: {plan_id}")

    return {"status": "success", "user_id": user_id, "plan_id": plan_id}


def handle_subscription_updated(event: stripe.Event) -> dict:
    """
    Handle customer.subscription.updated event.
    Syncs subscription status changes (e.g., renewal, status changes, plan changes).
    """
    from .stripe_service import get_plan_id_from_price

    subscription = event.data.object
    customer_id = subscription.customer
    subscription_id = subscription.id
    status = subscription.status

    user_id = subscription.metadata.get("auth0_user_id")
    plan_id = subscription.metadata.get("plan_id")

    # Try to get plan_id from the subscription items (price)
    if not plan_id and subscription.get("items") and subscription["items"].get("data"):
        price_id = subscription["items"]["data"][0].get("price", {}).get("id")
        if price_id:
            plan_id = get_plan_id_from_price(price_id)

    if not user_id:
        # Try to get user_id from customer metadata
        try:
            customer = stripe.Customer.retrieve(customer_id)
            user_id = customer.metadata.get("auth0_user_id")
        except stripe.StripeError as e:
            logger.error(f"Failed to retrieve customer: {e}")
            return {"status": "error", "message": "Could not find user_id"}

    if not user_id:
        logger.warning(f"No user_id found for subscription {subscription_id}")
        return {"status": "error", "message": "No user_id in metadata"}

    # Map Stripe status to our status
    status_map = {
        "active": "active",
        "past_due": "past_due",
        "canceled": "canceled",
        "unpaid": "past_due",
        "trialing": "active",  # Stripe's trial is different from our trial
        "incomplete": "none",
        "incomplete_expired": "none"
    }

    mapped_status = status_map.get(status, "none")

    # Update Auth0 metadata
    metadata = {
        "stripe_customer_id": customer_id,
        "subscription_id": subscription_id,
        "subscription_status": mapped_status
    }

    # Include plan_id if we have it
    if plan_id:
        metadata["plan_id"] = plan_id

    auth0_management.update_user_metadata(user_id, metadata)
    logger.info(f"User {user_id} subscription updated to {mapped_status}, plan: {plan_id}")

    return {"status": "success", "user_id": user_id, "subscription_status": mapped_status, "plan_id": plan_id}


def handle_subscription_deleted(event: stripe.Event) -> dict:
    """
    Handle customer.subscription.deleted event.
    Sets subscription status to "canceled" and stops the user's server.
    """
    subscription = event.data.object
    customer_id = subscription.customer
    subscription_id = subscription.id

    user_id = subscription.metadata.get("auth0_user_id")

    if not user_id:
        # Try to get user_id from customer metadata
        try:
            customer = stripe.Customer.retrieve(customer_id)
            user_id = customer.metadata.get("auth0_user_id")
        except stripe.StripeError as e:
            logger.error(f"Failed to retrieve customer: {e}")
            return {"status": "error", "message": "Could not find user_id"}

    if not user_id:
        logger.warning(f"No user_id found for subscription {subscription_id}")
        return {"status": "error", "message": "No user_id in metadata"}

    # Update Auth0 metadata
    metadata = {
        "subscription_status": "canceled"
    }

    auth0_management.update_user_metadata(user_id, metadata)
    logger.info(f"User {user_id} subscription canceled")

    # Stop the user's server
    sanitized_user_id = sanitize_user_id(user_id)
    namespace = f"server-{sanitized_user_id}"

    try:
        k8s.scale_deployment(namespace, "minecraft", 0)
        logger.info(f"Stopped server for user {user_id} (namespace: {namespace}) due to subscription cancellation")
    except Exception as e:
        # Server might not exist, which is fine
        logger.warning(f"Could not stop server for user {user_id}: {e}")

    return {"status": "success", "user_id": user_id, "server_stopped": True}


def handle_invoice_payment_failed(event: stripe.Event) -> dict:
    """
    Handle invoice.payment_failed event.
    Sets subscription status to "past_due".
    """
    invoice = event.data.object
    customer_id = invoice.customer
    subscription_id = invoice.subscription

    if not subscription_id:
        logger.info("Invoice payment failed but no subscription attached, skipping")
        return {"status": "skipped", "message": "No subscription on invoice"}

    # Get user_id from customer
    user_id = None
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.metadata.get("auth0_user_id")
    except stripe.StripeError as e:
        logger.error(f"Failed to retrieve customer: {e}")
        return {"status": "error", "message": "Could not retrieve customer"}

    if not user_id:
        logger.warning(f"No user_id found for customer {customer_id}")
        return {"status": "error", "message": "No user_id in metadata"}

    # Update Auth0 metadata
    metadata = {
        "subscription_status": "past_due"
    }

    auth0_management.update_user_metadata(user_id, metadata)
    logger.info(f"User {user_id} payment failed, status set to past_due")

    return {"status": "success", "user_id": user_id}


def process_webhook_event(event: stripe.Event) -> dict:
    """
    Process a Stripe webhook event and route to appropriate handler.

    Args:
        event: Verified Stripe event

    Returns:
        Handler result
    """
    event_type = event.type

    handlers = {
        "checkout.session.completed": handle_checkout_session_completed,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.payment_failed": handle_invoice_payment_failed,
    }

    handler = handlers.get(event_type)

    if handler:
        logger.info(f"Processing webhook event: {event_type}")
        return handler(event)
    else:
        logger.debug(f"Unhandled webhook event type: {event_type}")
        return {"status": "ignored", "event_type": event_type}
