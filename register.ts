// Rules for a new account. Kept apart from server.ts so they can be tested without a database.
// login.html applies the same limits in the browser, but only this check can be trusted.

export const PSEUDONYME_MIN = 3;
export const PSEUDONYME_MAX = 50; // same as VARCHAR(50) in schema.sql
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt only reads the first 72 bytes: refuse longer ones instead of silently cutting them

// The code goes in the URL (/login.html?register&error=<code>) and login.html shows the matching message
export type RegisterProblem = 'pseudonyme' | 'password' | 'mismatch';

// pseudonyme is expected already trimmed; the passwords are never trimmed
export function checkNewUser(pseudonyme: string, password: string, confirmPassword: string): RegisterProblem | null {
    // [...text] counts characters, like MariaDB does for VARCHAR(50) (.length would count an emoji twice)
    const pseudonymeLength = [...pseudonyme].length;
    if (pseudonymeLength < PSEUDONYME_MIN || pseudonymeLength > PSEUDONYME_MAX) {
        return 'pseudonyme';
    }
    if ([...password].length < PASSWORD_MIN || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
        return 'password';
    }
    if (password !== confirmPassword) {
        return 'mismatch';
    }
    return null;
}
