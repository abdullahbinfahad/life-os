'use strict';

const { timingSafeEqual } = require('node:crypto');

const STATE_PATTERN = /^[a-f0-9]{64}$/i;
const CALLBACK_KEYS = new Set(['app_state', 'code', 'state', 'error', 'error_code', 'error_description']);
const CONTROL_CHARACTERS = /[\u0000-\u0020\u007f]/;

function getSingleParam(url, key) {
  const values = url.searchParams.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function hasOnlyParams(url, allowed) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) return false;
    if (url.searchParams.getAll(key).length !== 1) return false;
  }
  return true;
}

function isLifeOsCallbackUrl(url) {
  return url.protocol === 'lifeos:' &&
    url.hostname === 'auth' &&
    url.pathname === '/callback' &&
    !url.username &&
    !url.password &&
    !url.port;
}

function parseGoogleAuthorizationUrl(rawUrl, expectedOrigin) {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      url.origin !== expectedOrigin ||
      url.username ||
      url.password ||
      url.pathname !== '/auth/v1/authorize' ||
      getSingleParam(url, 'provider') !== 'google'
    ) return null;

    const redirectTo = getSingleParam(url, 'redirect_to');
    const codeChallenge = getSingleParam(url, 'code_challenge');
    const challengeMethod = getSingleParam(url, 'code_challenge_method');
    if (!redirectTo || !codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return null;
    if (!challengeMethod || challengeMethod.toLowerCase() !== 's256') return null;

    const callback = new URL(redirectTo);
    if (!isLifeOsCallbackUrl(callback) || callback.hash || !hasOnlyParams(callback, new Set(['app_state']))) return null;

    const appState = getSingleParam(callback, 'app_state');
    if (!appState || !STATE_PATTERN.test(appState)) return null;
    return { authorizationUrl: url.href, appState };
  } catch {
    return null;
  }
}

function parseOAuthCallback(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!isLifeOsCallbackUrl(url) || url.hash || !hasOnlyParams(url, CALLBACK_KEYS)) return null;

    const appState = getSingleParam(url, 'app_state');
    if (!appState || !STATE_PATTERN.test(appState)) return null;

    const code = url.searchParams.has('code') ? getSingleParam(url, 'code') : null;
    const error = url.searchParams.has('error') ? getSingleParam(url, 'error') : null;
    if (Boolean(code) === Boolean(error)) return null;

    if (code && (code.length > 4096 || CONTROL_CHARACTERS.test(code))) return null;
    if (error && (error.length > 256 || CONTROL_CHARACTERS.test(error))) return null;

    const errorCode = url.searchParams.has('error_code') ? getSingleParam(url, 'error_code') : null;
    const errorDescription = url.searchParams.has('error_description')
      ? getSingleParam(url, 'error_description')
      : null;
    if (errorCode && (errorCode.length > 128 || CONTROL_CHARACTERS.test(errorCode))) return null;
    if (errorDescription && (errorDescription.length > 1024 || CONTROL_CHARACTERS.test(errorDescription))) return null;

    return code
      ? { kind: 'code', appState, code }
      : { kind: 'error', appState, error, errorCode, errorDescription };
  } catch {
    return null;
  }
}

function stateMatches(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  if (!STATE_PATTERN.test(expected) || !STATE_PATTERN.test(received)) return false;
  const expectedBytes = Buffer.from(expected, 'hex');
  const receivedBytes = Buffer.from(received, 'hex');
  return expectedBytes.length === 32 && receivedBytes.length === 32 && timingSafeEqual(expectedBytes, receivedBytes);
}

function rendererUrlForOAuthCode(appUrl, code) {
  if (typeof code !== 'string' || code.length > 4096 || CONTROL_CHARACTERS.test(code)) return null;
  try {
    const target = new URL(appUrl);
    target.searchParams.set('code', code);
    return target.href;
  } catch {
    return null;
  }
}

module.exports = {
  isLifeOsCallbackUrl,
  parseGoogleAuthorizationUrl,
  parseOAuthCallback,
  rendererUrlForOAuthCode,
  stateMatches,
};
