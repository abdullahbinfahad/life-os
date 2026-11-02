'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGoogleAuthorizationUrl,
  parseOAuthCallback,
  rendererUrlForOAuthCode,
  stateMatches,
} = require('./oauth-security.cjs');

const authOrigin = 'https://qzbcanzmgetdrnlijujh.supabase.co';
const appState = 'a'.repeat(64);
const otherState = 'b'.repeat(64);
const challenge = 'c'.repeat(43);

function makeAuthorizationUrl({ origin = authOrigin, provider = 'google', redirectState = appState, method = 's256', includeChallenge = true } = {}) {
  const callback = new URL('lifeos://auth/callback');
  if (redirectState) callback.searchParams.set('app_state', redirectState);
  const url = new URL('/auth/v1/authorize', origin);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', callback.href);
  if (includeChallenge) {
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', method);
  }
  return url.href;
}

test('accepts only the configured Google authorize endpoint with S256 PKCE and one app state', () => {
  assert.deepEqual(parseGoogleAuthorizationUrl(makeAuthorizationUrl(), authOrigin), {
    authorizationUrl: makeAuthorizationUrl(),
    appState,
  });
  assert.equal(parseGoogleAuthorizationUrl(makeAuthorizationUrl({ origin: 'https://attacker.example' }), authOrigin), null);
  assert.equal(parseGoogleAuthorizationUrl(makeAuthorizationUrl({ provider: 'github' }), authOrigin), null);
  assert.equal(parseGoogleAuthorizationUrl(makeAuthorizationUrl({ method: 'plain' }), authOrigin), null);
  assert.equal(parseGoogleAuthorizationUrl(makeAuthorizationUrl({ includeChallenge: false }), authOrigin), null);
  assert.equal(parseGoogleAuthorizationUrl(makeAuthorizationUrl({ redirectState: null }), authOrigin), null);
});

test('accepts a matching one-time PKCE code callback and forwards only the code', () => {
  const callback = parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=one-time-code&state=provider-state`);
  assert.deepEqual(callback, { kind: 'code', appState, code: 'one-time-code' });
  assert.equal(stateMatches(appState, callback.appState), true);

  const rendererUrl = new URL(rendererUrlForOAuthCode('https://abdullahbinfahad.github.io/life-os/', callback.code));
  assert.equal(rendererUrl.origin, 'https://abdullahbinfahad.github.io');
  assert.equal(rendererUrl.pathname, '/life-os/');
  assert.equal(rendererUrl.searchParams.get('code'), 'one-time-code');
  assert.equal(rendererUrl.searchParams.has('app_state'), false);
  assert.equal(rendererUrl.searchParams.has('access_token'), false);
});

test('rejects callbacks without the matching request state', () => {
  assert.equal(parseOAuthCallback('lifeos://auth/callback?code=one-time-code'), null);
  const callback = parseOAuthCallback(`lifeos://auth/callback?app_state=${otherState}&code=one-time-code`);
  assert.equal(stateMatches(appState, callback.appState), false);
  assert.equal(stateMatches(appState, 'not-a-state'), false);
});

test('rejects implicit bearer-token query and fragment callbacks', () => {
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&access_token=secret&refresh_token=secret`), null);
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=one-time-code#access_token=secret`), null);
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=one-time-code&refresh_token=secret`), null);
});

test('rejects duplicate and ambiguous callback fields', () => {
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=first&code=second`), null);
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=one-time-code&error=access_denied`), null);
  assert.equal(parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&code=one-time-code&unexpected=value`), null);
});

test('accepts only a state-bound error response without forwarding its text as a session', () => {
  const callback = parseOAuthCallback(`lifeos://auth/callback?app_state=${appState}&error=access_denied&error_code=provider_cancelled`);
  assert.deepEqual(callback, {
    kind: 'error',
    appState,
    error: 'access_denied',
    errorCode: 'provider_cancelled',
    errorDescription: null,
  });
});
