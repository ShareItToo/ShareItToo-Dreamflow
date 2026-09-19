const GOOGLE_PLACES_ORIGIN = 'https://maps.googleapis.com';
const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;

export class MapsProxyError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function boundedText(value, { min = 1, max, pattern, code }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max || (pattern && !pattern.test(text))) {
    throw new MapsProxyError(400, code);
  }
  return text;
}

function languageCode(value) {
  return boundedText(value ?? 'de', {
    min: 2,
    max: 2,
    pattern: /^[a-z]{2}$/u,
    code: 'invalid_maps_language',
  });
}

function countryCode(value) {
  return boundedText(value ?? 'de', {
    min: 2,
    max: 2,
    pattern: /^[a-z]{2}$/u,
    code: 'invalid_maps_country',
  });
}

async function providerJson(fetchImpl, url, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MapsProxyError(502, 'maps_provider_unavailable');
  }
  if (!response?.ok) throw new MapsProxyError(502, 'maps_provider_unavailable');

  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new MapsProxyError(502, 'maps_provider_unavailable');
  }
  if (raw.length > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new MapsProxyError(502, 'maps_provider_unavailable');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new MapsProxyError(502, 'maps_provider_unavailable');
  }
}

function providerUrl(path, query, apiKey) {
  const url = new URL(path, GOOGLE_PLACES_ORIGIN);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey);
  return url;
}

export function createMapsProxy({ apiKey = '', fetchImpl = globalThis.fetch, timeoutMs = 5_000 } = {}) {
  const serverApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const enabled = /^AIza[0-9A-Za-z_-]{20,}$/u.test(serverApiKey);

  function requireEnabled() {
    if (!enabled) throw new MapsProxyError(503, 'maps_unavailable');
  }

  return Object.freeze({
    enabled,

    async autocomplete({ input, language = 'de', country = 'de' }) {
      requireEnabled();
      const normalizedInput = boundedText(input, {
        min: 3,
        max: 160,
        code: 'invalid_maps_input',
      });
      const payload = await providerJson(fetchImpl, providerUrl(
        '/maps/api/place/autocomplete/json',
        {
          input: normalizedInput,
          types: 'address',
          language: languageCode(language),
          components: `country:${countryCode(country)}`,
        },
        serverApiKey,
      ), timeoutMs);
      if (payload?.status === 'ZERO_RESULTS') return [];
      if (payload?.status !== 'OK' || !Array.isArray(payload.predictions)) {
        throw new MapsProxyError(502, 'maps_provider_unavailable');
      }
      return payload.predictions.slice(0, 10).flatMap((entry) => {
        const description = typeof entry?.description === 'string' ? entry.description.trim() : '';
        const placeId = typeof entry?.place_id === 'string' ? entry.place_id.trim() : '';
        if (!description || description.length > 240 || !/^[A-Za-z0-9_-]{5,256}$/u.test(placeId)) return [];
        return [{ description, placeId }];
      });
    },

    async placeDetails({ placeId, language = 'de' }) {
      requireEnabled();
      const normalizedPlaceId = boundedText(placeId, {
        min: 5,
        max: 256,
        pattern: /^[A-Za-z0-9_-]+$/u,
        code: 'invalid_maps_place_id',
      });
      const payload = await providerJson(fetchImpl, providerUrl(
        '/maps/api/place/details/json',
        {
          place_id: normalizedPlaceId,
          fields: 'formatted_address,geometry',
          language: languageCode(language),
        },
        serverApiKey,
      ), timeoutMs);
      const formattedAddress = typeof payload?.result?.formatted_address === 'string'
        ? payload.result.formatted_address.trim()
        : '';
      const lat = Number(payload?.result?.geometry?.location?.lat);
      const lng = Number(payload?.result?.geometry?.location?.lng);
      if (payload?.status !== 'OK' || !formattedAddress || formattedAddress.length > 240
          || !Number.isFinite(lat) || lat < -90 || lat > 90
          || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new MapsProxyError(502, 'maps_provider_unavailable');
      }
      return { formattedAddress, lat, lng };
    },
  });
}
