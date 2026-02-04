from finternet_client import finternet_post
import uuid

# Bonus thresholds and multipliers
BONUS_TIERS = {
    "excellent": {"threshold": 0.9, "multiplier": 1.15},  # 15% bonus
    "good": {"threshold": 0.8, "multiplier": 1.10},       # 10% bonus
    "standard": {"threshold": 0.0, "multiplier": 1.0}     # No bonus
}


def calculate_quality_bonus(final_cost, engagement_score):
    """
    Calculate teacher payout with quality bonus.
    
    Bonus Logic:
        - engagement_score > 0.9: 15% bonus
        - engagement_score > 0.8: 10% bonus
        - Otherwise: no bonus
    
    Args:
        final_cost: Base session cost
        engagement_score: Score from 0.0 to 1.0 (from attention tracking)
        
    Returns:
        dict: Payout breakdown
    """
    final_cost = float(final_cost)
    engagement_score = float(engagement_score)
    
    # Determine bonus tier
    if engagement_score > BONUS_TIERS["excellent"]["threshold"]:
        tier = "excellent"
        multiplier = BONUS_TIERS["excellent"]["multiplier"]
    elif engagement_score > BONUS_TIERS["good"]["threshold"]:
        tier = "good"
        multiplier = BONUS_TIERS["good"]["multiplier"]
    else:
        tier = "standard"
        multiplier = BONUS_TIERS["standard"]["multiplier"]
    
    payout = round(final_cost * multiplier, 2)
    bonus_amount = round(payout - final_cost, 2)
    
    return {
        "final_cost": final_cost,
        "engagement_score": engagement_score,
        "bonus_tier": tier,
        "multiplier": multiplier,
        "bonus_amount": bonus_amount,
        "total_payout": payout
    }


def trigger_teacher_payout(teacher_wallet, amount, session_id=None, description=None):
    """
    Trigger payout to teacher through Finternet programmable transfer.
    
    Note: Depends on payout APIs enabled in hackathon environment.
    
    Args:
        teacher_wallet: Teacher's wallet/payment address
        amount: Amount to pay out
        session_id: Optional session ID for reference
        description: Optional payout description
        
    Returns:
        dict: Payout response from Finternet
    """
    payload = {
        "recipientAddress": teacher_wallet,
        "amount": str(amount),
        "currency": "USDC",
        "reference": session_id or str(uuid.uuid4()),
        "description": description or f"Teacher payout for session {session_id}"
    }

    return finternet_post(
        "/transfers",
        payload,
        idempotency_key=str(uuid.uuid4())
    )


def settle_teacher_payment(session_id, teacher_wallet, final_cost, engagement_score):
    """
    Complete teacher settlement: calculate bonus and trigger payout.
    
    Formula: payout = final_cost + quality_bonus
    
    Args:
        session_id: The session ID
        teacher_wallet: Teacher's wallet address
        final_cost: Base session cost
        engagement_score: Engagement score (0.0 to 1.0)
        
    Returns:
        dict: Complete settlement details
    """
    # Calculate payout with bonus
    payout_breakdown = calculate_quality_bonus(final_cost, engagement_score)
    total_payout = payout_breakdown["total_payout"]
    
    # Trigger payout through Finternet
    payout_response = trigger_teacher_payout(
        teacher_wallet=teacher_wallet,
        amount=total_payout,
        session_id=session_id,
        description=f"Session payout ({payout_breakdown['bonus_tier']} tier)"
    )
    
    result = {
        "session_id": session_id,
        "teacher_wallet": teacher_wallet,
        **payout_breakdown,
        "payout_status": payout_response.get("status"),
        "payout_id": payout_response.get("id"),
        "payout_response": payout_response
    }
    
    # TODO: Store payout record in database
    # Example:
    # db.payouts.insert({
    #     "session_id": session_id,
    #     "teacher_id": teacher_id,
    #     "amount": total_payout,
    #     "bonus_tier": payout_breakdown["bonus_tier"],
    #     "payout_id": payout_response.get("id"),
    #     "status": payout_response.get("status"),
    #     "created_at": datetime.utcnow()
    # })
    
    return result


def calculate_platform_fee(final_cost, fee_percentage=0.10):
    """
    Calculate Murph platform fee.
    
    Args:
        final_cost: Session cost
        fee_percentage: Platform fee percentage (default 10%)
        
    Returns:
        dict: Fee breakdown
    """
    platform_fee = round(float(final_cost) * fee_percentage, 2)
    teacher_base = round(float(final_cost) - platform_fee, 2)
    
    return {
        "final_cost": float(final_cost),
        "fee_percentage": fee_percentage,
        "platform_fee": platform_fee,
        "teacher_base_amount": teacher_base
    }


def full_settlement(session_id, teacher_wallet, final_cost, engagement_score, 
                    platform_fee_percentage=0.10):
    """
    Complete settlement with platform fee deduction.
    
    Flow:
        1. Deduct platform fee from final_cost
        2. Calculate quality bonus on teacher's base amount
        3. Trigger teacher payout
    
    Args:
        session_id: Session ID
        teacher_wallet: Teacher's wallet
        final_cost: Total session cost
        engagement_score: Engagement score
        platform_fee_percentage: Murph's cut (default 10%)
        
    Returns:
        dict: Complete settlement with fees and payout
    """
    # Calculate platform fee
    fee_breakdown = calculate_platform_fee(final_cost, platform_fee_percentage)
    teacher_base = fee_breakdown["teacher_base_amount"]
    
    # Calculate teacher payout with bonus (on base amount after fee)
    payout_breakdown = calculate_quality_bonus(teacher_base, engagement_score)
    
    # Trigger payout
    payout_response = trigger_teacher_payout(
        teacher_wallet=teacher_wallet,
        amount=payout_breakdown["total_payout"],
        session_id=session_id
    )
    
    return {
        "session_id": session_id,
        "gross_amount": float(final_cost),
        "platform_fee": fee_breakdown["platform_fee"],
        "teacher_base": teacher_base,
        "engagement_score": engagement_score,
        "bonus_tier": payout_breakdown["bonus_tier"],
        "bonus_amount": payout_breakdown["bonus_amount"],
        "teacher_payout": payout_breakdown["total_payout"],
        "payout_id": payout_response.get("id"),
        "payout_status": payout_response.get("status")
    }
