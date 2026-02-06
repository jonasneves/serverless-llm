/**
 * Fetch with an AbortController-based timeout.
 * Rejects with AbortError if the request exceeds the given timeout.
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit | undefined,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}
