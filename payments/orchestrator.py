"""
⭐ STEP 12 — Murph Final Production Flow

Complete payment orchestration for the Murph tutoring platform.

Flow:
    Student selects session
    ↓
    Create Payment Intent
    ↓
    Redirect to Finternet Checkout
    ↓
    Confirm Payment
    ↓
    Verify SUCCEEDED
    ↓
    Session Starts
    ↓
    Metering runs
    ↓
    Session Ends
    ↓
    Calculate Final Cost
    ↓
    Refund unused funds
    ↓
    Teacher payout + bonus
    ↓
    Settlement complete
"""

from datetime import datetime
from finternet_client import get_idempotency_key, invalidate_payment_cache
from payment_intent import (
    create_payment_intent,
    confirm_payment,
    get_payment_status,
    PaymentStatus,
    SessionStatus
)
from session_metering import SessionMeter, start_session_metering
from refund import calculate_final_cost_and_refund
from teacher_settlement import settle_teacher_payment, full_settlement


class MurphPaymentOrchestrator:
    """
    Complete payment flow orchestrator for Murph tutoring sessions.
    
    Handles the entire lifecycle from session selection to settlement.
    """
    
    def __init__(self, session_id, student_id, teacher_id, rate_per_min, max_amount):
        """
        Initialize payment orchestrator for a session.
        
        Args:
            session_id: Unique session identifier
            student_id: Student's user ID
            teacher_id: Teacher's user ID
            rate_per_min: Cost per minute
            max_amount: Maximum session budget
        """
        self.session_id = session_id
        self.student_id = student_id
        self.teacher_id = teacher_id
        self.rate_per_min = float(rate_per_min)
        self.max_amount = float(max_amount)
        
        # Payment state
        self.intent_id = None
        self.payment_url = None
        self.payment_status = None
        
        # Session state
        self.session_status = SessionStatus.RESERVED
        self.meter = None
        
        # Settlement state
        self.final_cost = None
        self.refund_amount = None
        self.teacher_payout = None
    
    # ==========================================
    # STEP 1: Create Payment Intent
    # ==========================================
    
    def create_payment(self):
        """
        Create payment intent to lock maximum session budget.
        
        Returns:
            dict: Contains payment_url for checkout redirect
        """
        # Use idempotency key to prevent double charge
        idempotency_key = get_idempotency_key(
            "create_intent",
            self.session_id,
            self.max_amount
        )
        
        # Create payment intent
        from finternet_client import finternet_post
        
        payload = {
            "amount": str(self.max_amount),
            "currency": "USDC",
            "type": "DELIVERY_VS_PAYMENT"
        }
        
        response = finternet_post("/payment-intents", payload, idempotency_key)
        
        self.intent_id = response.get("id")
        self.payment_url = response.get("data", {}).get("paymentUrl")
        self.payment_status = response.get("status")
        
        return {
            "session_id": self.session_id,
            "intent_id": self.intent_id,
            "payment_url": self.payment_url,  # → Redirect student here
            "status": self.payment_status
        }
    
    # ==========================================
    # STEP 2: Confirm Payment (after checkout)
    # ==========================================
    
    def confirm_payment(self, signature, payer_address):
        """
        Confirm payment after student completes checkout.
        
        Args:
            signature: Transaction signature from checkout
            payer_address: Student's wallet address
            
        Returns:
            dict: Confirmation result
        """
        # Use idempotency key
        idempotency_key = get_idempotency_key("confirm", self.intent_id)
        
        from finternet_client import finternet_post
        
        payload = {
            "signature": signature,
            "payerAddress": payer_address
        }
        
        response = finternet_post(
            f"/payment-intents/{self.intent_id}/confirm",
            payload,
            idempotency_key
        )
        
        # Invalidate cache after state change
        invalidate_payment_cache(self.intent_id)
        
        self.payment_status = PaymentStatus.PROCESSING
        self.session_status = SessionStatus.READY
        
        return {
            "session_id": self.session_id,
            "intent_id": self.intent_id,
            "session_status": self.session_status,
            "payment_status": self.payment_status
        }
    
    # ==========================================
    # STEP 3: Verify Payment SUCCEEDED
    # ==========================================
    
    def verify_payment_succeeded(self):
        """
        Verify payment status from Finternet before starting session.
        
        NEVER trust frontend - always verify!
        
        Returns:
            bool: True if payment SUCCEEDED
        """
        response = get_payment_status(self.intent_id)
        self.payment_status = response.get("status")
        
        return self.payment_status == PaymentStatus.SUCCEEDED
    
    # ==========================================
    # STEP 4: Start Session
    # ==========================================
    
    def start_session(self):
        """
        Start session ONLY if payment SUCCEEDED.
        
        Returns:
            dict: Session start result
            
        Raises:
            ValueError: If payment not verified
        """
        if not self.verify_payment_succeeded():
            raise ValueError(
                f"Cannot start session: Payment status is {self.payment_status}, "
                f"expected {PaymentStatus.SUCCEEDED}"
            )
        
        # Start metering
        self.meter = start_session_metering(
            session_id=self.session_id,
            rate_per_min=self.rate_per_min,
            max_amount=self.max_amount
        )
        
        self.session_status = SessionStatus.ACTIVE
        
        return {
            "session_id": self.session_id,
            "session_status": self.session_status,
            "started_at": self.meter.start_time.isoformat(),
            "rate_per_min": self.rate_per_min,
            "max_amount": self.max_amount
        }
    
    # ==========================================
    # STEP 5: Get Live Cost (during session)
    # ==========================================
    
    def get_live_status(self):
        """
        Get current session metering status.
        
        Returns:
            dict: Live cost and remaining budget
        """
        if not self.meter:
            return {"error": "Session not started"}
        
        return self.meter.to_dict()
    
    # ==========================================
    # STEP 6: End Session
    # ==========================================
    
    def end_session(self):
        """
        End the session and stop metering.
        
        Returns:
            dict: Final metering data
        """
        if not self.meter:
            raise ValueError("Session not started")
        
        self.meter.stop()
        self.session_status = SessionStatus.COMPLETED
        self.final_cost = self.meter.get_live_cost()
        
        return {
            "session_id": self.session_id,
            "session_status": self.session_status,
            "ended_at": self.meter.end_time.isoformat(),
            "final_cost": self.final_cost,
            "duration_minutes": self.meter.get_elapsed_minutes()
        }
    
    # ==========================================
    # STEP 7: Calculate & Refund Unused Funds
    # ==========================================
    
    def process_refund(self):
        """
        Calculate unused funds and issue refund.
        
        Returns:
            dict: Refund result
        """
        if self.final_cost is None:
            raise ValueError("Session not ended, call end_session() first")
        
        # Use idempotency key for refund
        unused_amount = round(self.max_amount - self.final_cost, 2)
        
        if unused_amount <= 0:
            self.refund_amount = 0
            return {
                "session_id": self.session_id,
                "unused_amount": 0,
                "refund_issued": False,
                "message": "No refund needed - full budget used"
            }
        
        idempotency_key = get_idempotency_key(
            "refund",
            self.intent_id,
            unused_amount
        )
        
        from finternet_client import finternet_post
        
        payload = {
            "paymentIntentId": self.intent_id,
            "amount": str(unused_amount)
        }
        
        response = finternet_post("/refunds", payload, idempotency_key)
        
        self.refund_amount = unused_amount
        
        return {
            "session_id": self.session_id,
            "reserved_amount": self.max_amount,
            "final_cost": self.final_cost,
            "unused_amount": unused_amount,
            "refund_issued": True,
            "refund_id": response.get("id"),
            "refund_status": response.get("status")
        }
    
    # ==========================================
    # STEP 8: Teacher Payout + Bonus
    # ==========================================
    
    def settle_teacher(self, teacher_wallet, engagement_score, platform_fee_pct=0.10):
        """
        Calculate teacher payout with quality bonus and trigger payment.
        
        Args:
            teacher_wallet: Teacher's wallet address
            engagement_score: Session engagement score (0.0 - 1.0)
            platform_fee_pct: Murph platform fee percentage
            
        Returns:
            dict: Settlement result
        """
        if self.final_cost is None:
            raise ValueError("Session not ended, call end_session() first")
        
        result = full_settlement(
            session_id=self.session_id,
            teacher_wallet=teacher_wallet,
            final_cost=self.final_cost,
            engagement_score=engagement_score,
            platform_fee_percentage=platform_fee_pct
        )
        
        self.teacher_payout = result["teacher_payout"]
        
        return result
    
    # ==========================================
    # COMPLETE FLOW: Full Settlement
    # ==========================================
    
    def complete_settlement(self, teacher_wallet, engagement_score, platform_fee_pct=0.10):
        """
        Complete full settlement: refund unused + pay teacher.
        
        Call this after end_session().
        
        Args:
            teacher_wallet: Teacher's wallet address
            engagement_score: Engagement score from attention tracking
            platform_fee_pct: Platform fee percentage
            
        Returns:
            dict: Complete settlement result
        """
        refund_result = self.process_refund()
        teacher_result = self.settle_teacher(teacher_wallet, engagement_score, platform_fee_pct)
        
        return {
            "session_id": self.session_id,
            "settlement_complete": True,
            "summary": {
                "reserved_amount": self.max_amount,
                "final_cost": self.final_cost,
                "student_refund": self.refund_amount,
                "platform_fee": teacher_result["platform_fee"],
                "teacher_payout": self.teacher_payout,
                "bonus_tier": teacher_result["bonus_tier"]
            },
            "refund_details": refund_result,
            "teacher_details": teacher_result
        }
    
    # ==========================================
    # Get Full State
    # ==========================================
    
    def to_dict(self):
        """Get complete orchestrator state."""
        return {
            "session_id": self.session_id,
            "student_id": self.student_id,
            "teacher_id": self.teacher_id,
            "rate_per_min": self.rate_per_min,
            "max_amount": self.max_amount,
            "intent_id": self.intent_id,
            "payment_url": self.payment_url,
            "payment_status": self.payment_status,
            "session_status": self.session_status,
            "metering": self.meter.to_dict() if self.meter else None,
            "final_cost": self.final_cost,
            "refund_amount": self.refund_amount,
            "teacher_payout": self.teacher_payout
        }


# ============================================
# Convenience Functions
# ============================================

def create_session_payment(session_id, student_id, teacher_id, rate_per_min, max_amount):
    """
    Create a new payment orchestrator for a session.
    
    Returns:
        MurphPaymentOrchestrator: Ready to use orchestrator
    """
    return MurphPaymentOrchestrator(
        session_id=session_id,
        student_id=student_id,
        teacher_id=teacher_id,
        rate_per_min=rate_per_min,
        max_amount=max_amount
    )


# ============================================
# Example Usage
# ============================================

"""
Full Production Flow Example:

# 1. Student selects session
orchestrator = create_session_payment(
    session_id="session_123",
    student_id="student_456",
    teacher_id="teacher_789",
    rate_per_min=0.50,
    max_amount=50.00
)

# 2. Create payment intent
payment = orchestrator.create_payment()
redirect_url = payment["payment_url"]  # → Redirect student to Finternet checkout

# 3. After checkout callback, confirm payment
orchestrator.confirm_payment(
    signature="tx_signature_from_checkout",
    payer_address="student_wallet_address"
)

# 4. Start session (verifies SUCCEEDED automatically)
session_start = orchestrator.start_session()

# 5. During session - get live cost
live_status = orchestrator.get_live_status()
print(f"Current cost: ${live_status['live_cost']}")

# 6. End session
session_end = orchestrator.end_session()
print(f"Final cost: ${session_end['final_cost']}")

# 7. Complete settlement (refund + teacher payout)
settlement = orchestrator.complete_settlement(
    teacher_wallet="teacher_wallet_address",
    engagement_score=0.85  # From attention tracking AI
)

print(f"Student refund: ${settlement['summary']['student_refund']}")
print(f"Teacher payout: ${settlement['summary']['teacher_payout']}")
print(f"Bonus tier: {settlement['summary']['bonus_tier']}")
"""
