import type { UpsertResult } from 'mariadb';

// What the repository needs from the database: pool.query() is enough
export interface Database {
    query<T = any>(sql: string, values?: unknown[]): Promise<T>;
}

export interface Todo {
    id: number;
    text: string;
    done: boolean;
}

export interface TodoWithSubtasks extends Todo {
    subtasks: Todo[];
}

export interface User {
    userId: number;
    hashedPassword: string;
}

interface TodoRow {
    id: number;
    text: string;
    done: number;
}

interface SubtaskRow extends TodoRow {
    parent_id: number;
}

// MariaDB stores booleans as 0/1, the front end expects true/false
const toTodo = (row: TodoRow): Todo => ({ id: row.id, text: row.text, done: Boolean(row.done) });

// All SQL lives here; task queries filter on the owner
export function createRepository(db: Database) {
    return {
        // App user cannot create tables: only check they exist
        async checkSchema(): Promise<void> {
            await db.query('SELECT id, parent_id FROM todos LIMIT 1');
            await db.query('SELECT 1 FROM subtask LIMIT 1');
            await db.query('SELECT user_id, pseudonyme, hashed_password FROM users LIMIT 1');
        },

        async findUser(pseudonyme: string): Promise<User | null> {
            const rows = await db.query<{ user_id: number; hashed_password: string }[]>('SELECT user_id, hashed_password FROM users WHERE pseudonyme = ?', [pseudonyme]);
            return rows.length === 0 ? null : { userId: rows[0].user_id, hashedPassword: rows[0].hashed_password };
        },

        async pseudonymeTaken(pseudonyme: string): Promise<boolean> {
            const rows = await db.query<{ user_id: number }[]>('SELECT user_id FROM users WHERE pseudonyme = ?', [pseudonyme]);
            return rows.length > 0;
        },

        // The new user_id, or null if the pseudonyme is taken
        async createUser(pseudonyme: string, hashedPassword: string): Promise<number | null> {
            try {
                const result = await db.query<UpsertResult>('INSERT INTO users (pseudonyme, hashed_password) VALUES (?, ?)', [pseudonyme, hashedPassword]);
                return Number(result.insertId);
            } catch (err) {
                // UNIQUE refuses duplicates, including "Alice" after "alice"
                if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
                    return null;
                }
                throw err;
            }
        },

        async listTodos(owner: number): Promise<TodoWithSubtasks[]> {
            const rows = await db.query<TodoRow[]>('SELECT id, text, done FROM todos WHERE parent_id = ? ORDER BY id', [owner]);
            // Only the sub-tasks of this user's tasks
            const subtaskRows = await db.query<SubtaskRow[]>(
                'SELECT subtask.id, subtask.parent_id, subtask.text, subtask.done FROM subtask JOIN todos ON todos.id = subtask.parent_id WHERE todos.parent_id = ? ORDER BY subtask.id',
                [owner]);
            // Each todo carries its own list of sub-tasks
            return rows.map(row => ({
                ...toTodo(row),
                subtasks: subtaskRows.filter(sub => sub.parent_id === row.id).map(toTodo),
            }));
        },

        async addTodo(owner: number, text: string, done: boolean): Promise<Todo> {
            // MariaDB gives the id (AUTO_INCREMENT), not the browser
            const result = await db.query<UpsertResult>('INSERT INTO todos (parent_id, text, done) VALUES (?, ?, ?)', [owner, text, done]);
            return { id: Number(result.insertId), text, done };
        },

        // The updated todo, or null if not this user's
        async setTodoDone(owner: number, id: number, done: boolean): Promise<Todo | null> {
            const result = await db.query<UpsertResult>('UPDATE todos SET done = ? WHERE id = ? AND parent_id = ?', [done, id, owner]);
            if (result.affectedRows === 0) {
                return null;
            }
            const rows = await db.query<TodoRow[]>('SELECT id, text, done FROM todos WHERE id = ? AND parent_id = ?', [id, owner]);
            return toTodo(rows[0]);
        },

        // True if this user's todo was deleted (cascade)
        async deleteTodo(owner: number, id: number): Promise<boolean> {
            const result = await db.query<UpsertResult>('DELETE FROM todos WHERE id = ? AND parent_id = ?', [id, owner]);
            return result.affectedRows > 0;
        },

        // New sub-task, or null if the todo isn't this user's
        async addSubtask(owner: number, todoId: number, text: string): Promise<Todo | null> {
            const todos = await db.query<TodoRow[]>('SELECT id FROM todos WHERE id = ? AND parent_id = ?', [todoId, owner]);
            if (todos.length === 0) {
                return null;
            }
            const result = await db.query<UpsertResult>('INSERT INTO subtask (parent_id, text) VALUES (?, ?)', [todoId, text]);
            return { id: Number(result.insertId), text, done: false };
        },

        async setSubtaskDone(owner: number, todoId: number, id: number, done: boolean): Promise<Todo | null> {
            // The todo in the URL must be this user's
            const result = await db.query<UpsertResult>(
                'UPDATE subtask SET done = ? WHERE id = ? AND parent_id = ? AND parent_id IN (SELECT id FROM todos WHERE parent_id = ?)',
                [done, id, todoId, owner]);
            if (result.affectedRows === 0) {
                return null;
            }
            const rows = await db.query<TodoRow[]>('SELECT id, text, done FROM subtask WHERE id = ?', [id]);
            return toTodo(rows[0]);
        },

        async deleteSubtask(owner: number, todoId: number, id: number): Promise<boolean> {
            const result = await db.query<UpsertResult>(
                'DELETE FROM subtask WHERE id = ? AND parent_id = ? AND parent_id IN (SELECT id FROM todos WHERE parent_id = ?)',
                [id, todoId, owner]);
            return result.affectedRows > 0;
        },
    };
}

export type Repository = ReturnType<typeof createRepository>;
