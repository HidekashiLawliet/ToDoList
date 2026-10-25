import bcrypt from 'bcrypt';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { describeError, HttpError, notFound } from './errors.ts';
import { checkNewUser } from './register.ts';
import type { Repository } from './repository.ts';
import { clearedSessionCookie, createSession, destroySession, readSession, sessionCookie } from './session.ts';
import { DONE_ERROR, readDone, readId, readText, TEXT_ERROR } from './todoInput.ts';

export interface AppOptions {
    repo: Repository;
    publicDir: string;
    weatherApiKey?: string;
    // Replaceable in tests, so no real weather call is made
    fetchWeather?: typeof fetch;
    // Tests use a low cost to stay fast
    bcryptRounds?: number;
}

// parent_id is the owner's user_id; the session provides it
const ownerOf = (res: Response): number => res.locals.userId;

export async function createApp(options: AppOptions) {
    const { repo, publicDir, weatherApiKey, fetchWeather = fetch, bcryptRounds = 12 } = options;
    const app = express();
    app.use(express.json());
    // Parses the plain HTML form posted by login.html
    app.use(express.urlencoded({ extended: false }));

    // Dummy hash, compared for unknown users to equalise timing
    const noUserHash = await bcrypt.hash('not-the-password-of-anyone', bcryptRounds);

    // Success: session cookie, then app. Failure: login page again
    app.post('/userlogin', async (req, res) => {
        const pseudonyme = String(req.body?.username ?? '').trim();
        const password = String(req.body?.password ?? '');
        const user = await repo.findUser(pseudonyme);
        const match = await bcrypt.compare(password, user?.hashedPassword ?? noUserHash);
        if (user === null || !match) {
            return res.redirect(303, '/login.html?error=1');
        }
        res.set('Set-Cookie', sessionCookie(createSession(user.userId, pseudonyme), req.secure));
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
        if (await repo.pseudonymeTaken(pseudonyme)) {
            return res.redirect(303, '/login.html?register&error=exists');
        }
        const userId = await repo.createUser(pseudonyme, await bcrypt.hash(password, bcryptRounds));
        if (userId === null) {
            return res.redirect(303, '/login.html?register&error=exists');
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
    app.get(['/', '/index.html'], (req, res, next) => {
        if (readSession(req.headers.cookie) !== undefined) {
            return next();
        }
        res.redirect('/login.html');
    });

    app.use(['/todos', '/weather'], (req, res, next) => {
        const session = readSession(req.headers.cookie);
        if (session === undefined) {
            throw new HttpError(401, 'login required');
        }
        res.locals.userId = session.userId;
        next();
    });

    app.use(express.static(publicDir));

    app.get('/todos', async (req, res) => {
        res.json(await repo.listTodos(ownerOf(res)));
    });

    app.post('/todos', async (req, res) => {
        const text = readText(req.body?.text);
        const done = readDone(req.body?.done, false);
        if (text === null) {
            throw new HttpError(400, TEXT_ERROR);
        }
        if (done === null) {
            throw new HttpError(400, DONE_ERROR);
        }
        const todo = await repo.addTodo(ownerOf(res), text, done);
        res.status(201).json({ ...todo, subtasks: [] });
    });

    app.patch('/todos/:id', async (req, res) => {
        const done = readDone(req.body?.done);
        if (done === null) {
            throw new HttpError(400, DONE_ERROR);
        }
        const id = readId(req.params.id);
        const todo = id === null ? null : await repo.setTodoDone(ownerOf(res), id, done);
        if (todo === null) {
            throw notFound();
        }
        res.json(todo);
    });

    app.delete('/todos/:id', async (req, res) => {
        const id = readId(req.params.id);
        if (id === null || !(await repo.deleteTodo(ownerOf(res), id))) {
            throw notFound();
        }
        res.status(204).end();
    });

    // Sub-tasks are nested under their todo's URL
    app.post('/todos/:todoId/subtasks', async (req, res) => {
        const text = readText(req.body?.text);
        if (text === null) {
            throw new HttpError(400, TEXT_ERROR);
        }
        const todoId = readId(req.params.todoId);
        const subtask = todoId === null ? null : await repo.addSubtask(ownerOf(res), todoId, text);
        if (subtask === null) {
            throw notFound();
        }
        res.status(201).json(subtask);
    });

    app.patch('/todos/:todoId/subtasks/:id', async (req, res) => {
        const done = readDone(req.body?.done);
        if (done === null) {
            throw new HttpError(400, DONE_ERROR);
        }
        const todoId = readId(req.params.todoId);
        const id = readId(req.params.id);
        const subtask = todoId === null || id === null ? null : await repo.setSubtaskDone(ownerOf(res), todoId, id, done);
        if (subtask === null) {
            throw notFound();
        }
        res.json(subtask);
    });

    app.delete('/todos/:todoId/subtasks/:id', async (req, res) => {
        const todoId = readId(req.params.todoId);
        const id = readId(req.params.id);
        if (todoId === null || id === null || !(await repo.deleteSubtask(ownerOf(res), todoId, id))) {
            throw notFound();
        }
        res.status(204).end();
    });

    // API key stays server-side; the browser asks /weather?city=...
    app.get('/weather', async (req, res) => {
        const city = String(req.query.city ?? '').trim();
        if (city === '') {
            throw new HttpError(400, 'city is required');
        }
        const url = 'https://api.openweathermap.org/data/2.5/weather?units=metric'
            + '&q=' + encodeURIComponent(city)
            + '&appid=' + weatherApiKey;
        let status: number;
        let data: unknown;
        try {
            const response = await fetchWeather(url);
            status = response.status;
            data = await response.json();
        } catch {
            throw new HttpError(502, 'weather service unavailable');
        }
        res.status(status).json(data);
    });

    app.use(() => {
        throw notFound();
    });

    // Four arguments make this Express's error handler; keep next
    app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }
        const { status, message } = describeError(error);
        if (status >= 500) {
            console.error(error);
        }
        res.status(status).json({ error: message });
    });

    return app;
}
