from finternet_client import finternet_post, finternet_get
import uuid

# Payment/Session Status Constants (matching Finternet API)
class PaymentStatus:
    INITIATED = "INITIATED"      # Payment intent created
    PENDING = "PENDING"          # Awaiting confirmation
    PROCESSING = "PROCESSING"    # Being processed
    SUCCEEDED = "SUCCEEDED"      # Payment successful
    SETTLED = "SETTLED"          # Funds settled
    COMPLETED = "COMPLETED"      # Fully complete
    FAILED = "FAILED"            # Payment failed
    CANCELLED = "CANCELLED"      # Cancelled

class SessionStatus:
    RESERVED = "RESERVED"
    READY = "READY"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"

# Valid Finternet API values
class PaymentType:
    DELIVERY_VS_PAYMENT = "DELIVERY_VS_PAYMENT"  # Escrow - release on delivery
    CONSENTED_PULL = "CONSENTED_PULL"            # Merchant pulls after consent

class SettlementMethod:
    OFF_RAMP_MOCK = "OFF_RAMP_MOCK"      # Sandbox/test
    OFF_RAMP_TO_RTP = "OFF_RAMP_TO_RTP"  # Real-time payment


def create_payment_intent(max_amount, session_id=None, teacher_bank_account=None, description=None):
    """
    Create a payment intent to lock maximum session budget using Finternet escrow.
    
    Uses DELIVERY_VS_PAYMENT type - funds are held in escrow until session completes.
    
    Args:
        max_amount: Maximum amount to reserve for the session
        session_id: Optional session ID for reference
        teacher_bank_account: Settlement destination for teacher payout
        description: Optional description
        
    Returns:
        dict: Response containing:
            - data.id: Payment intent ID (store as intent_id in DB)
            - data.status: Payment intent status (should be "INITIATED")
            - data.paymentUrl: URL to redirect student to checkout
    """
    payload = {
        "amount": str(max_amount),
        "currency": "USD",
        "type": PaymentType.DELIVERY_VS_PAYMENT,
        "settlementMethod": SettlementMethod.OFF_RAMP_MOCK,
        "settlementDestination": teacher_bank_account or "bank_account_murph_escrow",
        "description": description or f"Murph Tutoring Session {session_id or 'Payment'}",
        "metadata": {
            "session_id": session_id,
            "platform": "murph"
        }
    }

    return finternet_post(
        "/payment-intents",
        payload,
        idempotency_key=str(uuid.uuid4())
    )


def reserve_session_payment(session_id, max_amount, teacher_bank_account=None):
    """
    Reserve payment for a session - locks the maximum session budget in escrow.
    
    Use this in your backend route: POST /sessions/{session_id}/reserve-payment
    
    Args:
        session_id: The session ID to associate with this payment
        max_amount: Maximum amount to reserve
        teacher_bank_account: Teacher's bank account for settlement
        
    Returns:
        dict: Contains intent_id, status, and payment_url for frontend redirect
    """
    response = create_payment_intent(
        max_amount, 
        session_id=session_id,
        teacher_bank_account=teacher_bank_account,
        description=f"Tutoring Session #{session_id}"
    )
    
    # Extract data for DB storage and frontend
    data = response.get("data", response)
    
    result = {
        "session_id": session_id,
        "intent_id": data.get("id"),
        "status": data.get("status"),
        "payment_url": data.get("paymentUrl")
    }
    
    # TODO: Store intent_id and status in your database
    # Example:
    # db.sessions.update(session_id, {
    #     "payment_intent_id": result["intent_id"],
    #     "payment_status": result["status"]
    # })
    
    return result


def confirm_payment(intent_id, signature, payer_address):
    """
    Confirm a payment after student finishes checkout.
    
    API Endpoint: POST /payment-intents/{id}/confirm
    
    Args:
        intent_id: The payment intent ID from create_payment_intent
        signature: Transaction signature from checkout
        payer_address: Student's wallet/payment address
        
    Returns:
        dict: Confirmation response from Finternet
    """
    payload = {
        "signature": signature,
        "payerAddress": payer_address
    }

    return finternet_post(
        f"/payment-intents/{intent_id}/confirm",
        payload
    )


def handle_payment_confirmation(session_id, intent_id, signature, payer_address):
    """
    Handle payment confirmation and update session/payment status.
    
    Use this in your backend route or webhook handler.
    
    Args:
        session_id: The session ID
        intent_id: The payment intent ID
        signature: Transaction signature
        payer_address: Payer's address
        
    Returns:
        dict: Updated status information
    """
    response = confirm_payment(intent_id, signature, payer_address)
    
    result = {
        "session_id": session_id,
        "intent_id": intent_id,
        "session_status": SessionStatus.READY,
        "payment_status": PaymentStatus.PROCESSING,
        "confirmation_response": response
    }
    
    # TODO: Update your database
    # Example:
    # db.sessions.update(session_id, {
    #     "status": SessionStatus.READY,
    #     "payment_status": PaymentStatus.PROCESSING
    # })
    
    return result


def get_payment_status(intent_id):
    """
    Get payment intent status directly from Finternet.
    
    IMPORTANT: Do NOT trust frontend redirect. Always verify from Finternet.
    
    API Endpoint: GET /payment-intents/{id}
    
    Args:
        intent_id: The payment intent ID
        
    Returns:
        dict: Payment intent details including status
    """
    return finternet_get(f"/payment-intents/{intent_id}")


def verify_and_start_session(session_id, intent_id):
    """
    Verify payment status from Finternet and start session ONLY if SUCCEEDED.
    
    Use this before allowing the session to begin.
    
    Args:
        session_id: The session ID
        intent_id: The payment intent ID
        
    Returns:
        dict: Contains verified status and whether session can start
    """
    response = get_payment_status(intent_id)
    status = response.get("status")
    
    can_start = status == PaymentStatus.SUCCEEDED
    
    result = {
        "session_id": session_id,
        "intent_id": intent_id,
        "payment_status": status,
        "can_start_session": can_start,
        "session_status": SessionStatus.ACTIVE if can_start else SessionStatus.READY
    }
    
    if can_start:
        # TODO: Update session status in database
        # Example:
        # db.sessions.update(session_id, {
        #     "status": SessionStatus.ACTIVE,
        #     "started_at": datetime.utcnow()
        # })
        pass
    
    return result
