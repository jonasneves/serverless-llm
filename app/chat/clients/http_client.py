import httpx
import logging

logger = logging.getLogger(__name__)

class HTTPClient:
    _instance = None
    _client: httpx.AsyncClient = None

    @classmethod
    def get_client(cls) -> httpx.AsyncClient:
        """Get the shared httpx.AsyncClient instance."""
        if cls._client is None:
            logger.info("Initializing shared HTTP client")
            cls._client = httpx.AsyncClient(
                timeout=600.0,
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
            )
        return cls._client

    @classmethod
    async def close_client(cls):
        """Close the shared httpx.AsyncClient instance."""
        if cls._client is not None:
            logger.info("Closing shared HTTP client")
            await cls._client.aclose()
            cls._client = None
