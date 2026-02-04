from datetime import datetime, timedelta
import math

class SessionMeter:
    """
    Session metering for tracking elapsed time and calculating live costs.
    """
    
    def __init__(self, session_id, rate_per_min, max_amount=None):
        """
        Initialize session meter.
        
        Args:
            session_id: The session ID
            rate_per_min: Cost per minute (e.g., 0.50 for $0.50/min)
            max_amount: Maximum budget (from payment intent)
        """
        self.session_id = session_id
        self.rate_per_min = float(rate_per_min)
        self.max_amount = float(max_amount) if max_amount else None
        self.start_time = None
        self.end_time = None
        self.paused_duration = timedelta(0)
        self.pause_start = None
    
    def start(self):
        """Start the session timer."""
        self.start_time = datetime.utcnow()
        return self.start_time
    
    def pause(self):
        """Pause the session (e.g., for breaks)."""
        if self.start_time and not self.pause_start:
            self.pause_start = datetime.utcnow()
    
    def resume(self):
        """Resume a paused session."""
        if self.pause_start:
            self.paused_duration += datetime.utcnow() - self.pause_start
            self.pause_start = None
    
    def stop(self):
        """Stop the session timer."""
        if self.pause_start:
            self.resume()  # End any active pause
        self.end_time = datetime.utcnow()
        return self.end_time
    
    def get_elapsed_minutes(self):
        """
        Get elapsed billable minutes.
        
        Returns:
            float: Elapsed minutes (excluding paused time)
        """
        if not self.start_time:
            return 0.0
        
        end = self.end_time or datetime.utcnow()
        total_duration = end - self.start_time
        
        # Subtract paused time
        if self.pause_start:
            current_pause = datetime.utcnow() - self.pause_start
            total_duration -= current_pause
        
        billable_duration = total_duration - self.paused_duration
        
        return max(0, billable_duration.total_seconds() / 60)
    
    def get_live_cost(self):
        """
        Calculate current cost based on elapsed time.
        
        Formula: elapsed_minutes × rate_per_min
        
        Returns:
            float: Current cost
        """
        elapsed_minutes = self.get_elapsed_minutes()
        cost = elapsed_minutes * self.rate_per_min
        
        # Cap at max_amount if set
        if self.max_amount:
            cost = min(cost, self.max_amount)
        
        return round(cost, 2)
    
    def get_remaining_budget(self):
        """
        Get remaining budget from max_amount.
        
        Returns:
            float or None: Remaining budget, or None if no max set
        """
        if not self.max_amount:
            return None
        
        return round(self.max_amount - self.get_live_cost(), 2)
    
    def get_remaining_minutes(self):
        """
        Get remaining minutes based on budget.
        
        Returns:
            float or None: Remaining minutes, or None if no max set
        """
        remaining = self.get_remaining_budget()
        if remaining is None:
            return None
        
        return round(remaining / self.rate_per_min, 1)
    
    def to_dict(self):
        """
        Get current metering state as dictionary.
        
        Store this periodically in your database.
        
        Returns:
            dict: Session metering data
        """
        return {
            "session_id": self.session_id,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "elapsed_minutes": round(self.get_elapsed_minutes(), 2),
            "rate_per_min": self.rate_per_min,
            "live_cost": self.get_live_cost(),
            "max_amount": self.max_amount,
            "remaining_budget": self.get_remaining_budget(),
            "remaining_minutes": self.get_remaining_minutes(),
            "is_active": self.start_time is not None and self.end_time is None,
            "is_paused": self.pause_start is not None
        }


# Convenience functions for simple usage

def start_session_metering(session_id, rate_per_min, max_amount=None):
    """
    Create and start a new session meter.
    
    Args:
        session_id: The session ID
        rate_per_min: Cost per minute
        max_amount: Maximum budget
        
    Returns:
        SessionMeter: Active session meter
    """
    meter = SessionMeter(session_id, rate_per_min, max_amount)
    meter.start()
    return meter


def calculate_session_cost(start_time, end_time, rate_per_min):
    """
    Calculate cost for a completed session.
    
    Args:
        start_time: Session start (datetime or ISO string)
        end_time: Session end (datetime or ISO string)
        rate_per_min: Cost per minute
        
    Returns:
        dict: Cost breakdown
    """
    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time)
    if isinstance(end_time, str):
        end_time = datetime.fromisoformat(end_time)
    
    duration = end_time - start_time
    elapsed_minutes = duration.total_seconds() / 60
    total_cost = elapsed_minutes * float(rate_per_min)
    
    return {
        "elapsed_minutes": round(elapsed_minutes, 2),
        "rate_per_min": float(rate_per_min),
        "total_cost": round(total_cost, 2)
    }
