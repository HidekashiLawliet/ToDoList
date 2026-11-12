import { createHash, randomBytes } from 'node:crypto';

// PKCE login: no client secret, the verifier proves the request is ours
export const SPOTIFY_SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
].join(' ');

const LOGIN_MINUTES = 10;

export interface PendingLogin {
    userId: number;
    verifier: string;
    // Where to send the user back (the address they started from)
    returnTo: string;
    expires: number;
}

export interface SpotifyTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

export function createVerifier(): string {
    return randomBytes(48).toString('base64url');
}

export function challengeOf(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string, challenge: string): string {
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SPOTIFY_SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
    });
    return `https://accounts.spotify.com/authorize?${params}`;
}

// In memory, like sessions: a restart means reconnecting Spotify
const pendingLogins = new Map<string, PendingLogin>();
const tokensByUser = new Map<number, SpotifyTokens>();

// Only our own addresses, so the callback cannot redirect anywhere else
export function returnAddress(host: string | undefined): string {
    return /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host ?? '') ? `http://${host}/` : '/';
}

// Returns the state to send to Spotify
export function startLogin(userId: number, verifier: string, returnTo = '/'): string {
    const now = Date.now();
    for (const [state, login] of pendingLogins) {
        if (login.expires <= now) {
            pendingLogins.delete(state);
        }
    }
    const state = randomBytes(16).toString('hex');
    pendingLogins.set(state, { userId, verifier, returnTo, expires: now + LOGIN_MINUTES * 60 * 1000 });
    return state;
}

// One use only; undefined if unknown or expired. The state is a
// 128-bit secret, so it identifies the user without the session cookie
export function finishLogin(state: string): PendingLogin | undefined {
    const login = pendingLogins.get(state);
    pendingLogins.delete(state);
    if (login === undefined || login.expires <= Date.now()) {
        return undefined;
    }
    return login;
}

export function saveTokens(userId: number, tokens: SpotifyTokens): void {
    tokensByUser.set(userId, tokens);
}

export function readTokens(userId: number): SpotifyTokens | undefined {
    return tokensByUser.get(userId);
}

export function forgetTokens(userId: number): void {
    tokensByUser.delete(userId);
}

// Spotify's token answer; refresh_token may be absent on refresh
export function tokensFrom(body: unknown, previousRefresh = ''): SpotifyTokens | null {
    const data = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof data?.access_token !== 'string' || typeof data.expires_in !== 'number') {
        return null;
    }
    const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : previousRefresh;
    // Refresh a minute early so the player never gets an expired token
    return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
}
