require('dotenv').config({ quiet: true });
const express = require('express');
const mariadb = require('mariadb');

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

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
app.use('/src', express.static(__dirname + '/src'));
app.use('/ressources', express.static(__dirname + '/ressources'));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// MariaDB stores booleans as 0/1, the front end expects true/false
const toTodo = row => ({ id: row.id, text: row.text, done: Boolean(row.done) });

app.get('/todos', async (req, res) => {
    const rows = await pool.query('SELECT id, text, done FROM todos ORDER BY id');
    const subtaskRows = await pool.query('SELECT id, parent_id, text, done FROM subtask ORDER BY id');
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
    const result = await pool.query('INSERT INTO todos (id, text, done) VALUES (?, ?, ?)', [req.body.id, text, Boolean(req.body.done)]);
    res.status(201).json({ id: Number(result.insertId), text, done: Boolean(req.body.done), subtasks: [] });
});

app.patch('/todos/:id', async (req, res) => {
    const result = await pool.query('UPDATE todos SET done = ? WHERE id = ?', [Boolean(req.body.done), req.params.id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query('SELECT id, text, done FROM todos WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
});

// Sub-tasks live under their todo's URL so the front end can reach them with the same api() helper
app.post('/todos/:todoId/subtasks', async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    if (text === '') {
        return res.status(400).json({ error: 'text is required' });
    }
    const todos = await pool.query('SELECT id FROM todos WHERE id = ?', [req.params.todoId]);
    if (todos.length === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const result = await pool.query('INSERT INTO subtask (parent_id, text) VALUES (?, ?)', [req.params.todoId, text]);
    res.status(201).json({ id: Number(result.insertId), text, done: false });
});

app.patch('/todos/:todoId/subtasks/:id', async (req, res) => {
    const result = await pool.query('UPDATE subtask SET done = ? WHERE id = ? AND parent_id = ?', [Boolean(req.body.done), req.params.id, req.params.todoId]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query('SELECT id, text, done FROM subtask WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
});

app.delete('/todos/:todoId/subtasks/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM subtask WHERE id = ? AND parent_id = ?', [req.params.id, req.params.todoId]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
});

app.delete('/todos/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM todos WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'database error' });
});

async function start() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS todos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            text VARCHAR(255) NOT NULL,
            done BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    // ON DELETE CASCADE removes a todo's sub-tasks when the todo is deleted
    await pool.query(`
        CREATE TABLE IF NOT EXISTS subtask (
            id INT AUTO_INCREMENT PRIMARY KEY,
            parent_id INT NOT NULL,
            text VARCHAR(255) NOT NULL,
            done BOOLEAN NOT NULL DEFAULT FALSE,
            FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE
        )
    `);
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`ToDo List running on http://localhost:${port}`));
}

start().catch(err => {
    console.error('Could not connect to MariaDB:', err.message);
    process.exit(1);
});
