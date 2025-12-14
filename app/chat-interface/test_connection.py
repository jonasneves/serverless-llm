
import httpx
import asyncio

async def check_connection():
    endpoints = {
        "QWEN_API_URL": "http://localhost:8001",
        "PHI_API_URL": "http://localhost:8002",
        "LLAMA_API_URL": "http://localhost:8003",
        "MISTRAL_API_URL": "http://localhost:8005",
    }
    
    print("Testing connection to model endpoints...")
    
    async with httpx.AsyncClient() as client:
        for name, url in endpoints.items():
            try:
                # Try simple health check first
                print(f"Checking {name} ({url})...")
                resp = await client.get(f"{url}/health", timeout=2.0)
                print(f"  {name}: {resp.status_code}")
            except Exception as e:
                print(f"  {name}: Failed ({e})")

if __name__ == "__main__":
    asyncio.run(check_connection())
