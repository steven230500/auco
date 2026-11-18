import { AppError } from './errors.js';

// Sends only the first name; the document number never leaves this service.
export function createEnricher({ fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  return async ({ name }) => {
    const firstName = name.split(' ')[0];
    const url = new URL('https://api.agify.io/');
    url.searchParams.set('name', firstName);
    try {
      const response = await fetchImpl(url.toString(), {
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) throw new Error('Upstream HTTP error');
      const data = await response.json();
      if (data?.name !== firstName || !(data.age === null || (Number.isInteger(data.age) && data.age >= 0 && data.age <= 150)) ||
          !Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid upstream payload');
      return { source: 'agify', estimatedAge: data.age, sampleCount: data.count };
    } catch (error) {
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
      throw new AppError(timeout ? 504 : 502, timeout ? 'ENRICHMENT_TIMEOUT' : 'ENRICHMENT_UNAVAILABLE',
        'No fue posible consultar el enriquecimiento.');
    }
  };
}
