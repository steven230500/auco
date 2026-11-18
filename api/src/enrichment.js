import { AppError } from './errors.js';

const base = 'USD';
const quote = 'COP';
const rateUrl = `https://api.frankfurter.dev/v2/rate/${base}/${quote}`;

export function createEnricher({ fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  return async () => {
    try {
      const response = await fetchImpl(rateUrl, {
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) throw new Error('Upstream HTTP error');
      const data = await response.json();
      const timestamp = Date.parse(data?.date);
      if (data?.base !== base || data.quote !== quote || !Number.isFinite(data.rate) || data.rate <= 0 ||
          !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== data.date) {
        throw new Error('Invalid upstream payload');
      }
      return { source: 'frankfurter', base, quote, rate: data.rate, date: data.date };
    } catch (error) {
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
      throw new AppError(timeout ? 504 : 502, timeout ? 'ENRICHMENT_TIMEOUT' : 'ENRICHMENT_UNAVAILABLE',
        'No fue posible consultar el enriquecimiento.');
    }
  };
}
