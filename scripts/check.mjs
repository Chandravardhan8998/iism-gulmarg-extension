import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version, 'Manifest and package versions must agree');
assert.equal(pkg.license, 'MIT');
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'clipboardWrite', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://admission.iismgulmarg.in/*']);
assert.equal(manifest.web_accessible_resources, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].matches, [
  'https://admission.iismgulmarg.in/*'
]);
assert.equal(manifest.content_scripts[0].all_frames, false);

const runtimePaths = [manifest.action.default_popup, manifest.options_page,
  manifest.background.service_worker, ...manifest.content_scripts.flatMap((entry) => entry.js)];
for (const file of runtimePaths) assert.ok(existsSync(resolve(root, file)), `Missing ${file}`);

let count = 0;
for (const directory of ['', 'scripts', 'tests']) {
  for (const file of readdirSync(resolve(root, directory))) {
    if (!/\.(?:js|cjs|mjs)$/.test(file)) continue;
    execFileSync(process.execPath, ['--check', resolve(root, directory, file)], {stdio: 'pipe'});
    count++;
  }
}

for (const file of readdirSync(root).filter((name) => name.endsWith('.html'))) {
  const html = readFileSync(resolve(root, file), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:https?:)?\/\//.test(match[1]), `Remote resource in ${file}`);
    assert.ok(existsSync(resolve(root, match[1])), `Missing ${match[1]} referenced by ${file}`);
  }
  assert.ok(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `Inline script in ${file}`);
  assert.ok(!/\son\w+\s*=/i.test(html), `Inline event handler in ${file}`);
}

console.log(`Checked ${count} JavaScript files, manifest permissions, versions, and HTML resources.`);
