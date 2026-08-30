/**
 * @typedef {Object} HarnessAdapter
 * @property {string} id
 * @property {string} label
 * @property {() => Promise<boolean>} detect
 * @property {() => Promise<Array<object>>} readUsage
 * @property {() => Promise<object>} detectBackend
 */

export {};
