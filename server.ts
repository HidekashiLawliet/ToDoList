import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import type { UpsertResult } from 'mariadb';
import mariadb from 'mariadb';
import { checkNewUser } from './register.ts';
import { clearedSessionCookie, createSession, destroySession, readSession, sessionCookie } from './session.ts';

dotenv.config({ quiet: true });

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Row types from MariaDB, and what the browser receives
interface TodoRow {
    id: number;
    text: string;
    done: number;
}

interface SubtaskRow extends TodoRow {
    parent_id: number;
}

interface Todo {
    id: number;
    text: string;
    done: boolean;
}

const app = express();
app.use(express.json());
// Parses the plain HTML form posted by login.html
app.use(express.urlencoded({ extended: false }));

// Dummy hash, compared for unknown users to equalise timing
const NO_USER_HASH = await bcrypt.hash('not-the-password-of-anyone', 12);

// Success: session cookie, then app. Failure: login page again
app.post('/userlogin', async (req, res) => {
    const pseudonyme = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const rows = await pool.query<{ user_id: number; hashed_password: string }[]>('SELECT user_id, hashed_password FROM users WHERE pseudonyme = ?', [pseudonyme]);
    const match = await bcrypt.compare(password, rows[0]?.hashed_password ?? NO_USER_HASH);
    if (rows.length === 0 || !match) {
        return res.redirect(303, '/login.html?error=1');
    }
    res.set('Set-Cookie', sessionCookie(createSession(rows[0].user_id, pseudonyme), req.secure));
    res.redirect(303, '/');
});

// Create account 
app.post('/userregister', async (req, res) => {
    const pseudonyme = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const problem = checkNewUser(pseudonyme, password, String(req.body?.confirm_password ?? ''));
    if (problem) {
        return res.redirect(303, `/login.html?register&error=${problem}`);
    }
    // Pre-check; the UNIQUE index catches simultaneous sign-ups
    const taken = await pool.query<{ user_id: number }[]>('SELECT user_id FROM users WHERE pseudonyme = ?', [pseudonyme]);
    if (taken.length > 0) {
        return res.redirect(303, '/login.html?register&error=exists');
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    let userId: number;
    try {
        const result = await pool.query<UpsertResult>('INSERT INTO users (pseudonyme, hashed_password) VALUES (?, ?)', [pseudonyme, hashedPassword]);
        userId = Number(result.insertId);
    } catch (err) {
        // UNIQUE refuses duplicates, including "Alice" after "alice"
        if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
            return res.redirect(303, '/login.html?register&error=exists');
        }
        throw err;
    }
    res.set('Set-Cookie', sessionCookie(createSession(userId, pseudonyme), req.secure));
    res.redirect(303, '/');
});

// Forget the session, delete the cookie, back to login
app.post('/userlogout', (req, res) => {
    destroySession(req.headers.cookie);
    res.set('Set-Cookie', clearedSessionCookie(req.secure));
    res.redirect(303, '/login.html');
});

// Pages redirect to login; data routes answer 401
const isLoggedIn = (req: Request) => readSession(req.headers.cookie) !== undefined;

// parent_id is the owner's user_id; the session provides it
const ownerOf = (res: Response): number => res.locals.userId;

app.get(['/', '/index.html'], (req, res, next) => {
    if (isLoggedIn(req)) {
        return next();
    }
    res.redirect('/login.html');
});

app.use(['/todos', '/weather'], (req, res, next) => {
    const session = readSession(req.headers.cookie);
    if (session === undefined) {
        return res.status(401).json({ error: 'login required' });
    }
    res.locals.userId = session.userId;
    next();
});

// import.meta.dirname replaces __dirname in ES modules
app.use(express.static(import.meta.dirname + '/public'));

// MariaDB stores booleans as 0/1, the front end expects true/false
const toTodo = (row: TodoRow): Todo => ({ id: row.id, text: row.text, done: Boolean(row.done) });

app.get('/todos', async (req, res) => {
    const owner = ownerOf(res);
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM todos WHERE parent_id = ? ORDER BY id', [owner]);
    // Only the sub-tasks of this user's tasks
    const subtaskRows = await pool.query<SubtaskRow[]>(
        'SELECT subtask.id, subtask.parent_id, subtask.text, subtask.done FROM subtask JOIN todos ON todos.id = subtask.parent_id WHERE todos.parent_id = ? ORDER BY subtask.id',
        [owner]);
    // Each todo carries its own list of sub-tasks
    res.json(rows.map(row => ({
        ...toTodo(row),
        subtasks: subtaskRows.filter(sub => sub.parent_id === row.id).map(toTodo),
    })));
});

app.post('/todos', async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    if (text === '') {
        return res.status(400).json({ error: 'text is required' });
    }
    // MariaDB gives the id (AUTO_INCREMENT), not the browser
    const result = await pool.query<UpsertResult>('INSERT INTO todos (parent_id, text, done) VALUES (?, ?, ?)', [ownerOf(res), text, Boolean(req.body.done)]);
    res.status(201).json({ id: Number(result.insertId), text, done: Boolean(req.body.done), subtasks: [] });
});

app.patch('/todos/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('UPDATE todos SET done = ? WHERE id = ? AND parent_id = ?', [Boolean(req.body.done), req.params.id, ownerOf(res)]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM todos WHERE id = ? AND parent_id = ?', [req.params.id, ownerOf(res)]);
    res.json(toTodo(rows[0]));
});

// Sub-tasks are nested under their todo's URL
app.post('/todos/:todoId/subtasks', async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    if (text === '') {
        return res.status(400).json({ error: 'text is required' });
    }
    const todos = await pool.query<TodoRow[]>('SELECT id FROM todos WHERE id = ? AND parent_id = ?', [req.params.todoId, ownerOf(res)]);
    if (todos.length === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const result = await pool.query<UpsertResult>('INSERT INTO subtask (parent_id, text) VALUES (?, ?)', [req.params.todoId, text]);
    res.status(201).json({ id: Number(result.insertId), text, done: false });
});

app.patch('/todos/:todoId/subtasks/:id', async (req, res) => {
    // The todo in the URL must be this user's
    const result = await pool.query<UpsertResult>(
        'UPDATE subtask SET done = ? WHERE id = ? AND parent_id = ? AND parent_id IN (SELECT id FROM todos WHERE parent_id = ?)',
        [Boolean(req.body.done), req.params.id, req.params.todoId, ownerOf(res)]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM subtask WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
});

app.delete('/todos/:todoId/subtasks/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>(
        'DELETE FROM subtask WHERE id = ? AND parent_id = ? AND parent_id IN (SELECT id FROM todos WHERE parent_id = ?)',
        [req.params.id, req.params.todoId, ownerOf(res)]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
});

app.delete('/todos/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('DELETE FROM todos WHERE id = ? AND parent_id = ?', [req.params.id, ownerOf(res)]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
});

// API key stays server-side; the browser asks /weather?city=...
app.get('/weather', async (req, res) => {
    const city = String(req.query.city ?? '').trim();
    if (city === '') {
        return res.status(400).json({ error: 'city is required' });
    }
    const url = 'https://api.openweathermap.org/data/2.5/weather?units=metric'
        + '&q=' + encodeURIComponent(city)
        + '&appid=' + process.env.WEATHER_API_KEY;
    const response = await fetch(url);
    res.status(response.status).json(await response.json());
});

// Four arguments make this Express's error handler; keep next
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'database error' });
});

async function start() {
    // Outdated schema fails at startup, not on first request
    await pool.query('SELECT id, parent_id FROM todos LIMIT 1');
    await pool.query('SELECT 1 FROM subtask LIMIT 1');
    await pool.query('SELECT user_id, pseudonyme, hashed_password FROM users LIMIT 1');
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`ToDo List running on http://localhost:${port}`));
}

start().catch((err: Error) => {
    console.error('Could not connect to MariaDB:', err.message);
    console.error('Has an admin run schema.sql? (mariadb -u root -p < schema.sql) users needs user_id, pseudonyme, hashed_password and todos needs parent_id (the owner).');
    process.exit(1);
});
