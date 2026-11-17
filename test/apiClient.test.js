import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  apiRequest,
  getStoredAuthToken,
  setStoredAuthToken
} from '../src/lib/apiClient.js';

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

function createStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

beforeEach(() => {
  globalThis.localStorage = createStorage();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
});

test('apiRequest parses a successful JSON response', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/profile');
    assert.equal(options.method, 'GET');

    return new Response(JSON.stringify({ id: 7, name: 'Ada' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const result = await apiRequest('/api/profile', { method: 'GET' });

  assert.deepEqual(result, { id: 7, name: 'Ada' });
});

test('apiRequest returns null for a 204 response', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });

  const result = await apiRequest('/api/profile');

  assert.equal(result, null);
});

test('apiRequest attaches the stored bearer token', async () => {
  setStoredAuthToken('test-jwt');

  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-jwt');
    assert.equal(options.headers['Content-Type'], 'application/json');

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  await apiRequest('/api/protected');
  assert.equal(getStoredAuthToken(), 'test-jwt');
});

test('apiRequest exposes structured details for failed JSON responses', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ detail: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' }),
    {
      status: 409,
      headers: { 'Content-Type': 'application/problem+json' }
    }
  );

  await assert.rejects(
    apiRequest('/api/transfers'),
    (error) => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.message, 'Insufficient balance');
      assert.equal(error.status, 409);
      assert.equal(error.code, 'INSUFFICIENT_BALANCE');
      assert.equal(error.payload.code, 'INSUFFICIENT_BALANCE');
      return true;
    }
  );
});

test('apiRequest unwraps the legacy success envelope', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: true, data: { token: 'abc' } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const result = await apiRequest('/api/auth');

  assert.deepEqual(result, { token: 'abc' });
});
