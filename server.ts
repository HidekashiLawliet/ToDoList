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

// Shapes of the rows MariaDB gives back, and of what the front end receives
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
// login.html is a plain HTML form: the browser sends it as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// A real bcrypt hash of a password nobody knows. It is compared when the pseudonyme does not exist,
// so an unknown user and a wrong password take the same time and get the same answer.
const NO_USER_HASH = await bcrypt.hash('not-the-password-of-anyone', 12);

// login.html posts its form here (the password travels in the body, never in the URL).
// Success: the browser gets a session cookie and goes to the app. Failure: back to the login page.
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

// The "Create Account" mode of the same form (login.html) posts here.
// Success: the new user is logged in at once and goes to the app. Failure: back to the form, in
// "Create Account" mode, with the reason in the URL (login.html writes the message; the password never travels in a URL).
app.post('/userregister', async (req, res) => {
    const pseudonyme = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const problem = checkNewUser(pseudonyme, password, String(req.body?.confirm_password ?? ''));
    if (problem) {
        return res.redirect(303, `/login.html?register&error=${problem}`);
    }
    // Looking first gives the right answer even on a table without the UNIQUE index; the index (checked below) is what
    // really stops two sign-ups of the same pseudonyme arriving at the same moment.
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
        // pseudonyme is UNIQUE, so MariaDB refuses a second one (also "Alice" after "alice": the collation ignores case)
        if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
            return res.redirect(303, '/login.html?register&error=exists');
        }
        throw err;
    }
    res.set('Set-Cookie', sessionCookie(createSession(userId, pseudonyme), req.secure));
    res.redirect(303, '/');
});

// The "Log out" button of the app posts here: forget the session, delete the cookie, back to the login page.
app.post('/userlogout', (req, res) => {
    destroySession(req.headers.cookie);
    res.set('Set-Cookie', clearedSessionCookie(req.secure));
    res.redirect(303, '/login.html');
});

// Let the page call the API when it is opened from another server (e.g. VS Code Live Server)
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

// Everything except the login page needs a login. The app page sends the visitor to the login page,
// the data routes answer 401 (index.js then sends the visitor to the login page too).
const isLoggedIn = (req: Request) => readSession(req.headers.cookie) !== undefined;

// Every task belongs to the user who created it: todos.parent_id is that user's users.user_id.
// Each query below filters on it, so a user never reads, changes or deletes somebody else's tasks.
// The guard below puts the id in res.locals.userId: it is the one saved in the session at login, never a value sent by the browser.
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

// __dirname doesn't exist in ES modules, import.meta.dirname is the same thing
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
    // The id is given by MariaDB (AUTO_INCREMENT), not by the browser
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

// Sub-tasks live under their todo's URL so the front end can reach them with the same api() helper
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
    // The sub-task must sit under the todo of the URL, and that todo must be this user's
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

// The API key stays on the server, the browser only asks /weather?city=...
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

// Express only treats a middleware as an error handler when it takes 4 arguments, so `next` must stay
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'database error' });
});

async function start() {
    // The app's user may only SELECT/INSERT/UPDATE/DELETE: the tables come from schema.sql, run by an admin.
    // Checking the tables (and the columns the login and the owner of each task need) here makes a missing or
    // outdated schema fail at startup instead of on the first request.
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
