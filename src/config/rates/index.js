import * as demoRates from './rates.demo';

const prodModules = import.meta.glob('./rates.prod.js', { eager: false });

// Create an async function to load the config
async function loadRatesConfig() {
  try {
    const loader = prodModules['./rates.prod.js'];
    if (loader && import.meta.env.PROD) {
      const prodRates = await loader();
      return prodRates;
    }
    return demoRates;
  } catch {
    return demoRates;
  }
}

// Export a function that returns a promise with the rates
export const getRatesConfig = () => loadRatesConfig();

// Default export for immediate access to demo rates
export const { INTERNAL_RATE, CONSULTANT_RATES } = demoRates;