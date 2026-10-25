import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './app.ts';
import { createRepository } from './repository.ts';
import type { Repository } from './repository.ts';
import { createSession } from './session.ts';
import { createTestDatabase } from './testDatabase.ts';

// Real HTTP, routes and bcrypt; SQLite and weather are stand-ins

const weatherCalls: string[] = [];
const fakeWeather: typeof fetch = async (input) => {
    const url = String(input);
    weatherCalls.push(url);
    if (url.includes('q=Down')) {
        throw new TypeError('fetch failed');
    }
    if (url.includes('q=Nowhere')) {
        return Response.json({ cod: '404', message: 'city not found' }, { status: 404 });
    }
    return Response.json({ main: { temp: 17 } });
};

const servers: Server[] = [];

async function startApp(repo: Repository): Promise<string> {
    const app = await createApp({
        repo,
        publicDir: import.meta.dirname + '/public',
        weatherApiKey: 'test-key',
        fetchWeather: fakeWeather,
        bcryptRounds: 4,
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let base = '';
before(async () => {
    base = await startApp(createRepository(createTestDatabase()));
});
after(() => {
    for (const server of servers) {
        server.closeAllConnections();
        server.close();
    }
});

interface SendOptions {
    cookie?: string;
    json?: unknown;
    raw?: string;
    form?: Record<string, string>;
    target?: string;
}

async function send(method: string, path: string, options: SendOptions = {}) {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (options.cookie) {
        headers.cookie = options.cookie;
    }
    if (options.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.json);
    }
    if (options.raw !== undefined) {
        headers['content-type'] = 'application/json';
        body = options.raw;
    }
    if (options.form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(options.form).toString();
    }
    const response = await fetch((options.target ?? base) + path, { method, headers, body, redirect: 'manual' });
    const text = await response.text();
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    return {
        status: response.status,
        headers: response.headers,
        location: response.headers.get('location'),
        json: isJson ? JSON.parse(text) : undefined,
        text,
    };
}

const cookieOf = (headers: Headers) => headers.getSetCookie()[0].split(';')[0];

async function signUp(name: string): Promise<string> {
    const answer = await send('POST', '/userregister', { form: { username: name, password: 'password123', confirm_password: 'password123' } });
    assert.equal(answer.status, 303);
    assert.equal(answer.location, '/');
    return cookieOf(answer.headers);
}

test('without a login, pages redirect and data answers 401', async () => {
    assert.equal((await send('GET', '/')).status, 302);
    assert.equal((await send('GET', '/')).location, '/login.html');
    assert.equal((await send('GET', '/index.html')).location, '/login.html');
    const todos = await send('GET', '/todos');
    assert.equal(todos.status, 401);
    assert.deepEqual(todos.json, { error: 'login required' });
    assert.equal((await send('GET', '/weather?city=Paris')).status, 401);
    assert.equal((await send('GET', '/login.html')).status, 200);
});

test('sign-up: wrong data goes back to the form with the reason', async () => {
    const form = (username: string, password: string, confirm_password: string) => send('POST', '/userregister', { form: { username, password, confirm_password } });
    assert.equal((await form('ab', 'password123', 'password123')).location, '/login.html?register&error=pseudonyme');
    assert.equal((await form('carol', 'short', 'short')).location, '/login.html?register&error=password');
    assert.equal((await form('carol', 'password123', 'password124')).location, '/login.html?register&error=mismatch');
});

test('sign-up: logs in at once, and refuses the same pseudonyme in any case', async () => {
    const answer = await send('POST', '/userregister', { form: { username: 'dana', password: 'password123', confirm_password: 'password123' } });
    const setCookie = answer.headers.getSetCookie()[0];
    assert.match(setCookie, /^sid=[0-9a-f]+;/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.deepEqual((await send('GET', '/todos', { cookie: cookieOf(answer.headers) })).json, []);
    const again = await send('POST', '/userregister', { form: { username: 'DANA', password: 'password123', confirm_password: 'password123' } });
    assert.equal(again.location, '/login.html?register&error=exists');
    assert.equal(again.headers.getSetCookie().length, 0);
});

test('login: right password works, wrong password and unknown user look the same', async () => {
    await signUp('erin');
    const ok = await send('POST', '/userlogin', { form: { username: 'erin', password: 'password123' } });
    assert.equal(ok.location, '/');
    assert.match(ok.headers.getSetCookie()[0], /^sid=/);
    const wrong = await send('POST', '/userlogin', { form: { username: 'erin', password: 'password999' } });
    const unknown = await send('POST', '/userlogin', { form: { username: 'nobody', password: 'password123' } });
    assert.equal(wrong.location, '/login.html?error=1');
    assert.equal(unknown.location, '/login.html?error=1');
    assert.equal(wrong.headers.getSetCookie().length, 0);
});

test('login: the secret behind the dummy hash does not open an unknown account', async () => {
    const answer = await send('POST', '/userlogin', { form: { username: 'ghost', password: 'not-the-password-of-anyone' } });
    assert.equal(answer.location, '/login.html?error=1');
    assert.equal(answer.headers.getSetCookie().length, 0);
});

test('logout: forgets the session and clears the cookie', async () => {
    const cookie = await signUp('frank');
    const answer = await send('POST', '/userlogout', { cookie });
    assert.equal(answer.status, 303);
    assert.equal(answer.location, '/login.html');
    assert.match(answer.headers.getSetCookie()[0], /Max-Age=0/);
    assert.equal((await send('GET', '/todos', { cookie })).status, 401);
});

test('todos: create, list, tick and delete', async () => {
    const cookie = await signUp('gina');
    const created = await send('POST', '/todos', { cookie, json: { text: '  Buy milk  ', done: false } });
    assert.equal(created.status, 201);
    assert.deepEqual(created.json, { id: created.json.id, text: 'Buy milk', done: false, subtasks: [] });
    assert.deepEqual((await send('GET', '/todos', { cookie })).json, [created.json]);
    const ticked = await send('PATCH', `/todos/${created.json.id}`, { cookie, json: { done: true } });
    assert.deepEqual(ticked.json, { id: created.json.id, text: 'Buy milk', done: true });
    assert.equal((await send('DELETE', `/todos/${created.json.id}`, { cookie })).status, 204);
    assert.deepEqual((await send('GET', '/todos', { cookie })).json, []);
});

test('todos: done is optional when creating and defaults to false', async () => {
    const cookie = await signUp('hugo');
    const created = await send('POST', '/todos', { cookie, json: { text: 'no flag' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.done, false);
});

test('todos: 255 characters are accepted, 256 are a 400', async () => {
    const cookie = await signUp('ines');
    assert.equal((await send('POST', '/todos', { cookie, json: { text: 'a'.repeat(255) } })).status, 201);
    const tooLong = await send('POST', '/todos', { cookie, json: { text: 'a'.repeat(256) } });
    assert.equal(tooLong.status, 400);
    assert.deepEqual(tooLong.json, { error: 'text must have 1 to 255 characters' });
    assert.equal((await send('GET', '/todos', { cookie })).json.length, 1);
});

test('todos: bad text or done is a 400 and nothing is stored', async () => {
    const cookie = await signUp('jack');
    const bad = [{ text: 123 }, { text: '' }, { text: '   ' }, {}, { text: ['x'] }, { text: 'x', done: 'false' }, { text: 'x', done: 1 }, { text: 'x', done: null }];
    for (const json of bad) {
        const answer = await send('POST', '/todos', { cookie, json });
        assert.equal(answer.status, 400, JSON.stringify(json));
        assert.match(answer.json.error, /^(text|done) must/);
    }
    assert.deepEqual((await send('GET', '/todos', { cookie })).json, []);
});

test('todos: a bad done on PATCH is a 400 and the task is unchanged', async () => {
    const cookie = await signUp('kate');
    const todo = (await send('POST', '/todos', { cookie, json: { text: 'task', done: true } })).json;
    for (const json of [{ done: 'false' }, { done: 0 }, {}, { done: null }]) {
        assert.equal((await send('PATCH', `/todos/${todo.id}`, { cookie, json })).status, 400, JSON.stringify(json));
    }
    assert.equal((await send('GET', '/todos', { cookie })).json[0].done, true);
});

test('a body that is not JSON is a 400, and so is no body at all', async () => {
    const cookie = await signUp('liam');
    const broken = await send('POST', '/todos', { cookie, raw: '{"text": ' });
    assert.equal(broken.status, 400);
    assert.deepEqual(broken.json, { error: 'request body is not valid JSON' });
    assert.equal((await send('POST', '/todos', { cookie })).status, 400);
    assert.equal((await send('PATCH', '/todos/1', { cookie })).status, 400);
});

test('a body over 100 kb is a 413', async () => {
    const cookie = await signUp('mona');
    const answer = await send('POST', '/todos', { cookie, json: { text: 'a'.repeat(200_000) } });
    assert.equal(answer.status, 413);
    assert.deepEqual(answer.json, { error: 'request body is too large' });
});

test('ids that are not whole numbers are a 404, even if they start with an own id', async () => {
    const cookie = await signUp('noah');
    const todo = (await send('POST', '/todos', { cookie, json: { text: 'mine' } })).json;
    const sub = (await send('POST', `/todos/${todo.id}/subtasks`, { cookie, json: { text: 'step' } })).json;
    for (const id of [`${todo.id}abc`, `${todo.id}.5`, `0${todo.id}`, 'abc', '0', '-1']) {
        assert.equal((await send('PATCH', `/todos/${id}`, { cookie, json: { done: true } })).status, 404, id);
        assert.equal((await send('DELETE', `/todos/${id}`, { cookie })).status, 404, id);
        assert.equal((await send('POST', `/todos/${id}/subtasks`, { cookie, json: { text: 'x' } })).status, 404, id);
        assert.equal((await send('PATCH', `/todos/${todo.id}/subtasks/${sub.id}${id}`, { cookie, json: { done: true } })).status, 404, id);
        assert.equal((await send('DELETE', `/todos/${id}/subtasks/${sub.id}`, { cookie })).status, 404, id);
    }
    const [kept] = (await send('GET', '/todos', { cookie })).json;
    assert.equal(kept.done, false);
    assert.deepEqual(kept.subtasks, [sub]);
});

test('sub-tasks: add, tick and delete', async () => {
    const cookie = await signUp('olga');
    const todo = (await send('POST', '/todos', { cookie, json: { text: 'task' } })).json;
    const added = await send('POST', `/todos/${todo.id}/subtasks`, { cookie, json: { text: ' step 1 ' } });
    assert.equal(added.status, 201);
    assert.deepEqual(added.json, { id: added.json.id, text: 'step 1', done: false });
    const ticked = await send('PATCH', `/todos/${todo.id}/subtasks/${added.json.id}`, { cookie, json: { done: true } });
    assert.deepEqual(ticked.json, { id: added.json.id, text: 'step 1', done: true });
    assert.deepEqual((await send('GET', '/todos', { cookie })).json[0].subtasks, [ticked.json]);
    assert.equal((await send('DELETE', `/todos/${todo.id}/subtasks/${added.json.id}`, { cookie })).status, 204);
    assert.deepEqual((await send('GET', '/todos', { cookie })).json[0].subtasks, []);
});

test('sub-tasks: bad text or done is a 400', async () => {
    const cookie = await signUp('paul');
    const todo = (await send('POST', '/todos', { cookie, json: { text: 'task' } })).json;
    const sub = (await send('POST', `/todos/${todo.id}/subtasks`, { cookie, json: { text: 'step' } })).json;
    for (const text of ['', '   ', 'b'.repeat(256), 5]) {
        assert.equal((await send('POST', `/todos/${todo.id}/subtasks`, { cookie, json: { text } })).status, 400);
    }
    for (const json of [{ done: 'yes' }, {}]) {
        assert.equal((await send('PATCH', `/todos/${todo.id}/subtasks/${sub.id}`, { cookie, json })).status, 400);
    }
});

test('somebody else\'s tasks look like they do not exist', async () => {
    const alice = await signUp('quinn');
    const bob = await signUp('rosa');
    const todo = (await send('POST', '/todos', { cookie: alice, json: { text: 'private' } })).json;
    const sub = (await send('POST', `/todos/${todo.id}/subtasks`, { cookie: alice, json: { text: 'step' } })).json;
    assert.deepEqual((await send('GET', '/todos', { cookie: bob })).json, []);
    const attempts = [
        send('PATCH', `/todos/${todo.id}`, { cookie: bob, json: { done: true } }),
        send('DELETE', `/todos/${todo.id}`, { cookie: bob }),
        send('POST', `/todos/${todo.id}/subtasks`, { cookie: bob, json: { text: 'intruder' } }),
        send('PATCH', `/todos/${todo.id}/subtasks/${sub.id}`, { cookie: bob, json: { done: true } }),
        send('DELETE', `/todos/${todo.id}/subtasks/${sub.id}`, { cookie: bob }),
    ];
    for (const answer of await Promise.all(attempts)) {
        assert.equal(answer.status, 404);
        assert.deepEqual(answer.json, { error: 'not found' });
    }
    const [kept] = (await send('GET', '/todos', { cookie: alice })).json;
    assert.equal(kept.done, false);
    assert.deepEqual(kept.subtasks, [sub]);
});

test('weather: needs a city, sends the key, passes the answer through', async () => {
    const cookie = await signUp('sara');
    const missing = await send('GET', '/weather?city=%20', { cookie });
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.json, { error: 'city is required' });
    const ok = await send('GET', '/weather?city=Le%20Mans', { cookie });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json, { main: { temp: 17 } });
    const url = weatherCalls.at(-1)!;
    assert.match(url, /q=Le%20Mans/);
    assert.match(url, /appid=test-key/);
    const nowhere = await send('GET', '/weather?city=Nowhere', { cookie });
    assert.equal(nowhere.status, 404);
    assert.deepEqual(nowhere.json, { cod: '404', message: 'city not found' });
});

test('weather: a service that cannot be reached is a 502', async t => {
    t.mock.method(console, 'error', () => {});
    const cookie = await signUp('theo');
    const answer = await send('GET', '/weather?city=Down', { cookie });
    assert.equal(answer.status, 502);
    assert.deepEqual(answer.json, { error: 'weather service unavailable' });
});

test('an unknown route is a JSON 404', async () => {
    const cookie = await signUp('uma');
    for (const [method, path] of [['GET', '/nothing-here'], ['POST', '/nothing-here'], ['GET', '/todos/1/unknown']]) {
        const answer = await send(method, path, { cookie });
        assert.equal(answer.status, 404, `${method} ${path}`);
        assert.deepEqual(answer.json, { error: 'not found' });
    }
});

test('a lost database connection is a 503', async t => {
    const log = t.mock.method(console, 'error', () => {});
    const repo = { ...createRepository(createTestDatabase()), listTodos: async () => { throw Object.assign(new Error('socket closed'), { fatal: true }); } };
    const target = await startApp(repo);
    const cookie = `sid=${createSession(1, 'victor')}`;
    const answer = await send('GET', '/todos', { cookie, target });
    assert.equal(answer.status, 503);
    assert.deepEqual(answer.json, { error: 'database unavailable' });
    assert.equal(log.mock.callCount(), 1);
});

test('an unexpected error is a 500 that does not leak details', async t => {
    const log = t.mock.method(console, 'error', () => {});
    const secret = "Data too long for column 'text' at row 1";
    const repo = { ...createRepository(createTestDatabase()), listTodos: async () => { throw Object.assign(new Error(secret), { code: 'ER_DATA_TOO_LONG', errno: 1406 }); } };
    const target = await startApp(repo);
    const cookie = `sid=${createSession(1, 'wendy')}`;
    const answer = await send('GET', '/todos', { cookie, target });
    assert.equal(answer.status, 500);
    assert.deepEqual(answer.json, { error: 'internal error' });
    assert.ok(!answer.text.includes('Data too long'));
    assert.equal(log.mock.callCount(), 1);
});
