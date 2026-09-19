import assert from 'node:assert/strict';
import test from 'node:test';

import { createMapsProxy, MapsProxyError } from '../src/maps_proxy.js';

const apiKey = `AIza${'x'.repeat(32)}`;

function response(payload, { ok = true } = {}) {
  return { ok, text: async () => JSON.stringify(payload) };
}

test('Maps proxy fails closed without a server-side credential', async () => {
  const proxy = createMapsProxy();
  assert.equal(proxy.enabled, false);
  await assert.rejects(
    proxy.autocomplete({ input: 'Berlin' }),
    (error) => error instanceof MapsProxyError && error.status === 503 && error.code === 'maps_unavailable',
  );
});

test('autocomplete contacts only the fixed Google origin and returns sanitized fields', async () => {
  let captured;
  const proxy = createMapsProxy({
    apiKey,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({
        status: 'OK',
        predictions: [
          { description: ' Berlin, Deutschland ', place_id: 'place_12345', ignored: 'secret' },
          { description: '', place_id: 'invalid' },
        ],
      });
    },
  });
  const suggestions = await proxy.autocomplete({ input: 'Berlin', language: 'de', country: 'de' });
  assert.deepEqual(suggestions, [{ description: 'Berlin, Deutschland', placeId: 'place_12345' }]);
  assert.equal(captured.url.origin, 'https://maps.googleapis.com');
  assert.equal(captured.url.pathname, '/maps/api/place/autocomplete/json');
  assert.equal(captured.url.searchParams.get('key'), apiKey);
  assert.equal(captured.options.headers.Accept, 'application/json');
  assert.equal(JSON.stringify(suggestions).includes(apiKey), false);
});

test('place details validates identifiers, coordinates, and provider status', async () => {
  const proxy = createMapsProxy({
    apiKey,
    fetchImpl: async () => response({
      status: 'OK',
      result: {
        formatted_address: 'Musterstraße 1, Berlin',
        geometry: { location: { lat: 52.52, lng: 13.405 } },
        ignored: { providerMetadata: true },
      },
    }),
  });
  assert.deepEqual(await proxy.placeDetails({ placeId: 'place_12345' }), {
    formattedAddress: 'Musterstraße 1, Berlin',
    lat: 52.52,
    lng: 13.405,
  });
  await assert.rejects(
    proxy.placeDetails({ placeId: 'https://attacker.invalid/' }),
    (error) => error.code === 'invalid_maps_place_id',
  );
});

test('provider failures expose only a generic error and never the credential', async () => {
  const proxy = createMapsProxy({
    apiKey,
    fetchImpl: async () => response({ status: 'REQUEST_DENIED', error_message: `leaked ${apiKey}` }),
  });
  await assert.rejects(proxy.autocomplete({ input: 'Berlin' }), (error) => {
    assert.equal(error.code, 'maps_provider_unavailable');
    assert.equal(error.message.includes(apiKey), false);
    return true;
  });
});
