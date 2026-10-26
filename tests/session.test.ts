import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearedSessionCookie, createSession, destroySession, readCookie, readSession, sessionCookie } from '../src/session.ts';

test('readCookie finds one cookie among several', () => {
    assert.equal(readCookie('a=1; sid=abc; b=2', 'sid'), 'abc');
    assert.equal(readCookie('sid=a=b', 'sid'), 'a=b');
});

test('readCookie does not confuse cookie names or crash without a header', () => {
    assert.equal(readCookie('sidx=1; xsid=2', 'sid'), undefined);
    assert.equal(readCookie('sid', 'sid'), undefined);
    assert.equal(readCookie(undefined, 'sid'), undefined);
    assert.equal(readCookie('', 'sid'), undefined);
});

test('a session can be read back with its own token', () => {
    const token = createSession(7, 'alice');
    assert.deepEqual(readSession(`theme=dark; sid=${token}`)?.pseudonyme, 'alice');
    assert.equal(readSession(`sid=${token}`)?.userId, 7);
});

test('a made-up, empty or missing token gives no session', () => {
    createSession(7, 'alice');
    assert.equal(readSession('sid=0000'), undefined);
    assert.equal(readSession('sid='), undefined);
    assert.equal(readSession('other=1'), undefined);
    assert.equal(readSession(undefined), undefined);
});

test('tokens are 64 hex characters and never repeat', () => {
    const first = createSession(1, 'a');
    const second = createSession(1, 'a');
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.notEqual(first, second);
});

test('a session ends after 8 hours', (t) => {
    const start = Date.now();
    const token = createSession(1, 'a');
    t.mock.method(Date, 'now', () => start + 8 * 60 * 60 * 1000 - 1);
    assert.notEqual(readSession(`sid=${token}`), undefined);
    t.mock.method(Date, 'now', () => start + 8 * 60 * 60 * 1000);
    assert.equal(readSession(`sid=${token}`), undefined);
});

test('the cookie is HttpOnly and SameSite=Lax, and Secure only on https', () => {
    const plain = sessionCookie('abc', false);
    assert.match(plain, /^sid=abc; HttpOnly; SameSite=Lax; Path=\/; Max-Age=28800$/);
    assert.ok(sessionCookie('abc', true).endsWith('; Secure'));
});

test('logging out ends that session only', () => {
    const mine = createSession(1, 'alice');
    const other = createSession(2, 'bob');
    destroySession(`sid=${mine}`);
    assert.equal(readSession(`sid=${mine}`), undefined);
    assert.equal(readSession(`sid=${other}`)?.userId, 2);
});

test('logging out without a session does nothing', () => {
    destroySession(undefined);
    destroySession('sid=0000');
    destroySession('other=1');
});

test('the logout cookie is empty and expires at once', () => {
    assert.match(clearedSessionCookie(false), /^sid=; HttpOnly; SameSite=Lax; Path=\/; Max-Age=0$/);
    assert.ok(clearedSessionCookie(true).endsWith('; Secure'));
});
