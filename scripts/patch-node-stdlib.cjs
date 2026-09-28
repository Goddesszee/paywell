'use strict'
// Patches node-stdlib-browser/helpers/rollup/plugin.js to make
// handleCircularDependancyWarning a no-op. This stops vite-plugin-node-polyfills
// from calling Vite's internal viteLog with warnings that Vercel promotes to
// fatal build errors. Runs automatically via the "postinstall" npm script.
const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '..', 'node_modules', 'node-stdlib-browser', 'helpers', 'rollup', 'plugin.js')

if (!fs.existsSync(target)) {
  console.log('patch-node-stdlib: target not found, skipping')
  process.exit(0)
}

const patched = `'use strict';
// Patched by scripts/patch-node-stdlib.cjs — no-op to prevent Vercel build failures
function handleCircularDependancyWarning(_warning, _warningHandler) {}
module.exports.handleCircularDependancyWarning = handleCircularDependancyWarning;
`

fs.writeFileSync(target, patched, 'utf8')
console.log('patch-node-stdlib: patched successfully')
