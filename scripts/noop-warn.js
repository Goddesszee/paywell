// Replaces node-stdlib-browser's handleCircularDependancyWarning with a no-op.
// This prevents vite-plugin-node-polyfills from emitting the circular-dependency
// warning that Vercel's Vite build promotes to a fatal error via viteLog/onRollupLog.
module.exports = { handleCircularDependancyWarning: () => {} }
