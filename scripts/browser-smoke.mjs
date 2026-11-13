// Optional integration check using an extension-capable Chromium executable.
// Requests from test pages are intercepted; no applicant data or live form is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const executable = process.env.IISM_CHROMIUM_PATH;
assert.ok(executable, 'Set IISM_CHROMIUM_PATH to an extension-capable Chromium executable.');
const extension = realpathSync(resolve(process.env.IISM_EXTENSION_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..')));
const profile = mkdtempSync(resolve(tmpdir(), 'iism-browser-test-'));
const extensionId = [...createHash('sha256').update(extension).digest().subarray(0, 16)]
  .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
const base = `chrome-extension://${extensionId}/`;
const formUrl = 'https://admission.iismgulmarg.in/admission_form.aspx?synthetic-test=1';
const browser = spawn(executable, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'
], {stdio: ['ignore', 'ignore', 'pipe']});

let socket;
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Browser startup timed out: ${stderr.slice(-500)}`)), 15_000);
    browser.once('error', (error) => { clearTimeout(timer); reject(error); });
    browser.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Browser exited (${code}): ${stderr.slice(-500)}`)); });
    browser.stderr.on('data', (data) => {
      stderr += data;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else {
      listeners.get(`${message.sessionId}:${message.method}`)?.(message.params);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15_000);
    pending.set(id, {resolve: resolveCall, reject, timer});
    socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const evaluate = async (session, expression) => {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (session, expression) => {
    const end = Date.now() + 10_000;
    while (Date.now() < end) {
      if (await evaluate(session, expression)) return;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`Condition did not become true: ${expression}`);
  };
  const target = async (url) => {
    const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
    const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    if (url) await send('Page.navigate', {url}, sessionId);
    return sessionId;
  };
  console.log('Browser:', (await send('Browser.getVersion')).product);

  const options = await target(`${base}options.html`);
  await waitFor(options, 'Boolean(document.querySelector("#field_name"))');
  await evaluate(options, `(() => {
    document.querySelector('#field_name').value = 'Example Applicant';
    document.querySelector('#field_dob').value = '2000-06-15';
    document.querySelector('#field_course').value = 'Skiing';
    document.querySelector('#field_email').value = 'applicant@example.invalid';
    document.querySelector('#profileForm').requestSubmit();
  })()`);
  await waitFor(options, 'document.querySelector("#saveStatus").textContent.includes("Saved locally")');
  await send('Page.reload', {}, options);
  await waitFor(options, 'document.querySelector("#field_name")?.value === "Example Applicant"');
  console.log('PASS: profile save and persistence');

  const documents = await target(`${base}documents.html`);
  await waitFor(documents, 'document.querySelector("#documentCount")?.textContent.startsWith("0 of 5")');
  await evaluate(documents, `(async () => {
    const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDXsAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    for (const slot of IismDocumentStore.SLOTS) {
      const proof = slot.kind === 'proof';
      const picker = document.querySelector('#doc-input-' + slot.key);
      const transfer = new DataTransfer();
      transfer.items.add(new File([proof ? '%PDF-1.4\\n%%EOF' : image],
        slot.key + (proof ? '.pdf' : '.png'), {type: proof ? 'application/pdf' : 'image/png'}));
      picker.files = transfer.files;
      await saveSelected(slot.key, picker);
    }
    await syncUi();
  })()`);
  await send('Page.reload', {}, documents);
  await waitFor(documents, 'document.querySelector("#documentCount")?.textContent.startsWith("5 of 5")');
  await evaluate(documents, 'document.querySelector("#doc-preview-applicantPhoto").click()');
  await waitFor(documents, 'document.querySelector("#previewDialog").open && document.querySelector("#previewBody img")?.naturalWidth === 1');
  await evaluate(documents, 'document.querySelector("#closePreview").click()');
  await waitFor(documents, '!document.querySelector("#previewDialog").open && !document.querySelector("#previewBody").children.length');
  await evaluate(documents, 'document.querySelector("#doc-preview-dobProof").click()');
  await waitFor(documents, 'document.querySelector("#previewDialog").open && Boolean(document.querySelector("#previewBody iframe"))');
  await evaluate(documents, 'document.querySelector("#closePreview").click()');
  console.log('PASS: all five documents persist in real IndexedDB; image/PDF preview and close');

  const form = await target();
  let requests = 0;
  const fixture = `<!doctype html><html><body><form id="synthetic">
    <select id="ddlCourse"><option value="">Select course</option><option value="ski">Skiing</option></select>
    <input id="txtName"><input id="txtDOB" readonly placeholder="DD/MM/YYYY"><input id="txtEmail">
    <input type="file" id="fuPhoto" accept="image/*"><input type="file" id="fuSignature">
    <input type="file" id="fuGraduation" accept=".pdf"><input type="file" id="fuDOB" accept=".pdf">
    <input type="file" id="fuParentSignature"><input type="checkbox" id="declaration">
    <button type="submit">Submit</button></form>
    <script>
      const course = document.querySelector('#ddlCourse');
      course.value = sessionStorage.getItem('fixtureCourse') || '';
      course.addEventListener('change', () => {
        sessionStorage.setItem('fixtureCourse', course.value);
        sessionStorage.setItem('fixtureReloads', String(Number(sessionStorage.getItem('fixtureReloads')) + 1));
        location.reload();
      });
      document.querySelector('form').addEventListener('submit', event => {
        event.preventDefault(); sessionStorage.setItem('fixtureSubmitted', 'true');
      });
    </script></body></html>`;
  listeners.set(`${form}:Fetch.requestPaused`, (event) => {
    requests++;
    void send('Fetch.fulfillRequest', {requestId: event.requestId, responseCode: 200,
      responseHeaders: [{name: 'Content-Type', value: 'text/html'}], body: Buffer.from(fixture).toString('base64')}, form);
  });
  await send('Fetch.enable', {patterns: [{urlPattern: 'http*', requestStage: 'Request'}]}, form);
  await send('Page.navigate', {url: formUrl}, form);
  await waitFor(form, '[...document.querySelectorAll("input[type=file]")].every(input => input.files.length === 1)');
  assert.equal(await evaluate(form, 'document.querySelector("#txtName").value'), '');
  console.log('PASS: automatic five-document attachment via real worker messaging and DataTransfer');

  // Invoke the same content-script message used by the popup, from an extension page.
  const startFill = `(async () => {
    const [tab] = await chrome.tabs.query({url: 'https://admission.iismgulmarg.in/*'});
    return chrome.tabs.sendMessage(tab.id, {action: 'START_FILL'});
  })()`;
  assert.equal((await evaluate(documents, startFill)).ok, true);
  await waitFor(form, 'document.querySelector("#txtName").value === "Example Applicant"');
  await waitFor(form, '[...document.querySelectorAll("input[type=file]")].every(input => input.files.length === 1)');
  assert.deepEqual(await evaluate(form, `({course: document.querySelector('#ddlCourse').value,
    dob: document.querySelector('#txtDOB').value, email: document.querySelector('#txtEmail').value,
    declared: document.querySelector('#declaration').checked})`),
  {course: 'ski', dob: '15/06/2000', email: 'applicant@example.invalid', declared: false});
  assert.equal(await evaluate(form, '[...document.querySelectorAll("input[type=file]")].every(input => input.files.length === 1)'), true);
  assert.equal(await evaluate(form, 'sessionStorage.getItem("fixtureReloads")'), '1');
  assert.equal(await evaluate(form, 'sessionStorage.getItem("fixtureSubmitted")'), null);
  console.log('PASS: text, readonly DOB, resume after real dropdown refresh, no automatic submission');

  const diagnostic = await evaluate(documents, `(async () => {
    const [tab] = await chrome.tabs.query({url: 'https://admission.iismgulmarg.in/*'});
    return chrome.tabs.sendMessage(tab.id, {action: 'GET_FIELD_MAP'});
  })()`);
  assert.equal(diagnostic.ok, true);
  assert.equal(JSON.stringify(diagnostic.fields).includes('Example Applicant'), false);
  assert.equal((await evaluate(documents,
    'chrome.runtime.sendMessage({action: "DOC_PREPARE", key: "applicantPhoto"})')).ok, false);

  // Popup should detect the form while it remains the active tab.
  const popup = await target(`${base}popup.html`);
  await waitFor(popup, 'typeof init === "function"');
  const popupTarget = await send('Target.getTargetInfo', {}, form);
  await send('Target.activateTarget', {targetId: popupTarget.targetInfo.targetId});
  await evaluate(popup, 'init()');
  await waitFor(popup, '!document.querySelector("#fillButton").disabled && !document.querySelector("#attachButton").disabled');
  const popupStatus = await evaluate(popup, 'document.querySelector("#documentsStatus").textContent');
  assert.ok(popupStatus.startsWith('5 of 5'));
  console.log('PASS: popup form detection, saved profile/document status, diagnostics');

  // Confirm manual attachment after clearing one input; other files must survive.
  await evaluate(form, 'document.querySelector("#fuPhoto").value = ""');
  await evaluate(popup, 'document.querySelector("#attachButton").click()');
  await waitFor(form, 'document.querySelector("#fuPhoto").files.length === 1');
  await evaluate(form, `(() => {
    window.preservedProof = document.querySelector('#fuDOB').files[0];
    const photo = document.querySelector('#fuPhoto');
    photo.replaceWith(photo.cloneNode());
  })()`);
  await waitFor(form, 'document.querySelector("#fuPhoto").files.length === 1');
  assert.equal(await evaluate(form, 'document.querySelector("#fuDOB").files[0] === window.preservedProof'), true);
  console.log('PASS: dynamically replaced upload controls attach without replacing other selections');

  await send('Page.handleJavaScriptDialog', {accept: true}, documents).catch(() => {});
  listeners.set(`${documents}:Page.javascriptDialogOpening`, () => { void send('Page.handleJavaScriptDialog', {accept: true}, documents); });
  await evaluate(documents, 'document.querySelector("#doc-remove-applicantPhoto").click()');
  await waitFor(documents, 'document.querySelector("#documentCount").textContent.startsWith("4 of 5")');
  await evaluate(documents, 'document.querySelector("#resetDocuments").click()');
  await waitFor(documents, 'document.querySelector("#documentCount").textContent.startsWith("0 of 5")');
  await evaluate(documents, 'document.querySelector("#deleteLegacy").click()');
  await waitFor(documents, 'document.querySelector("#documentFeedback").textContent.includes("Old v1.0.2 document storage cleared")');
  listeners.set(`${options}:Page.javascriptDialogOpening`, () => { void send('Page.handleJavaScriptDialog', {accept: true}, options); });
  await evaluate(options, 'document.querySelector("#clearButton").click()');
  await waitFor(options, 'document.querySelector("#saveStatus").textContent.includes("profile cleared")');
  assert.deepEqual(await evaluate(options, 'chrome.storage.local.get("profile")'), {});
  console.log('PASS: manual attach, individual removal, delete-all, legacy cleanup, profile clearing');
  assert.ok(requests >= 1);
  console.log(`Browser smoke checks passed; ${requests} test-page request(s) fulfilled locally.`);
} finally {
  socket?.close();
  const running = () => browser.exitCode === null && browser.signalCode === null;
  if (running()) {
    const stopped = once(browser, 'exit');
    browser.kill('SIGTERM');
    await Promise.race([stopped, new Promise((done) => setTimeout(done, 3000))]);
    if (running()) { browser.kill('SIGKILL'); await stopped; }
  }
  rmSync(profile, {recursive: true, force: true});
}
