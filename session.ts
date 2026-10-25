import { randomBytes } from 'node:crypto';

// Sessions live in memory: restarting the server logs everybody out, which is fine for this app.
// The browser only keeps a random token, in an HttpOnly cookie. It never holds the user's data.
export const COOKIE_NAME = 'sid';
const SESSION_SECONDS = 8 * 60 * 60;

export interface Session {
    userId: number;
    pseudonyme: string;
    expires: number;
}

const sessions = new Map<string, Session>();

export function createSession(userId: number, pseudonyme: string): string {
    const now = Date.now();
    // Forget the sessions nobody can use any more
    for (const [token, session] of sessions) {
        if (session.expires <= now) {
            sessions.delete(token);
        }
    }
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { userId, pseudonyme, expires: now + SESSION_SECONDS * 1000 });
    return token;
}

// Finds one cookie in the "Cookie" header of a request, e.g. "a=1; sid=abc" -> "abc" for "sid"
export function readCookie(header: string | undefined, name: string): string | undefined {
    for (const part of (header ?? '').split(';')) {
        const separator = part.indexOf('=');
        if (separator !== -1 && part.slice(0, separator).trim() === name) {
            return part.slice(separator + 1).trim();
        }
    }
    return undefined;
}

// The session of the request, or undefined when the visitor is not logged in (no cookie, unknown token, expired)
export function readSession(cookieHeader: string | undefined): Session | undefined {
    const token = readCookie(cookieHeader, COOKIE_NAME);
    const session = token === undefined ? undefined : sessions.get(token);
    if (session === undefined || session.expires <= Date.now()) {
        return undefined;
    }
    return session;
}

// HttpOnly: scripts in the page cannot read the cookie.
// SameSite=Lax: another site cannot make the browser send it with a POST, PATCH or DELETE.
export function sessionCookie(token: string, secure: boolean): string {
    return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

// Logs a visitor out: forgets the session behind the cookie of the request (nothing to do without one)
export function destroySession(cookieHeader: string | undefined): void {
    const token = readCookie(cookieHeader, COOKIE_NAME);
    if (token !== undefined) {
        sessions.delete(token);
    }
}

// Same cookie, empty and already expired: the browser deletes it
export function clearedSessionCookie(secure: boolean): string {
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}
