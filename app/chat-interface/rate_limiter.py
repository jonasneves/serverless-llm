"""
Rate limiter for GitHub Models API to prevent 429 errors
"""
import asyncio
import time
import logging
from collections import deque
from typing import Optional, Dict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Rate limit configuration for a specific endpoint"""
    requests_per_minute: int = 8  # Reduced from 10 to be more conservative
    concurrent_requests: int = 1  # Reduced from 2 to prevent bursts
    requests_per_day: int = 50
    min_request_interval: float = 8.0  # Minimum seconds between requests (60s / 8 requests = 7.5s)


class RateLimiter:
    """
    Rate limiter with exponential backoff for GitHub Models API

    Tracks requests per minute, concurrent requests, and daily limits
    to prevent 429 errors.
    """

    def __init__(self, config: Optional[RateLimitConfig] = None):
        """
        Initialize rate limiter

        Args:
            config: Rate limit configuration (defaults to GitHub Models free tier)
        """
        self.config = config or RateLimitConfig()

        # Track request timestamps for per-minute limit
        self.request_times: deque = deque()

        # Track daily requests
        self.daily_requests: deque = deque()

        # Semaphore for concurrent request limiting
        self.semaphore = asyncio.Semaphore(self.config.concurrent_requests)

        # Lock for thread-safe access to request tracking
        self.lock = asyncio.Lock()

        # Exponential backoff state
        self.consecutive_429s = 0
        self.last_429_time = 0
        self.last_request_time = 0
        self.last_wait_message = None

    def _clean_old_requests(self):
        """Remove request timestamps older than 1 minute and 1 day"""
        now = time.time()

        # Clean per-minute tracking (keep last 60 seconds)
        while self.request_times and now - self.request_times[0] > 60:
            self.request_times.popleft()

        # Clean daily tracking (keep last 24 hours)
        while self.daily_requests and now - self.daily_requests[0] > 86400:
            self.daily_requests.popleft()

    async def _wait_if_needed(self):
        """Wait if we're approaching rate limits. Returns a message if waiting occurred."""
        wait_message = None

        async with self.lock:
            self._clean_old_requests()

            now = time.time()

            # Enforce minimum interval between requests
            if self.last_request_time > 0:
                time_since_last = now - self.last_request_time
                if time_since_last < self.config.min_request_interval:
                    wait_time = self.config.min_request_interval - time_since_last
                    logger.info(f"Minimum interval: waiting {wait_time:.1f}s before next request")
                    wait_message = f"⏳ Rate limiting: waiting {int(wait_time)}s between requests (GitHub free tier has strict limits)"
                    await asyncio.sleep(wait_time)
                    now = time.time()  # Update now after sleep

            # Check daily limit
            if len(self.daily_requests) >= self.config.requests_per_day:
                oldest_daily = self.daily_requests[0]
                wait_time = 86400 - (now - oldest_daily)
                if wait_time > 0:
                    logger.warning(f"Daily limit reached. Waiting {wait_time:.1f}s")
                    raise Exception(
                        f"GitHub Models daily limit reached ({self.config.requests_per_day} requests/day). "
                        f"Resets in {wait_time/3600:.1f} hours. Add your own token in Settings for higher quota."
                    )

            # Check per-minute limit
            if len(self.request_times) >= self.config.requests_per_minute:
                oldest = self.request_times[0]
                wait_time = 60 - (now - oldest)
                if wait_time > 0:
                    logger.info(f"Rate limit: waiting {wait_time:.1f}s before next request")
                    wait_message = f"⏳ Rate limit: waiting {int(wait_time)}s (hit {self.config.requests_per_minute} requests/min limit). Add your own GitHub token in Settings for higher quota."
                    await asyncio.sleep(wait_time + 0.1)  # Add small buffer
                    self._clean_old_requests()
                    now = time.time()  # Update now after sleep

            # Exponential backoff if we recently hit 429
            if self.consecutive_429s > 0:
                # If last 429 was recent, apply backoff
                time_since_429 = now - self.last_429_time
                if time_since_429 < 60:  # Within last minute
                    backoff = min(2 ** self.consecutive_429s, 32)  # Cap at 32 seconds
                    logger.warning(f"Exponential backoff: waiting {backoff}s after {self.consecutive_429s} consecutive 429s")
                    wait_message = f"⚠️ Rate limited by GitHub! Waiting {backoff}s (attempt {self.consecutive_429s}). Add your own token in Settings to avoid this."
                    await asyncio.sleep(backoff)
                    now = time.time()  # Update now after sleep
                else:
                    # Reset if it's been a while
                    self.consecutive_429s = 0

            # Record this request
            self.last_request_time = now
            self.request_times.append(now)
            self.daily_requests.append(now)

        return wait_message

    async def acquire(self):
        """
        Acquire permission to make a request

        This should be used with 'async with' pattern:
        async with await rate_limiter.acquire():
            # Make API request here

        Check rate_limiter.last_wait_message after acquiring for user notification
        """
        self.last_wait_message = await self._wait_if_needed()
        return self.semaphore

    def get_wait_message(self) -> Optional[str]:
        """Get the last wait message (if any) and clear it"""
        msg = self.last_wait_message
        self.last_wait_message = None
        return msg

    def record_429(self):
        """Record that we received a 429 error"""
        self.consecutive_429s += 1
        self.last_429_time = time.time()
        logger.warning(f"Received 429 error (consecutive: {self.consecutive_429s})")

    def record_success(self):
        """Record a successful request (resets 429 counter)"""
        if self.consecutive_429s > 0:
            logger.info(f"Request succeeded after {self.consecutive_429s} 429 errors")
            self.consecutive_429s = 0


# Global rate limiters per endpoint/token
_rate_limiters: Dict[str, RateLimiter] = {}
_limiters_lock = asyncio.Lock()


async def get_rate_limiter(endpoint: str, token: str = "default") -> RateLimiter:
    """
    Get or create a rate limiter for a specific endpoint/token combination

    Args:
        endpoint: API endpoint URL
        token: Authentication token (used to separate rate limits per user)

    Returns:
        RateLimiter instance
    """
    key = f"{endpoint}:{token[:16]}"  # Use first 16 chars of token for key

    async with _limiters_lock:
        if key not in _rate_limiters:
            logger.info(f"Creating new rate limiter for {endpoint}")
            _rate_limiters[key] = RateLimiter()
        return _rate_limiters[key]
