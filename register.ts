// Sign-up rules, testable without database; login.html only mirrors them

export const PSEUDONYME_MIN = 3;
export const PSEUDONYME_MAX = 50; // same as VARCHAR(50) in schema.sql
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt reads only 72 bytes; longer passwords are refused

// Code put in the URL; login.html shows the message
export type RegisterProblem = 'pseudonyme' | 'password' | 'mismatch';

// pseudonyme is expected already trimmed; the passwords are never trimmed
export function checkNewUser(pseudonyme: string, password: string, confirmPassword: string): RegisterProblem | null {
    // [...text] counts characters like VARCHAR(50); .length miscounts emoji
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
