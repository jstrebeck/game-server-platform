"""Pydantic models for billing responses."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# Available plans with RAM allocations
PLANS = {
    "2gb": {"memory": "2G", "display_name": "2 GB RAM"},
    "4gb": {"memory": "4G", "display_name": "4 GB RAM"},
    "6gb": {"memory": "6G", "display_name": "6 GB RAM"},
    "8gb": {"memory": "8G", "display_name": "8 GB RAM"},
}

# Default plan for trials
DEFAULT_TRIAL_PLAN = "2gb"


class PlanInfo(BaseModel):
    """Information about a subscription plan."""
    plan_id: str
    display_name: str
    memory: str


class SubscriptionStatus(BaseModel):
    """Response model for subscription status."""
    subscription_status: str  # "trialing", "active", "past_due", "canceled", "none"
    stripe_customer_id: Optional[str] = None
    subscription_id: Optional[str] = None
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    is_trial_expired: bool = False
    can_access_server: bool = False
    plan_id: Optional[str] = None  # "2gb", "4gb", "6gb", "8gb"
    memory: Optional[str] = None  # "2G", "4G", "6G", "8G"


class CheckoutRequest(BaseModel):
    """Request model for creating checkout session."""
    plan_id: str  # "2gb", "4gb", "6gb", "8gb"


class CheckoutResponse(BaseModel):
    """Response model for checkout session creation."""
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    """Response model for customer portal session."""
    portal_url: str


class AvailablePlansResponse(BaseModel):
    """Response model for available plans."""
    plans: List[PlanInfo]


class UpgradeResponse(BaseModel):
    """Response model for subscription upgrade."""
    success: bool
    new_plan_id: str
    new_memory: str
    message: str


class ReferralStats(BaseModel):
    """Statistics about a user's referral activity."""
    successful_referrals: int = 0
    credits_earned_cents: int = 0
    credits_cap_reached: bool = False


class ReferralCodeResponse(BaseModel):
    """Response model for getting a user's referral code and stats."""
    referral_code: str
    share_url: str
    stats: ReferralStats
    referred_by: Optional[str] = None
    referred_at: Optional[str] = None
    max_referrals: int = 6


class ReferralValidateRequest(BaseModel):
    """Request model for validating a referral code."""
    code: str


class ReferralValidateResponse(BaseModel):
    """Response model for referral code validation."""
    valid: bool
    message: str
    referrer_id: Optional[str] = None


class CheckoutWithReferralRequest(BaseModel):
    """Request model for checkout with optional referral code."""
    plan_id: str
    referral_code: Optional[str] = None
