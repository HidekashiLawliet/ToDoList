import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepository } from './repository.ts';
import { createTestDatabase } from './testDatabase.ts';

// Two users, so tests can check they stay apart
async function setup() {
    const db = createTestDatabase();
    const repo = createRepository(db);
    const alice = (await repo.createUser('alice', 'hash-a'))!;
    const bob = (await repo.createUser('bob', 'hash-b'))!;
    return { db, repo, alice, bob };
}

test('schema check passes when the three tables exist', async () => {
    const { repo } = await setup();
    await repo.checkSchema();
});

test('schema check fails when a table is missing', async () => {
    const db = createTestDatabase();
    const repo = createRepository({ query: (sql, values) => db.query(sql.replace('FROM subtask', 'FROM missing_table'), values) });
    await assert.rejects(repo.checkSchema());
});

test('users: create, find and detect a taken pseudonyme', async () => {
    const { repo, alice } = await setup();
    assert.deepEqual(await repo.findUser('alice'), { userId: alice, hashedPassword: 'hash-a' });
    assert.equal(await repo.findUser('nobody'), null);
    assert.equal(await repo.pseudonymeTaken('alice'), true);
    assert.equal(await repo.pseudonymeTaken('carol'), false);
});

test('users: a second sign-up with the same pseudonyme returns null', async () => {
    const { repo } = await setup();
    assert.equal(await repo.createUser('alice', 'other-hash'), null);
});

test('users: "Alice" is the same pseudonyme as "alice"', async () => {
    const { repo } = await setup();
    assert.equal(await repo.createUser('ALICE', 'other-hash'), null);
});

test('todos: add returns the new row and list shows it', async () => {
    const { repo, alice } = await setup();
    const todo = await repo.addTodo(alice, 'Buy milk', false);
    assert.equal(typeof todo.id, 'number');
    assert.deepEqual(todo, { id: todo.id, text: 'Buy milk', done: false });
    assert.deepEqual(await repo.listTodos(alice), [{ id: todo.id, text: 'Buy milk', done: false, subtasks: [] }]);
});

test('todos: done comes back as a real boolean', async () => {
    const { repo, alice } = await setup();
    const todo = await repo.addTodo(alice, 'Done already', true);
    const [listed] = await repo.listTodos(alice);
    assert.equal(listed.done, true);
    assert.equal((await repo.setTodoDone(alice, todo.id, false))?.done, false);
});

test('todos: a user only lists their own', async () => {
    const { repo, alice, bob } = await setup();
    await repo.addTodo(alice, 'alice task', false);
    await repo.addTodo(bob, 'bob task', false);
    assert.deepEqual((await repo.listTodos(alice)).map(t => t.text), ['alice task']);
    assert.deepEqual((await repo.listTodos(bob)).map(t => t.text), ['bob task']);
});

test('todos: tick and untick, only for the owner', async () => {
    const { repo, alice, bob } = await setup();
    const todo = await repo.addTodo(alice, 'task', false);
    assert.equal((await repo.setTodoDone(alice, todo.id, true))?.done, true);
    assert.equal(await repo.setTodoDone(bob, todo.id, false), null);
    assert.equal((await repo.listTodos(alice))[0].done, true);
    assert.equal(await repo.setTodoDone(alice, 9999, true), null);
});

test('todos: delete only works for the owner and removes the sub-tasks', async () => {
    const { repo, alice, bob, db } = await setup();
    const todo = await repo.addTodo(alice, 'task', false);
    await repo.addSubtask(alice, todo.id, 'step');
    assert.equal(await repo.deleteTodo(bob, todo.id), false);
    assert.equal((await repo.listTodos(alice)).length, 1);
    assert.equal(await repo.deleteTodo(alice, todo.id), true);
    assert.equal(await repo.deleteTodo(alice, todo.id), false);
    assert.deepEqual(await db.query('SELECT id FROM subtask'), []);
});

test('sub-tasks: add, list under their todo, tick', async () => {
    const { repo, alice } = await setup();
    const todo = await repo.addTodo(alice, 'task', false);
    const sub = await repo.addSubtask(alice, todo.id, 'step 1');
    assert.deepEqual(sub, { id: sub!.id, text: 'step 1', done: false });
    assert.equal((await repo.setSubtaskDone(alice, todo.id, sub!.id, true))?.done, true);
    assert.deepEqual((await repo.listTodos(alice))[0].subtasks, [{ id: sub!.id, text: 'step 1', done: true }]);
});

test('sub-tasks: nobody can add to somebody else\'s todo', async () => {
    const { repo, alice, bob } = await setup();
    const todo = await repo.addTodo(alice, 'task', false);
    assert.equal(await repo.addSubtask(bob, todo.id, 'intruder'), null);
    assert.equal(await repo.addSubtask(alice, 9999, 'nowhere'), null);
    assert.deepEqual((await repo.listTodos(alice))[0].subtasks, []);
});

test('sub-tasks: tick and delete need the right owner and the right todo', async () => {
    const { repo, alice, bob } = await setup();
    const first = await repo.addTodo(alice, 'first', false);
    const second = await repo.addTodo(alice, 'second', false);
    const sub = (await repo.addSubtask(alice, first.id, 'step'))!;
    assert.equal(await repo.setSubtaskDone(bob, first.id, sub.id, true), null);
    assert.equal(await repo.setSubtaskDone(alice, second.id, sub.id, true), null);
    assert.equal(await repo.deleteSubtask(bob, first.id, sub.id), false);
    assert.equal(await repo.deleteSubtask(alice, second.id, sub.id), false);
    assert.equal((await repo.listTodos(alice))[0].subtasks[0].done, false);
    assert.equal(await repo.deleteSubtask(alice, first.id, sub.id), true);
    assert.deepEqual((await repo.listTodos(alice))[0].subtasks, []);
});

test('the database itself refuses a text over 255 characters', async () => {
    const { repo, alice } = await setup();
    await assert.rejects(repo.addTodo(alice, 'a'.repeat(256), false), { code: 'ER_DATA_TOO_LONG' });
});
