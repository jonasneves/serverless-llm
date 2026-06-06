const GITHUB_CLIENT_ID = 'Ov23li3dnFMUNHbu1SjZ';
const OAUTH_CALLBACK_ORIGIN = 'https://neevs.io';

// Give up on a popup that never reports back (user wandered off, COOP severed
// the opener link, etc.) instead of leaving the UI stuck on "Connecting…".
const OAUTH_TIMEOUT_MS = 120_000;

export interface GitHubAuth {
  token: string;
  username: string;
  name?: string;
}

function buildAuthUrl(state: string): string {
  const redirectUri = `${OAUTH_CALLBACK_ORIGIN}/auth/`;
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  // GitHub Models API requires no repo access; request no scope
  authUrl.searchParams.set('scope', '');
  authUrl.searchParams.set('state', state);
  return authUrl.toString();
}

export async function connectGitHub(): Promise<GitHubAuth> {
  const state = crypto.randomUUID() + '|lm-arena';
  const authUrl = buildAuthUrl(state);

  const width = 500;
  const height = 600;
  const left = window.screenX + (window.innerWidth - width) / 2;
  const top = window.screenY + (window.innerHeight - height) / 2;

  return new Promise((resolve, reject) => {
    // window.open must run synchronously within the click gesture or mobile
    // browsers block it. On phones the feature string is ignored and this
    // opens a new tab — which is fine; the callback page posts back to us.
    const popup = window.open(
      authUrl,
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site, then try again.'));
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== OAUTH_CALLBACK_ORIGIN) return;
      const { type, auth } = event.data || {};
      if (type !== 'gh-auth') return;

      // The callback has done its job; close the popup/tab for the user.
      try { popup.close(); } catch { /* cross-origin/COOP: ignore */ }

      if (!auth || !auth.token || !auth.login) {
        finish(() => reject(new Error('Authentication failed')));
        return;
      }
      finish(() => resolve({
        token: auth.token,
        username: auth.login,
        name: auth.user?.name || undefined,
      }));
    };

    window.addEventListener('message', handleMessage);

    // The popup may report `closed` spuriously for a tick right after opening
    // (notably on mobile while the tab takes focus). Require it to stay closed
    // across two polls before treating it as a user cancellation.
    let closedStreak = 0;
    const pollTimer = setInterval(() => {
      let isClosed = false;
      try { isClosed = popup.closed; } catch { isClosed = false; }
      if (!isClosed) {
        closedStreak = 0;
        return;
      }
      closedStreak += 1;
      if (closedStreak >= 2) {
        finish(() => reject(new Error('OAuth flow cancelled')));
      }
    }, 500);

    const timeoutTimer = setTimeout(() => {
      try { popup.close(); } catch { /* ignore */ }
      finish(() => reject(new Error('Authentication timed out. Please try again.')));
    }, OAUTH_TIMEOUT_MS);
  });
}
