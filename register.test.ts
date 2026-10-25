import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNewUser } from './register.ts';

test('a normal sign-up is accepted', () => {
    assert.equal(checkNewUser('alice', 'correct horse', 'correct horse'), null);
});

test('pseudonyme: 3 to 50 characters', () => {
    assert.equal(checkNewUser('', 'correct horse', 'correct horse'), 'pseudonyme');
    assert.equal(checkNewUser('ab', 'correct horse', 'correct horse'), 'pseudonyme');
    assert.equal(checkNewUser('abc', 'correct horse', 'correct horse'), null);
    assert.equal(checkNewUser('a'.repeat(50), 'correct horse', 'correct horse'), null);
    assert.equal(checkNewUser('a'.repeat(51), 'correct horse', 'correct horse'), 'pseudonyme');
});

test('pseudonyme: an emoji is one character, as for MariaDB', () => {
    assert.equal(checkNewUser('😀'.repeat(50), 'correct horse', 'correct horse'), null);
    assert.equal(checkNewUser('😀'.repeat(51), 'correct horse', 'correct horse'), 'pseudonyme');
});

test('password: at least 8 characters', () => {
    assert.equal(checkNewUser('alice', '1234567', '1234567'), 'password');
    assert.equal(checkNewUser('alice', '12345678', '12345678'), null);
});

test('password: at most 72 bytes (bcrypt limit), accents count for 2', () => {
    assert.equal(checkNewUser('alice', 'a'.repeat(72), 'a'.repeat(72)), null);
    assert.equal(checkNewUser('alice', 'a'.repeat(73), 'a'.repeat(73)), 'password');
    assert.equal(checkNewUser('alice', 'é'.repeat(36), 'é'.repeat(36)), null);
    assert.equal(checkNewUser('alice', 'é'.repeat(37), 'é'.repeat(37)), 'password');
});

test('password: spaces are part of it, never trimmed', () => {
    assert.equal(checkNewUser('alice', '       a', '       a'), null);
    assert.equal(checkNewUser('alice', 'correct horse ', 'correct horse'), 'mismatch');
});

test('the confirmation must be identical', () => {
    assert.equal(checkNewUser('alice', 'correct horse', 'correct horsE'), 'mismatch');
    assert.equal(checkNewUser('alice', 'correct horse', ''), 'mismatch');
});

test('the pseudonyme is checked before the passwords', () => {
    assert.equal(checkNewUser('ab', 'short', 'different'), 'pseudonyme');
    assert.equal(checkNewUser('alice', 'short', 'different'), 'password');
});
