from finternet_client import finternet_post
from session_metering import calculate_session_cost

def refund_unused(intent_id, amount):
    """
    Refund unused funds back to the student.
    
    API Endpoint: POST /refunds
    
    Args:
        intent_id: The payment intent ID
        amount: Amount to refund
        
    Returns:
        dict: Refund response from Finternet
    """
    payload = {
        "paymentIntentId": intent_id,
        "amount": str(amount)
    }

    return finternet_post("/refunds", payload)


def calculate_final_cost_and_refund(session_id, intent_id, start_time, end_time, rate_per_min, reserved_amount):
    """
    Calculate final session cost and refund unused funds.
    
    Formulas:
        final_cost = duration × rate
        unused = reserved_amount - final_cost
    
    Args:
        session_id: The session ID
        intent_id: The payment intent ID
        start_time: Session start time (datetime or ISO string)
        end_time: Session end time (datetime or ISO string)
        rate_per_min: Cost per minute
        reserved_amount: Original reserved/locked amount
        
    Returns:
        dict: Final cost breakdown and refund details
    """
    # Step 6: Calculate final cost
    cost_breakdown = calculate_session_cost(start_time, end_time, rate_per_min)
    final_cost = cost_breakdown["total_cost"]
    
    # Calculate unused amount
    unused = round(float(reserved_amount) - final_cost, 2)
    
    result = {
        "session_id": session_id,
        "intent_id": intent_id,
        "duration_minutes": cost_breakdown["elapsed_minutes"],
        "rate_per_min": rate_per_min,
        "reserved_amount": float(reserved_amount),
        "final_cost": final_cost,
        "unused_amount": unused,
        "refund_issued": False,
        "refund_response": None
    }
    
    # Step 7: Refund remaining funds if any
    if unused > 0:
        refund_response = refund_unused(intent_id, unused)
        result["refund_issued"] = True
        result["refund_response"] = refund_response
    
    # TODO: Update database with final settlement
    # Example:
    # db.sessions.update(session_id, {
    #     "final_cost": final_cost,
    #     "refund_amount": unused,
    #     "status": "COMPLETED"
    # })
    
    return result


def end_session_and_settle(session_data):
    """
    Convenience function to end session and settle payment.
    
    Args:
        session_data: dict containing:
            - session_id
            - intent_id
            - start_time
            - end_time
            - rate_per_min
            - reserved_amount (max_amount from payment intent)
            
    Returns:
        dict: Settlement result
    """
    return calculate_final_cost_and_refund(
        session_id=session_data["session_id"],
        intent_id=session_data["intent_id"],
        start_time=session_data["start_time"],
        end_time=session_data["end_time"],
        rate_per_min=session_data["rate_per_min"],
        reserved_amount=session_data["reserved_amount"]
    )
