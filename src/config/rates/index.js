import * as demoRatesFr from './rates.demo';
import * as demoRatesEn from './rates.demo.en';

const prodModules = import.meta.glob('./rates.prod.js', { eager: false });

// Create an async function to load the config
async function loadRatesConfig(locale = 'fr') {
  try {
    const loader = prodModules['./rates.prod.js'];
    if (loader && import.meta.env.PROD) {
      const prodRates = await loader();
      return prodRates;
    }
    return locale === 'en' ? demoRatesEn : demoRatesFr;
  } catch {
    return locale === 'en' ? demoRatesEn : demoRatesFr;
  }
}

// Export a function that returns a promise with the rates
export const getRatesConfig = (locale) => loadRatesConfig(locale);

// Default export for immediate access to demo rates
export const { INTERNAL_RATE, CONSULTANT_RATES } = demoRatesFr;
