const CORS_PROXY_URL = 'https://cors-proxy.jonasneves.workers.dev';
const GITHUB_CLIENT_ID = 'Iv23li8Xfyh6abiZA3Gx';
const OAUTH_CALLBACK_ORIGIN = 'https://neevs.io';

export interface GitHubAuth {
  token: string;
  username: string;
  name?: string;
}

function generateVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64Url(plain: string): Promise<string> {
  const encoded = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function connectGitHub(): Promise<GitHubAuth> {
  const verifier = generateVerifier();
  const challenge = await sha256Base64Url(verifier);
  const state = crypto.randomUUID();
  const redirectUri = `${OAUTH_CALLBACK_ORIGIN}/`;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const width = 500;
  const height = 600;
  const left = window.screenX + (window.innerWidth - width) / 2;
  const top = window.screenY + (window.innerHeight - height) / 2;

  return new Promise((resolve, reject) => {
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
      if (event.origin !== OAUTH_CALLBACK_ORIGIN) return;
      const { type, code, error } = event.data || {};
      if (type !== 'oauth-callback') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(pollTimer);

      if (error) { reject(new Error(error)); return; }
      if (!code) { reject(new Error('No code received')); return; }

      try {
        const res = await fetch(`${CORS_PROXY_URL}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, code, code_verifier: verifier, redirect_uri: redirectUri })
        });
        const data = await res.json();
        if (data.error || !data.access_token) throw new Error(data.error_description || data.error);

        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/vnd.github+json' }
        });
        if (!userRes.ok) throw new Error('Failed to fetch GitHub user info');
        const user = await userRes.json();

        resolve({ token: data.access_token, username: user.login, name: user.name || undefined });
      } catch (err) {
        reject(err);
      }
    };

    window.addEventListener('message', handleMessage);

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', handleMessage);
        reject(new Error('OAuth flow cancelled'));
      }
    }, 500);
  });
}
