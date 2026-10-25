import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDone, readText, TEXT_MAX } from './todoInput.ts';

test('text: a normal text is kept', () => {
    assert.equal(readText('Buy milk'), 'Buy milk');
});

test('text: spaces around it are removed', () => {
    assert.equal(readText('  Buy milk \n'), 'Buy milk');
});

test('text: empty or blank is refused', () => {
    assert.equal(readText(''), null);
    assert.equal(readText('   '), null);
    assert.equal(readText('\n\t'), null);
});

test('text: 1 to 255 characters', () => {
    assert.equal(TEXT_MAX, 255);
    assert.equal(readText('a'), 'a');
    assert.equal(readText('a'.repeat(255)), 'a'.repeat(255));
    assert.equal(readText('a'.repeat(256)), null);
});

test('text: the limit applies after trimming', () => {
    assert.equal(readText(` ${'a'.repeat(255)} `), 'a'.repeat(255));
    assert.equal(readText(` ${'a'.repeat(256)} `), null);
});

test('text: an emoji is one character, as for MariaDB', () => {
    assert.equal(readText('😀'.repeat(255)), '😀'.repeat(255));
    assert.equal(readText('😀'.repeat(256)), null);
    assert.equal(readText('é'.repeat(255)), 'é'.repeat(255));
});

test('text: only a string is accepted', () => {
    for (const value of [undefined, null, 42, true, ['a'], { text: 'a' }]) {
        assert.equal(readText(value), null);
    }
});

test('done: true and false are accepted', () => {
    assert.equal(readDone(true), true);
    assert.equal(readDone(false), false);
});

test('done: missing gives the fallback, or null without one', () => {
    assert.equal(readDone(undefined, false), false);
    assert.equal(readDone(undefined, true), true);
    assert.equal(readDone(undefined), null);
});

test('done: anything else is refused, even the string "false"', () => {
    for (const value of ['false', 'true', 0, 1, null, [], {}]) {
        assert.equal(readDone(value), null);
        assert.equal(readDone(value, false), null);
    }
});
