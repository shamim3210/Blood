import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRealtimeEventMessage } from '../src/services/bloodSearchService';

test('realtime transport recognizes server event type and payload', () => {
  const payload = { requestId: 'request-1' };
  assert.deepEqual(
    parseRealtimeEventMessage({
      type: 'alerts:sos',
      channel: 'user:donor-1',
      payload,
      timestampIso: '2026-11-06T00:00:00.000Z',
    }),
    { event: 'alerts:sos', payload }
  );
});

test('realtime transport ignores malformed or untyped messages', () => {
  assert.equal(parseRealtimeEventMessage(null), null);
  assert.equal(parseRealtimeEventMessage('{"type":"alerts:sos"}'), null);
  assert.equal(parseRealtimeEventMessage({ payload: { requestId: 'request-1' } }), null);
  assert.equal(parseRealtimeEventMessage({ type: '', payload: {} }), null);
});
