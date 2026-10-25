import { randomBytes } from 'node:crypto';

// In-memory sessions: a restart logs everybody out
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

// Finds one cookie in the Cookie header, by name
export function readCookie(header: string | undefined, name: string): string | undefined {
    for (const part of (header ?? '').split(';')) {
        const separator = part.indexOf('=');
        if (separator !== -1 && part.slice(0, separator).trim() === name) {
            return part.slice(separator + 1).trim();
        }
    }
    return undefined;
}

// The request's session, or undefined if not logged in
export function readSession(cookieHeader: string | undefined): Session | undefined {
    const token = readCookie(cookieHeader, COOKIE_NAME);
    const session = token === undefined ? undefined : sessions.get(token);
    if (session === undefined || session.expires <= Date.now()) {
        return undefined;
    }
    return session;
}

// HttpOnly hides it from scripts; SameSite=Lax blocks cross-site posts
export function sessionCookie(token: string, secure: boolean): string {
    return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

// Forgets the session behind the request's cookie
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
