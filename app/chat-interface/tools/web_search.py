"""
Web Search Tool - Search the web for information
Uses DuckDuckGo as free fallback (Tavily can be added later)
"""

import logging
import aiohttp
from typing import Dict, Any, List
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


class WebSearchTool:
    """Web search using DuckDuckGo (free, no API key needed)"""

    def __init__(self):
        self.ddg_api = "https://api.duckduckgo.com/"

    async def search(
        self,
        query: str,
        num_results: int = 3
    ) -> Dict[str, Any]:
        """
        Search the web for information

        Args:
            query: Search query
            num_results: Number of results to return (1-5)

        Returns:
            Dict with search results
        """
        try:
            # Use DuckDuckGo Instant Answer API (free, no key needed)
            async with aiohttp.ClientSession() as session:
                params = {
                    "q": query,
                    "format": "json",
                    "no_html": "1",
                    "skip_disambig": "1"
                }

                async with session.get(
                    self.ddg_api,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if not response.ok:
                        raise Exception(f"Search API error: {response.status}")

                    # DuckDuckGo returns application/x-javascript, so read as text first
                    text = await response.text()
                    import json
                    data = json.loads(text)

                    # Extract results
                    results = []

                    # Abstract (instant answer)
                    if data.get("Abstract"):
                        results.append({
                            "title": data.get("Heading", "Instant Answer"),
                            "snippet": data.get("Abstract"),
                            "url": data.get("AbstractURL", "")
                        })

                    # Related topics
                    for topic in data.get("RelatedTopics", [])[:num_results-len(results)]:
                        if isinstance(topic, dict) and "Text" in topic:
                            results.append({
                                "title": topic.get("Text", "")[:100],
                                "snippet": topic.get("Text", ""),
                                "url": topic.get("FirstURL", "")
                            })

                    # If no results, provide a message
                    if not results:
                        results.append({
                            "title": "No results found",
                            "snippet": f"Could not find specific information for: {query}",
                            "url": ""
                        })

                    return {
                        "query": query,
                        "num_results": len(results),
                        "results": results[:num_results],
                        "tool": "search",
                        "provider": "DuckDuckGo"
                    }

        except Exception as e:
            logger.error(f"Web search failed: {e}")
            return {
                "query": query,
                "num_results": 0,
                "results": [{
                    "title": "Search Error",
                    "snippet": f"Search failed: {str(e)}",
                    "url": ""
                }],
                "tool": "search",
                "provider": "DuckDuckGo",
                "error": str(e)
            }

    def format_results_for_context(self, search_result: Dict[str, Any]) -> str:
        """Format search results as context for the model"""
        if "error" in search_result:
            return f"Search Error: {search_result['error']}"

        formatted = f"Search Results for: {search_result['query']}\n\n"

        for i, result in enumerate(search_result["results"], 1):
            formatted += f"{i}. {result['title']}\n"
            formatted += f"   {result['snippet']}\n"
            if result.get('url'):
                formatted += f"   URL: {result['url']}\n"
            formatted += "\n"

        return formatted
