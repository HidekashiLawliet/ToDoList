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
    res.json(rows.map(toTodo));
});

app.post('/todos', async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    if (text === '') {
        return res.status(400).json({ error: 'text is required' });
    }
    const result = await pool.query('INSERT INTO todos (id, text, done) VALUES (?, ?, ?)', [req.body.id, text, Boolean(req.body.done)]);
    res.status(201).json({ id: Number(result.insertId), text, done: Boolean(req.body.done) });
});

app.patch('/todos/:id', async (req, res) => {
    const result = await pool.query('UPDATE todos SET done = ? WHERE id = ?', [Boolean(req.body.done), req.params.id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'not found' });
    }
    const rows = await pool.query('SELECT id, text, done FROM todos WHERE id = ?', [req.params.id]);
    res.json(toTodo(rows[0]));
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
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`ToDo List running on http://localhost:${port}`));
}

start().catch(err => {
    console.error('Could not connect to MariaDB:', err.message);
    process.exit(1);
});
