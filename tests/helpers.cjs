const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const root = resolve(__dirname, '..');
// Set IISM_TEST_BASELINE to a Git revision to run compatibility cases against it.
function source(file, baseline = false) {
  return baseline && process.env.IISM_TEST_BASELINE
    ? execFileSync('git', ['show', `${process.env.IISM_TEST_BASELINE}:${file}`], {cwd: root, encoding: 'utf8'})
    : readFileSync(resolve(root, file), 'utf8');
}

function control(id, {type = 'text', tagName = 'INPUT', label = '', ...attributes} = {}) {
  const events = [];
  return {
    id, name: '', tagName, type, value: '', disabled: false, readOnly: false,
    isConnected: true, files: [], accept: '', parentElement: null,
    labels: label ? [{textContent: label}] : [], events,
    getAttribute(key) { return key === 'type' ? this.type : (attributes[key] ?? null); },
    hasAttribute(key) { return attributes[key] != null; },
    getClientRects() { return [1]; },
    closest() { return null; },
    dispatchEvent(event) { events.push(event.type); return true; }
  };
}

function contentHarness({inputs = [], keys = [], profile = {}, onMessage, baseline = false} = {}) {
  const session = new Map();
  const timers = [];
  const messages = [];
  const notices = [];
  const location = new URL('https://example.invalid/');
  const document = {
    querySelectorAll(selector) {
      return selector === 'input[type="file"]' ? inputs.filter((input) => input.type === 'file') : inputs;
    },
    getElementById() { return null; },
    createElement() { return {style: {}, setAttribute() {}, addEventListener() {}, append() {}, remove() {}}; },
    body: {append(node) { notices.push(node); }}
  };
  const context = vm.createContext({
    console, URL, File, Blob, Uint8Array, atob, Event, document,
    window: {location, getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    sessionStorage: {getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key)},
    setTimeout: (fn, delay) => { timers.push({fn, delay}); return timers.length; },
    clearTimeout() {},
    HTMLInputElement: class {}, HTMLSelectElement: class {}, HTMLTextAreaElement: class {},
    DataTransfer: class {
      constructor() { this.files = []; this.items = {add: (file) => this.files.push(file)}; }
    },
    chrome: {
      storage: {local: {get: async () => ({profile})}},
      runtime: {onMessage: {addListener() {}}, async sendMessage(message) {
        messages.push(message);
        const custom = await onMessage?.(message);
        if (custom !== undefined) return custom;
        if (message.action === 'DOC_LIST') return {ok: true, keys};
        if (message.action === 'DOC_PREPARE') return {ok: true, token: message.key,
          size: 4, name: `${message.key}.png`, type: 'image/png', lastModified: 100};
        if (message.action === 'DOC_CHUNK') return {ok: true, data: btoa('test')};
        return {ok: true};
      }}
    }
  });
  const exports = 'isFormPage, dateForControl, matchFields, getOption, matchUploadFields, siteAcceptsFile, attachSavedDocuments, runPendingAutofill, diagnostics, mayAutoAttempt';
  const script = source('content.js', baseline).replace(/\}\)\(\);\s*$/, `globalThis.api = {${exports}};})();`);
  vm.runInContext(script, context);
  return {api: context.api, session, timers, messages, notices, location};
}

function workerHarness() {
  let reads = 0;
  let now = 1000;
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  const context = vm.createContext({
    URL, Uint8Array, btoa, crypto: require('node:crypto').webcrypto,
    Date: {now: () => now}, importScripts() {},
    chrome: {runtime: {id: 'test-extension', onMessage: {addListener() {}}}},
    IismDocumentStore: {
      savedKeys: async () => ['applicantPhoto'],
      async readDocument() {
        reads++;
        return {meta: {name: 'synthetic.png', type: 'image/png', lastModified: 100}, bytes};
      }
    }
  });
  vm.runInContext(source('documents-worker.js') + '\nglobalThis.api = {handle, allowedPage};', context);
  return {api: context.api, bytes, reads: () => reads, advance: (ms) => { now += ms; }};
}

module.exports = {source, contentHarness, control, workerHarness};
