## Development Setup

To use real rates in development:

1. Copy `src/config/rates/rates.prod.template.js` to `src/config/rates/rates.prod.js`
2. Update the rates in `rates.prod.js` with your actual values
3. The `rates.prod.js` file is gitignored and won't be committed

For demo/public use, the rates in `rates.demo.js` will be used automatically.
