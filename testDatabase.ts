import { DatabaseSync } from 'node:sqlite';
import type { Database } from './repository.ts';

// SQLite stand-in for MariaDB: same tables, no server needed
export function createTestDatabase(): Database {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            pseudonyme TEXT NOT NULL UNIQUE COLLATE NOCASE,
            hashed_password TEXT NOT NULL
        );
        CREATE TABLE todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE subtask (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0
        );
    `);
    return {
        // Same result shapes as the mariadb driver
        async query<T = any>(sql: string, values: unknown[] = []): Promise<T> {
            const params: any[] = values.map(value => (typeof value === 'boolean' ? Number(value) : value));
            // MariaDB in strict mode refuses a text longer than VARCHAR(255)
            if (/^\s*INSERT/i.test(sql) && params.some(value => typeof value === 'string' && [...value].length > 255)) {
                throw Object.assign(new Error("Data too long for column 'text'"), { code: 'ER_DATA_TOO_LONG', errno: 1406 });
            }
            const statement = sqlite.prepare(sql);
            if (/^\s*SELECT/i.test(sql)) {
                return statement.all(...params).map(row => ({ ...row })) as T;
            }
            try {
                const result = statement.run(...params);
                return { affectedRows: Number(result.changes), insertId: BigInt(result.lastInsertRowid) } as T;
            } catch (error) {
                if (/UNIQUE constraint/.test((error as Error).message)) {
                    throw Object.assign(error as Error, { code: 'ER_DUP_ENTRY', errno: 1062 });
                }
                throw error;
            }
        },
    };
}
