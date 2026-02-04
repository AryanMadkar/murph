"""
Mock Finternet Gateway Server

Simulates Finternet API for local development and testing.
Run: python mock_finternet_server.py

Endpoints:
- POST /api/v1/payment-intents - Create payment intent
- GET  /api/v1/payment-intents/:id - Get payment status
- POST /api/v1/payment-intents/:id/confirm - Confirm payment
- POST /api/v1/refunds - Create refund
- POST /api/v1/transfers - Teacher payout
"""

from flask import Flask, request, jsonify
import uuid
from datetime import datetime

app = Flask(__name__)

# In-memory storage
payment_intents = {}
refunds = {}
transfers = {}

# ============================================
# Payment Intents
# ============================================

@app.route('/api/v1/payment-intents', methods=['POST'])
def create_payment_intent():
    """Create a new payment intent"""
    data = request.get_json() or {}
    
    intent_id = f"pi_{uuid.uuid4().hex[:16]}"
    
    payment_intent = {
        "id": intent_id,
        "amount": data.get("amount", "0"),
        "currency": data.get("currency", "USDC"),
        "type": data.get("type", "DELIVERY_VS_PAYMENT"),
        "status": "PENDING",
        "createdAt": datetime.utcnow().isoformat(),
        "data": {
            "paymentUrl": f"http://localhost:3000/checkout/{intent_id}"
        }
    }
    
    payment_intents[intent_id] = payment_intent
    
    print(f"[MOCK] Created payment intent: {intent_id} for ${data.get('amount')}")
    
    return jsonify(payment_intent), 201


@app.route('/api/v1/payment-intents/<intent_id>', methods=['GET'])
def get_payment_intent(intent_id):
    """Get payment intent status"""
    if intent_id not in payment_intents:
        return jsonify({"error": "Not Found", "message": f"Payment intent {intent_id} not found"}), 404
    
    return jsonify(payment_intents[intent_id])


@app.route('/api/v1/payment-intents/<intent_id>/confirm', methods=['POST'])
def confirm_payment_intent(intent_id):
    """Confirm a payment intent"""
    if intent_id not in payment_intents:
        return jsonify({"error": "Not Found", "message": f"Payment intent {intent_id} not found"}), 404
    
    data = request.get_json() or {}
    
    # Update status to SUCCEEDED
    payment_intents[intent_id]["status"] = "SUCCEEDED"
    payment_intents[intent_id]["confirmedAt"] = datetime.utcnow().isoformat()
    payment_intents[intent_id]["payerAddress"] = data.get("payerAddress")
    payment_intents[intent_id]["signature"] = data.get("signature")
    
    print(f"[MOCK] Confirmed payment intent: {intent_id}")
    
    return jsonify(payment_intents[intent_id])


# ============================================
# Refunds
# ============================================

@app.route('/api/v1/refunds', methods=['POST'])
def create_refund():
    """Create a refund"""
    data = request.get_json() or {}
    
    refund_id = f"rf_{uuid.uuid4().hex[:16]}"
    intent_id = data.get("paymentIntentId")
    
    refund = {
        "id": refund_id,
        "paymentIntentId": intent_id,
        "amount": data.get("amount", "0"),
        "status": "COMPLETED",
        "createdAt": datetime.utcnow().isoformat()
    }
    
    refunds[refund_id] = refund
    
    print(f"[MOCK] Created refund: {refund_id} for ${data.get('amount')}")
    
    return jsonify(refund), 201


@app.route('/api/v1/refunds/<refund_id>', methods=['GET'])
def get_refund(refund_id):
    """Get refund status"""
    if refund_id not in refunds:
        return jsonify({"error": "Not Found"}), 404
    
    return jsonify(refunds[refund_id])


# ============================================
# Transfers (Teacher Payouts)
# ============================================

@app.route('/api/v1/transfers', methods=['POST'])
def create_transfer():
    """Create a transfer/payout"""
    data = request.get_json() or {}
    
    transfer_id = f"tr_{uuid.uuid4().hex[:16]}"
    
    transfer = {
        "id": transfer_id,
        "recipientAddress": data.get("recipientAddress"),
        "amount": data.get("amount", "0"),
        "currency": data.get("currency", "USDC"),
        "status": "COMPLETED",
        "reference": data.get("reference"),
        "description": data.get("description"),
        "createdAt": datetime.utcnow().isoformat()
    }
    
    transfers[transfer_id] = transfer
    
    print(f"[MOCK] Created transfer: {transfer_id} for ${data.get('amount')} to {data.get('recipientAddress')}")
    
    return jsonify(transfer), 201


# ============================================
# Mock Checkout Page
# ============================================

@app.route('/checkout/<intent_id>', methods=['GET'])
def checkout_page(intent_id):
    """Mock checkout page - simulates Finternet checkout"""
    if intent_id not in payment_intents:
        return "<h1>Payment not found</h1>", 404
    
    intent = payment_intents[intent_id]
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Finternet Checkout (Mock)</title>
        <style>
            body {{ font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }}
            .card {{ border: 1px solid #ddd; border-radius: 8px; padding: 20px; }}
            .amount {{ font-size: 2em; color: #2563eb; margin: 20px 0; }}
            button {{ background: #2563eb; color: white; padding: 15px 30px; border: none; border-radius: 8px; cursor: pointer; font-size: 1em; width: 100%; }}
            button:hover {{ background: #1d4ed8; }}
            .success {{ background: #10b981; color: white; padding: 20px; border-radius: 8px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🔒 Finternet Checkout</h1>
            <p><strong>Payment ID:</strong> {intent_id}</p>
            <div class="amount">${intent['amount']} {intent['currency']}</div>
            <p>This is a mock checkout for testing.</p>
            <button onclick="confirmPayment()">Pay Now (Simulate)</button>
            <div id="result"></div>
        </div>
        
        <script>
            async function confirmPayment() {{
                const response = await fetch('/api/v1/payment-intents/{intent_id}/confirm', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{
                        signature: 'mock_sig_' + Date.now(),
                        payerAddress: 'mock_wallet_0x1234567890'
                    }})
                }});
                
                if (response.ok) {{
                    document.getElementById('result').innerHTML = '<div class="success"><h2>✅ Payment Successful!</h2><p>You can close this window.</p></div>';
                }}
            }}
        </script>
    </body>
    </html>
    """


# ============================================
# Health Check
# ============================================

@app.route('/health', methods=['GET'])
@app.route('/', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "Finternet Mock Gateway",
        "version": "1.0.0",
        "endpoints": [
            "POST /api/v1/payment-intents",
            "GET  /api/v1/payment-intents/:id",
            "POST /api/v1/payment-intents/:id/confirm",
            "POST /api/v1/refunds",
            "POST /api/v1/transfers"
        ]
    })


if __name__ == '__main__':
    print("=" * 50)
    print("🏦 MOCK FINTERNET GATEWAY")
    print("=" * 50)
    print("Running on: http://localhost:3000")
    print("")
    print("Endpoints:")
    print("  POST /api/v1/payment-intents")
    print("  GET  /api/v1/payment-intents/:id")
    print("  POST /api/v1/payment-intents/:id/confirm")
    print("  POST /api/v1/refunds")
    print("  POST /api/v1/transfers")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=3000, debug=True)
