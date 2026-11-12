import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeUrl, challengeOf, createVerifier, finishLogin, forgetTokens, readTokens, returnAddress, saveTokens, startLogin, tokensFrom } from '../src/spotify.ts';

test('the PKCE challenge is the base64url SHA-256 of the verifier (RFC 7636 example)', () => {
    assert.equal(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('a verifier is long enough and URL-safe', () => {
    const verifier = createVerifier();
    assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
});

test('authorizeUrl sends every PKCE parameter Spotify needs', () => {
    const url = new URL(authorizeUrl('client', 'http://127.0.0.1:3000/spotify/callback', 'st', 'ch'));
    assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
    assert.equal(url.searchParams.get('client_id'), 'client');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:3000/spotify/callback');
    assert.equal(url.searchParams.get('state'), 'st');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), 'ch');
    assert.match(url.searchParams.get('scope') ?? '', /\bstreaming\b/);
});

test('a login state works once and remembers who started it', () => {
    const state = startLogin(1, 'verifier-1', 'http://localhost:3000/');
    assert.deepEqual(
        { ...finishLogin(state), expires: 0 },
        { userId: 1, verifier: 'verifier-1', returnTo: 'http://localhost:3000/', expires: 0 },
    );
    assert.equal(finishLogin(state), undefined);
    assert.equal(finishLogin('unknown'), undefined);
});

test('returnAddress only allows our own local addresses', () => {
    assert.equal(returnAddress('localhost:3000'), 'http://localhost:3000/');
    assert.equal(returnAddress('127.0.0.1:3000'), 'http://127.0.0.1:3000/');
    assert.equal(returnAddress('evil.example'), '/');
    assert.equal(returnAddress('localhost.evil.example'), '/');
    assert.equal(returnAddress(undefined), '/');
});

test('tokensFrom reads Spotify answers and keeps the old refresh token', () => {
    const first = tokensFrom({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
    assert.equal(first?.accessToken, 'a');
    assert.equal(first?.refreshToken, 'r');
    assert.ok(first !== null && first.expiresAt > Date.now());
    assert.equal(tokensFrom({ access_token: 'b', expires_in: 3600 }, 'old')?.refreshToken, 'old');
    assert.equal(tokensFrom({ error: 'invalid_grant' }), null);
    assert.equal(tokensFrom(null), null);
});

test('tokens are stored per user and can be forgotten', () => {
    saveTokens(5, { accessToken: 'a', refreshToken: 'r', expiresAt: 0 });
    assert.equal(readTokens(5)?.accessToken, 'a');
    assert.equal(readTokens(6), undefined);
    forgetTokens(5);
    assert.equal(readTokens(5), undefined);
});
