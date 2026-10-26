// Input rules for tasks and sub-tasks, testable without a database.

export const TEXT_MAX = 255; // same as VARCHAR(255) in schema.sql
export const TEXT_ERROR = `text must have 1 to ${TEXT_MAX} characters`;
export const DONE_ERROR = 'done must be true or false';

// A positive whole number from a URL, or null
export function readId(value: unknown): number | null {
    const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(id) ? id : null;
}

// Trimmed text, or null if invalid
export function readText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const text = value.trim();
    // Counts characters like VARCHAR(255), not UTF-16 units
    const length = [...text].length;
    return length >= 1 && length <= TEXT_MAX ? text : null;
}

// The boolean; fallback if missing; null if not a boolean
export function readDone(value: unknown, fallback: boolean | null = null): boolean | null {
    if (value === undefined) {
        return fallback;
    }
    return typeof value === 'boolean' ? value : null;
}
