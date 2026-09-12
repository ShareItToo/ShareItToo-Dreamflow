import assert from 'node:assert/strict';
import test from 'node:test';

import { minimizeThirdPartyStructuredLocations } from '../src/privacy_export.js';

test('privacy export removes a received structured exact location without mutating input', () => {
  const input = [
    {
      id: 'own-location',
      sent_by_me: true,
      body: '📍 LOCATION_SHARE|Übergabe|52.501|13.401|https://maps.example/own|handover|Eigenweg 7|Ich',
    },
    {
      id: 'received-location',
      sent_by_me: false,
      body: 'Hinweis\n📍 LOCATION_SHARE|Rückgabe|52.502|13.402|https://maps.example/other|return|Fremdweg 9|Andere Person',
    },
  ];

  const result = minimizeThirdPartyStructuredLocations(input);

  assert.equal(result.omittedCount, 1);
  assert.match(result.messages[0].body, /Eigenweg 7/u);
  assert.match(result.messages[1].body, /Hinweis/u);
  assert.match(result.messages[1].body, /THIRD_PARTY_EXACT_LOCATION_OMITTED/u);
  assert.doesNotMatch(
    result.messages[1].body,
    /Fremdweg|52\.502|13\.402|maps\.example|Andere Person/u,
  );
  assert.match(input[1].body, /Fremdweg 9/u);
});

test('privacy export leaves ordinary received text unchanged', () => {
  const message = { id: 'ordinary', sent_by_me: false, body: 'Treffen wir uns um 18 Uhr?' };
  const result = minimizeThirdPartyStructuredLocations([message]);
  assert.equal(result.omittedCount, 0);
  assert.equal(result.messages[0], message);
});
