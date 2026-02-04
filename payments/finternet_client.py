import requests
import os
import time
import hashlib
import json
from functools import wraps
from datetime import datetime, timedelta

# Finternet API Base URL
BASE_URL = os.getenv("FINTERNET_BASE_URL", "https://api.fmm.finternetlab.io/api/v1")

HEADERS = {
    "X-API-Key": os.getenv("FINTERNET_API_KEY"),
    "Content-Type": "application/json"
}

# ============================================
# STEP 11: Rate Limit Protection
# ============================================
# Test keys allow: 100 requests per minute
# Cache payment status to avoid excessive polling

class RateLimitedCache:
    """
    Simple in-memory cache with TTL for rate limit protection.
    
    - Cache payment status
    - Avoid polling every second
    - Poll every 5-10 seconds
    """
    
    def __init__(self, default_ttl=5):
        self._cache = {}
        self._timestamps = {}
        self.default_ttl = default_ttl  # seconds
    
    def get(self, key):
        """Get cached value if not expired."""
        if key in self._cache:
            if datetime.utcnow() < self._timestamps.get(key, datetime.min):
                return self._cache[key]
            else:
                # Expired, remove
                del self._cache[key]
                del self._timestamps[key]
        return None
    
    def set(self, key, value, ttl=None):
        """Set cached value with TTL."""
        ttl = ttl or self.default_ttl
        self._cache[key] = value
        self._timestamps[key] = datetime.utcnow() + timedelta(seconds=ttl)
    
    def invalidate(self, key):
        """Remove cached value."""
        self._cache.pop(key, None)
        self._timestamps.pop(key, None)
    
    def clear(self):
        """Clear all cached values."""
        self._cache.clear()
        self._timestamps.clear()


# Global cache instance (poll every 5-10 seconds)
_cache = RateLimitedCache(default_ttl=5)


# ============================================
# STEP 10: Idempotency (Critical)
# ============================================
# Prevents double charge on:
# - create payment intent
# - refund request
# - confirm payment

class IdempotencyKeyStore:
    """
    Store and manage idempotency keys to prevent duplicate operations.
    
    In production, use Redis or database for persistence.
    """
    
    def __init__(self):
        self._keys = {}
    
    def generate_key(self, operation, *args):
        """
        Generate deterministic idempotency key from operation and args.
        
        Same inputs = same key = prevents double charge.
        """
        data = f"{operation}:{':'.join(str(a) for a in args)}"
        return hashlib.sha256(data.encode()).hexdigest()
    
    def get_or_create(self, operation, *args):
        """Get existing key or create new one."""
        key = self.generate_key(operation, *args)
        
        if key not in self._keys:
            self._keys[key] = {
                "key": key,
                "operation": operation,
                "created_at": datetime.utcnow().isoformat()
            }
        
        return key
    
    def was_used(self, key):
        """Check if key was already used."""
        return key in self._keys


# Global idempotency store
_idempotency_store = IdempotencyKeyStore()


def get_idempotency_key(operation, *identifiers):
    """
    Get idempotency key for an operation.
    
    Use for:
        - create payment intent → ("create_intent", session_id, amount)
        - refund request → ("refund", intent_id, amount)
        - confirm payment → ("confirm", intent_id)
    
    Args:
        operation: Operation name
        *identifiers: Unique identifiers for this operation
        
    Returns:
        str: Idempotency key
    """
    return _idempotency_store.get_or_create(operation, *identifiers)


# ============================================
# Rate-Limited API Client
# ============================================

def finternet_post(endpoint, payload, idempotency_key=None):
    """
    POST request to Finternet API.
    
    Args:
        endpoint: API endpoint
        payload: Request body
        idempotency_key: Optional idempotency key (CRITICAL for payments)
        
    Returns:
        dict: Response JSON
    """
    headers = HEADERS.copy()

    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=headers,
        json=payload
    )

    return response.json()


def finternet_get(endpoint, use_cache=True, cache_ttl=5):
    """
    GET request to Finternet API with optional caching.
    
    Rate limit protection: Caches responses to avoid excessive polling.
    
    Args:
        endpoint: API endpoint
        use_cache: Whether to use cached response (default True)
        cache_ttl: Cache TTL in seconds (default 5, recommended 5-10)
        
    Returns:
        dict: Response JSON
    """
    cache_key = f"GET:{endpoint}"
    
    # Check cache first
    if use_cache:
        cached = _cache.get(cache_key)
        if cached:
            return cached
    
    # Make request
    response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=HEADERS
    )
    
    result = response.json()
    
    # Cache the response
    if use_cache:
        _cache.set(cache_key, result, cache_ttl)
    
    return result


def get_payment_status_cached(intent_id, force_refresh=False):
    """
    Get payment status with caching (rate limit protection).
    
    Polls every 5-10 seconds instead of every second.
    
    Args:
        intent_id: Payment intent ID
        force_refresh: Skip cache and fetch fresh (use sparingly)
        
    Returns:
        dict: Payment intent details
    """
    return finternet_get(
        f"/payment-intents/{intent_id}",
        use_cache=not force_refresh,
        cache_ttl=5  # Poll every 5 seconds
    )


def invalidate_payment_cache(intent_id):
    """Invalidate cached payment status after known state change."""
    _cache.invalidate(f"GET:/payment-intents/{intent_id}")

