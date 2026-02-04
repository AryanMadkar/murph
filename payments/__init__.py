"""
Murph Payments Module

Finternet integration for pay-per-minute tutoring sessions.
"""

# Core client
from finternet_client import (
    finternet_post,
    finternet_get,
    get_idempotency_key,
    get_payment_status_cached,
    invalidate_payment_cache
)

# Payment intents
from payment_intent import (
    create_payment_intent,
    confirm_payment,
    get_payment_status,
    verify_and_start_session,
    reserve_session_payment,
    handle_payment_confirmation,
    PaymentStatus,
    SessionStatus
)

# Session metering
from session_metering import (
    SessionMeter,
    start_session_metering,
    calculate_session_cost
)

# Refunds
from refund import (
    refund_unused,
    calculate_final_cost_and_refund,
    end_session_and_settle
)

# Teacher settlement
from teacher_settlement import (
    calculate_quality_bonus,
    trigger_teacher_payout,
    settle_teacher_payment,
    calculate_platform_fee,
    full_settlement
)

# Webhooks
from webhook_handler import (
    process_webhook_event,
    verify_webhook_signature
)

# Main orchestrator
from orchestrator import (
    MurphPaymentOrchestrator,
    create_session_payment
)

__all__ = [
    # Client
    "finternet_post",
    "finternet_get",
    "get_idempotency_key",
    "get_payment_status_cached",
    "invalidate_payment_cache",
    
    # Payment Intents
    "create_payment_intent",
    "confirm_payment",
    "get_payment_status",
    "verify_and_start_session",
    "reserve_session_payment",
    "handle_payment_confirmation",
    "PaymentStatus",
    "SessionStatus",
    
    # Metering
    "SessionMeter",
    "start_session_metering",
    "calculate_session_cost",
    
    # Refunds
    "refund_unused",
    "calculate_final_cost_and_refund",
    "end_session_and_settle",
    
    # Teacher Settlement
    "calculate_quality_bonus",
    "trigger_teacher_payout",
    "settle_teacher_payment",
    "calculate_platform_fee",
    "full_settlement",
    
    # Webhooks
    "process_webhook_event",
    "verify_webhook_signature",
    
    # Orchestrator
    "MurphPaymentOrchestrator",
    "create_session_payment"
]
