/**
 * Google OAuth 2.0 Service using Google Identity Services (GIS) Token Client.
 * 100% Client-Side, Lightweight, and Zero-Firebase.
 */

export interface GoogleUser {
  id?: string;
  email?: string;
  name?: string;
  displayName?: string;
  picture?: string;
  photoURL?: string;
}

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'profile',
  'email',
];

const CLIENT_ID = '680462675583-fpoqv99st4n5sv1ke99hjk6r0rca8mkc.apps.googleusercontent.com';
const USER_STORAGE_KEY = 'kasirku_google_user_v2';
const TOKEN_STORAGE_KEY = 'kasirku_google_access_token_v2';

let cachedAccessToken: string | null = null;
let currentUser: GoogleUser | null = null;
let gisLoadedPromise: Promise<void> | null = null;

// Initialize cached credentials from sessionStorage / localStorage
try {
  const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (savedToken) cachedAccessToken = savedToken;
  const savedUser = localStorage.getItem(USER_STORAGE_KEY);
  if (savedUser) currentUser = JSON.parse(savedUser);
} catch (e) {
  console.warn('Could not read cached Google auth state:', e);
}

/**
 * Dynamically loads the official Google Identity Services (GIS) client script
 */
function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadedPromise) return gisLoadedPromise;

  gisLoadedPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-gis-sdk');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-sdk';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error('Gagal memuat Google Identity Services script. Periksa koneksi internet.'));
    document.head.appendChild(script);
  });

  return gisLoadedPromise;
}

/**
 * Fetches user profile from Google UserInfo endpoint using the access token
 */
async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUser> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        id: data.sub,
        email: data.email,
        name: data.name,
        displayName: data.name || data.email,
        picture: data.picture,
        photoURL: data.picture,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch userinfo from Google:', err);
  }

  return {
    email: 'google-user@connected',
    displayName: 'Google Account',
    name: 'Google Account',
  };
}

/**
 * Listen for auth state changes
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (currentUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(currentUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure();
  }
  return () => {};
};

/**
 * Prompts user with Google OAuth popup to grant access to Google Sheets & Drive
 */
export const signInWithGoogle = async (): Promise<{ user: GoogleUser; accessToken: string }> => {
  await loadGisScript();

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services belum tersedia. Coba beberapa saat lagi.'));
      return;
    }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('GIS Error:', tokenResponse);
            reject(new Error(tokenResponse.error_description || tokenResponse.error || 'Login Google dibatalkan.'));
            return;
          }

          if (tokenResponse.access_token) {
            cachedAccessToken = tokenResponse.access_token;
            try {
              localStorage.setItem(TOKEN_STORAGE_KEY, tokenResponse.access_token);
            } catch (e) {
              console.warn(e);
            }

            const profile = await fetchGoogleUserProfile(tokenResponse.access_token);
            currentUser = profile;
            try {
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
            } catch (e) {
              console.warn(e);
            }

            resolve({ user: profile, accessToken: tokenResponse.access_token });
          } else {
            reject(new Error('Tidak menerima access token dari Google.'));
          }
        },
        error_callback: (err: any) => {
          console.error('GIS Error Callback:', err);
          reject(new Error(err?.message || 'Login Google dibatalkan atau popup ditutup.'));
        },
      });

      client.requestAccessToken({ prompt: '' });
    } catch (err: any) {
      console.error('Failed to initTokenClient:', err);
      reject(err);
    }
  });
};

/**
 * Returns currently cached valid access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

/**
 * Returns current authenticated Google user
 */
export const getGoogleUser = (): GoogleUser | null => {
  if (currentUser) return currentUser;
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    if (saved) {
      currentUser = JSON.parse(saved);
      return currentUser;
    }
  } catch (e) {
    console.warn(e);
  }
  return null;
};

/**
 * Log out from Google session
 */
export const logoutGoogle = async () => {
  if (cachedAccessToken && (window as any).google?.accounts?.oauth2?.revoke) {
    try {
      (window as any).google.accounts.oauth2.revoke(cachedAccessToken, () => {});
    } catch (e) {
      console.warn(e);
    }
  }
  cachedAccessToken = null;
  currentUser = null;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (e) {
    console.warn(e);
  }
};
