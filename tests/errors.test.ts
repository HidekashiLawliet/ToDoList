import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError, HttpError, notFound } from '../src/errors.ts';

test('an HttpError keeps its own status and message', () => {
    assert.deepEqual(describeError(new HttpError(401, 'login required')), { status: 401, message: 'login required' });
    assert.deepEqual(describeError(new HttpError(400, 'text must have 1 to 255 characters')), { status: 400, message: 'text must have 1 to 255 characters' });
});

test('notFound is a 404', () => {
    assert.deepEqual(describeError(notFound()), { status: 404, message: 'not found' });
    assert.ok(notFound() instanceof Error);
});

test('bad JSON from the body parser is a 400', () => {
    const error = Object.assign(new SyntaxError('Unexpected token } in JSON'), { status: 400, type: 'entity.parse.failed' });
    assert.deepEqual(describeError(error), { status: 400, message: 'request body is not valid JSON' });
});

test('a body that is too large is a 413', () => {
    const error = Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' });
    assert.deepEqual(describeError(error), { status: 413, message: 'request body is too large' });
});

test('any other 4xx status is kept, with its standard text', () => {
    assert.deepEqual(describeError(Object.assign(new Error('x'), { status: 415 })), { status: 415, message: 'unsupported media type' });
    assert.deepEqual(describeError(Object.assign(new Error('x'), { status: 404 })), { status: 404, message: 'not found' });
});

test('a lost database connection is a 503', () => {
    const answer = { status: 503, message: 'database unavailable' };
    assert.deepEqual(describeError(Object.assign(new Error('closed'), { fatal: true, code: 'ER_SOCKET_UNEXPECTED_CLOSE' })), answer);
    assert.deepEqual(describeError(Object.assign(new Error('pool timeout'), { errno: 45028, code: 'ER_GET_CONNECTION_TIMEOUT' })), answer);
    assert.deepEqual(describeError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })), answer);
    assert.deepEqual(describeError(Object.assign(new Error('dns'), { code: 'ENOTFOUND' })), answer);
});

test('a normal SQL error is a 500 that does not leak details', () => {
    const error = Object.assign(new Error("Data too long for column 'text' at row 1"), { code: 'ER_DATA_TOO_LONG', errno: 1406, fatal: false });
    assert.deepEqual(describeError(error), { status: 500, message: 'internal error' });
});

test('a 5xx status carried by a foreign error is not trusted', () => {
    assert.deepEqual(describeError(Object.assign(new Error('x'), { status: 502 })), { status: 500, message: 'internal error' });
});

test('anything unknown is a 500', () => {
    for (const value of [new Error('boom'), 'text', 42, null, undefined, {}]) {
        assert.deepEqual(describeError(value), { status: 500, message: 'internal error' });
    }
});
