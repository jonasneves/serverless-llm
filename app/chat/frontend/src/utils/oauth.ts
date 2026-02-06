// OAuth configuration - reusing the existing oauth.neevs.io proxy
const OAUTH_PROXY_URL = 'https://oauth.neevs.io';
const GITHUB_CLIENT_ID = 'Ov23lianHkw0Uog0VGxT';
const GITHUB_SCOPES = 'read:user';

export interface GitHubAuth {
  token: string;
  username: string;
  name?: string; // Display name (may be null if not set)
}

export async function connectGitHub(): Promise<GitHubAuth> {
  return new Promise((resolve, reject) => {
    // Determine callback path based on base URL
    const base = import.meta.env.BASE_URL || '/';
    const callbackPath = base.includes('/static/playground/')
      ? '/static/playground/oauth-callback.html'
      : '/oauth-callback.html';
    const redirectUri = `${window.location.origin}${callbackPath}`;

    // State must be base64-encoded JSON for the oauth proxy
    const state = btoa(JSON.stringify({
      provider: 'github',
      client_id: GITHUB_CLIENT_ID,
      redirect_url: redirectUri,
    }));

    // Go directly to GitHub, with proxy callback as redirect_uri
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
    authUrl.searchParams.set('scope', GITHUB_SCOPES);
    authUrl.searchParams.set('redirect_uri', `${OAUTH_PROXY_URL}/callback`);
    authUrl.searchParams.set('state', state);

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      authUrl.toString(),
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const { type, token, error } = event.data || {};

      if (type === 'oauth-callback') {
        window.removeEventListener('message', handleMessage);
        clearInterval(pollTimer);

        if (error) {
          reject(new Error(error));
          return;
        }

        if (!token) {
          reject(new Error('No token received'));
          return;
        }

        try {
          const userInfo = await fetchGitHubUser(token);
          resolve({ token, ...userInfo });
        } catch (err) {
          reject(err);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Poll to detect if popup was closed without completing
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', handleMessage);
        reject(new Error('OAuth flow cancelled'));
      }
    }, 500);
  });
}

async function fetchGitHubUser(token: string): Promise<{ username: string; name?: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user info');
  }

  const data = await response.json();
  return {
    username: data.login,
    name: data.name || undefined, // Display name, may be null
  };
}
