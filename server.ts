import dotenv from 'dotenv';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import type { UpsertResult } from 'mariadb';
import mariadb from 'mariadb';

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
// __dirname doesn't exist in ES modules, import.meta.dirname is the same thing
app.use(express.static(import.meta.dirname + '/public'));

// MariaDB stores booleans as 0/1, the front end expects true/false
const toTodo = (row: TodoRow): Todo => ({ id: row.id, text: row.text, done: Boolean(row.done) });

app.get('/todos', async (req, res) => {
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM todos ORDER BY id');
    const subtaskRows = await pool.query<SubtaskRow[]>('SELECT id, parent_id, text, done FROM subtask ORDER BY id');
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
    const result = await pool.query<UpsertResult>('INSERT INTO todos (id, text, done) VALUES (?, ?, ?)', [req.body.id, text, Boolean(req.body.done)]);
    res.status(201).json({ id: Number(result.insertId), text, done: Boolean(req.body.done), subtasks: [] });
});

app.patch('/todos/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('UPDATE todos SET done = ? WHERE id = ?', [Boolean(req.body.done), req.params.id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM todos WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
});

// Sub-tasks live under their todo's URL so the front end can reach them with the same api() helper
app.post('/todos/:todoId/subtasks', async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    if (text === '') {
        return res.status(400).json({ error: 'text is required' });
    }
    const todos = await pool.query<TodoRow[]>('SELECT id FROM todos WHERE id = ?', [req.params.todoId]);
    if (todos.length === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const result = await pool.query<UpsertResult>('INSERT INTO subtask (parent_id, text) VALUES (?, ?)', [req.params.todoId, text]);
    res.status(201).json({ id: Number(result.insertId), text, done: false });
});

app.patch('/todos/:todoId/subtasks/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('UPDATE subtask SET done = ? WHERE id = ? AND parent_id = ?', [Boolean(req.body.done), req.params.id, req.params.todoId]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query<TodoRow[]>('SELECT id, text, done FROM subtask WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
});

app.delete('/todos/:todoId/subtasks/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('DELETE FROM subtask WHERE id = ? AND parent_id = ?', [req.params.id, req.params.todoId]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
});

app.delete('/todos/:id', async (req, res) => {
    const result = await pool.query<UpsertResult>('DELETE FROM todos WHERE id = ?', [req.params.id]);
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
    // Checking both tables here makes a missing schema fail at startup instead of on the first request.
    await pool.query('SELECT 1 FROM todos LIMIT 1');
    await pool.query('SELECT 1 FROM subtask LIMIT 1');
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`ToDo List running on http://localhost:${port}`));
}

start().catch((err: Error) => {
    console.error('Could not connect to MariaDB:', err.message);
    console.error('Has an admin run schema.sql? (mariadb -u root -p < schema.sql)');
    process.exit(1);
});
