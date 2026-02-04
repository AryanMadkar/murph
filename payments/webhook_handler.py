"""
Finternet Payment Webhook Handler

MANDATORY: Polling is backup only. Always rely on webhooks for real-time updates.

Endpoint: POST /payments/webhook

Events handled:
- payment_intent.succeeded
- payment_intent.failed
- payment_intent.settled
- refund.completed
"""

import hmac
import hashlib
import os
from datetime import datetime

# Webhook secret for signature verification (set in .env)
WEBHOOK_SECRET = os.getenv("FINTERNET_WEBHOOK_SECRET")


# ============================================
# Event Handlers
# ============================================

def handle_payment_intent_succeeded(event_data):
    """
    Handle payment_intent.succeeded event.
    
    Action: Mark session as READY to start.
    """
    intent_id = event_data.get("id")
    
    # TODO: Update database
    # Example:
    # session = db.sessions.find_one({"payment_intent_id": intent_id})
    # db.sessions.update(session["_id"], {
    #     "status": "READY",
    #     "payment_status": "SUCCEEDED",
    #     "payment_succeeded_at": datetime.utcnow()
    # })
    
    print(f"[WEBHOOK] Payment succeeded for intent: {intent_id}")
    
    return {
        "intent_id": intent_id,
        "action": "session_marked_ready",
        "status": "READY"
    }


def handle_payment_intent_failed(event_data):
    """
    Handle payment_intent.failed event.
    
    Action: Mark session as PAYMENT_FAILED, notify student.
    """
    intent_id = event_data.get("id")
    failure_reason = event_data.get("failureReason", "Unknown")
    
    # TODO: Update database
    # Example:
    # session = db.sessions.find_one({"payment_intent_id": intent_id})
    # db.sessions.update(session["_id"], {
    #     "status": "PAYMENT_FAILED",
    #     "payment_status": "FAILED",
    #     "failure_reason": failure_reason
    # })
    
    # TODO: Notify student about payment failure
    # notify_user(session["student_id"], "Payment failed. Please try again.")
    
    print(f"[WEBHOOK] Payment failed for intent: {intent_id}, reason: {failure_reason}")
    
    return {
        "intent_id": intent_id,
        "action": "session_marked_failed",
        "failure_reason": failure_reason
    }


def handle_payment_intent_settled(event_data):
    """
    Handle payment_intent.settled event.
    
    Action: Final confirmation that funds are settled.
    """
    intent_id = event_data.get("id")
    settled_amount = event_data.get("settledAmount")
    
    # TODO: Update database
    # Example:
    # db.sessions.update({"payment_intent_id": intent_id}, {
    #     "payment_status": "SETTLED",
    #     "settled_amount": settled_amount,
    #     "settled_at": datetime.utcnow()
    # })
    
    print(f"[WEBHOOK] Payment settled for intent: {intent_id}, amount: {settled_amount}")
    
    return {
        "intent_id": intent_id,
        "action": "payment_settled",
        "settled_amount": settled_amount
    }


def handle_refund_completed(event_data):
    """
    Handle refund.completed event.
    
    Action: Mark refund as successful in database.
    """
    refund_id = event_data.get("id")
    intent_id = event_data.get("paymentIntentId")
    refunded_amount = event_data.get("amount")
    
    # TODO: Update database
    # Example:
    # db.refunds.update({"refund_id": refund_id}, {
    #     "status": "COMPLETED",
    #     "completed_at": datetime.utcnow()
    # })
    # db.sessions.update({"payment_intent_id": intent_id}, {
    #     "refund_status": "COMPLETED",
    #     "refund_amount": refunded_amount
    # })
    
    print(f"[WEBHOOK] Refund completed: {refund_id}, amount: {refunded_amount}")
    
    return {
        "refund_id": refund_id,
        "intent_id": intent_id,
        "action": "refund_marked_success",
        "refunded_amount": refunded_amount
    }


# ============================================
# Event Router
# ============================================

EVENT_HANDLERS = {
    "payment_intent.succeeded": handle_payment_intent_succeeded,
    "payment_intent.failed": handle_payment_intent_failed,
    "payment_intent.settled": handle_payment_intent_settled,
    "refund.completed": handle_refund_completed
}


def process_webhook_event(event):
    """
    Route webhook event to appropriate handler.
    
    Args:
        event: Webhook event payload
        
    Returns:
        dict: Handler result
    """
    event_type = event.get("type")
    event_data = event.get("data", {})
    event_id = event.get("id")
    
    # Log incoming event
    print(f"[WEBHOOK] Received event: {event_type} (id: {event_id})")
    
    # TODO: Idempotency check - skip if already processed
    # if db.webhook_events.find_one({"event_id": event_id}):
    #     return {"status": "already_processed"}
    
    # Route to handler
    handler = EVENT_HANDLERS.get(event_type)
    
    if handler:
        result = handler(event_data)
        
        # TODO: Mark event as processed
        # db.webhook_events.insert({
        #     "event_id": event_id,
        #     "event_type": event_type,
        #     "processed_at": datetime.utcnow(),
        #     "result": result
        # })
        
        return {"status": "processed", "result": result}
    else:
        print(f"[WEBHOOK] Unhandled event type: {event_type}")
        return {"status": "unhandled", "event_type": event_type}


# ============================================
# Signature Verification
# ============================================

def verify_webhook_signature(payload, signature, secret=None):
    """
    Verify webhook signature to ensure request is from Finternet.
    
    IMPORTANT: Always verify signatures in production!
    
    Args:
        payload: Raw request body (bytes)
        signature: Signature from X-Webhook-Signature header
        secret: Webhook secret (defaults to env var)
        
    Returns:
        bool: True if signature is valid
    """
    secret = secret or WEBHOOK_SECRET
    
    if not secret:
        print("[WEBHOOK] WARNING: No webhook secret configured!")
        return True  # Skip verification in dev (NOT for production!)
    
    expected_signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)


# ============================================
# FastAPI Endpoint (Example)
# ============================================

"""
FastAPI Implementation:

from fastapi import FastAPI, Request, HTTPException
from payments.webhook_handler import process_webhook_event, verify_webhook_signature

app = FastAPI()

@app.post("/payments/webhook")
async def webhook_handler(request: Request):
    # Get raw body for signature verification
    body = await request.body()
    signature = request.headers.get("X-Webhook-Signature", "")
    
    # Verify signature
    if not verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Parse and process event
    event = await request.json()
    result = process_webhook_event(event)
    
    return {"received": True, **result}
"""


# ============================================
# Flask Endpoint (Example)
# ============================================

"""
Flask Implementation:

from flask import Flask, request, jsonify
from payments.webhook_handler import process_webhook_event, verify_webhook_signature

app = Flask(__name__)

@app.route("/payments/webhook", methods=["POST"])
def webhook_handler():
    # Get raw body for signature verification
    body = request.get_data()
    signature = request.headers.get("X-Webhook-Signature", "")
    
    # Verify signature
    if not verify_webhook_signature(body, signature):
        return jsonify({"error": "Invalid signature"}), 401
    
    # Parse and process event
    event = request.get_json()
    result = process_webhook_event(event)
    
    return jsonify({"received": True, **result})
"""
