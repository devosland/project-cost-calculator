import * as demoRates from './rates.demo';

// Create an async function to load the config
async function loadRatesConfig() {
  try {
    const prodRates = await import('./rates.prod.js');
    return process.env.NODE_ENV === 'production' ? prodRates : demoRates;
  } catch {
    return demoRates;
  }
}

// Export a function that returns a promise with the rates
export const getRatesConfig = () => loadRatesConfig();

// Default export for immediate access to demo rates
export const { INTERNAL_RATE, CONSULTANT_RATES } = demoRates;