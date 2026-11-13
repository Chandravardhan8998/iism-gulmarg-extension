const test = require('node:test');
const assert = require('node:assert/strict');
const {control, contentHarness, workerHarness} = require('./helpers.cjs');
const FORM = 'https://admission.iismgulmarg.in/admission_form.aspx';
const sender = () => ({id: 'test-extension', frameId: 0, url: FORM, tab: {id: 7, url: FORM}});

test('content and worker form gates reject other origins, ports and prefixed paths', () => {
  const {api, location} = contentHarness();
  const {api: worker} = workerHarness();
  for (const url of [FORM, `${FORM}?batch=example`,
    'http://admission.iismgulmarg.in/admission_form.aspx',
    'https://admission.iismgulmarg.in:8443/admission_form.aspx',
    'https://example.invalid/admission_form.aspx',
    'https://admission.iismgulmarg.in/other/admission_form.aspx',
    'https://admission.iismgulmarg.in/admission_form.aspx/other']) {
    location.href = url;
    const expected = url === FORM || url === `${FORM}?batch=example`;
    assert.equal(api.isFormPage(), expected, url);
    assert.equal(worker.allowedPage(url), expected, url);
  }
});

test('ambiguous cross-category file inputs are not assigned either document', () => {
  const input = control('fuPhoto', {type: 'file'});
  input.name = 'fuEducation';
  const {api} = contentHarness({inputs: [input]});
  assert.equal(api.matchUploadFields().size, 0);
});

for (const change of ['manual selection', 'disabled', 'detached', 'changed identity']) {
  test(`attachment rechecks a control after transfer: ${change}`, async () => {
    const input = control('fuPhoto', {type: 'file'});
    const selected = new File(['manual'], 'manual.png', {type: 'image/png'});
    const {api} = contentHarness({inputs: [input], keys: ['applicantPhoto'], onMessage(message) {
      if (message.action !== 'DOC_CHUNK') return;
      if (change === 'manual selection') input.files = [selected];
      if (change === 'disabled') input.disabled = true;
      if (change === 'detached') input.isConnected = false;
      if (change === 'changed identity') input.id = 'unknown-upload';
    }});
    assert.equal((await api.attachSavedDocuments()).attached.length, 0);
    assert.equal(input.events.length, 0);
    if (change === 'manual selection') assert.equal(input.files[0], selected);
  });
}

test('worker denies every document operation for unauthorized senders before reading bytes', async () => {
  const {api, reads} = workerHarness();
  const invalid = [
    {...sender(), id: 'other-extension'}, {...sender(), frameId: 1},
    {...sender(), url: 'https://example.invalid/admission_form.aspx'},
    {...sender(), tab: {id: 7, url: 'https://example.invalid/'}},
    {...sender(), url: `${FORM}/other`}, {...sender(), tab: undefined},
    {...sender(), url: 'chrome-extension://test-extension/documents.html'}
  ];
  for (const origin of invalid) {
    for (const action of ['DOC_LIST', 'DOC_PREPARE', 'DOC_CHUNK', 'DOC_RELEASE']) {
      await assert.rejects(api.handle(action, {key: 'applicantPhoto', offset: 0}, origin), /Not permitted|only available/);
    }
  }
  assert.equal(reads(), 0);
});

test('document status is restricted to this extension pages', async () => {
  const {api} = workerHarness();
  const result = await api.handle('DOC_STATUS', {}, {id: 'test-extension', url: 'chrome-extension://test-extension/popup.html'});
  assert.equal(result.count, 1);
  await assert.rejects(api.handle('DOC_STATUS', {}, sender()), /Not permitted/);
  await assert.rejects(api.handle('DOC_STATUS', {}, {id: 'other', url: 'chrome-extension://test-extension/popup.html'}), /Not permitted/);
});

test('chunked transfers retain bytes and enforce ownership, bounds, expiry and release', async () => {
  const {api, bytes, advance} = workerHarness();
  const prepared = await api.handle('DOC_PREPARE', {key: 'applicantPhoto'}, sender());
  assert.equal(prepared.size, bytes.length);
  const first = await api.handle('DOC_CHUNK', {token: prepared.token, offset: 0}, sender());
  const second = await api.handle('DOC_CHUNK', {token: prepared.token, offset: 96 * 1024}, sender());
  assert.deepEqual(Buffer.concat([Buffer.from(first.data, 'base64'), Buffer.from(second.data, 'base64')]), Buffer.from(bytes));
  const otherTab = {...sender(), tab: {id: 8, url: FORM}};
  await assert.rejects(api.handle('DOC_CHUNK', {token: prepared.token, offset: 0}, otherTab), /expired/);
  for (const offset of [-1, 0.5, bytes.length, 'invalid']) {
    await assert.rejects(api.handle('DOC_CHUNK', {token: prepared.token, offset}, sender()), /position/);
  }
  await api.handle('DOC_RELEASE', {token: prepared.token}, otherTab);
  assert.equal((await api.handle('DOC_CHUNK', {token: prepared.token, offset: 0}, sender())).ok, true);
  await api.handle('DOC_RELEASE', {token: prepared.token}, sender());
  await assert.rejects(api.handle('DOC_CHUNK', {token: prepared.token, offset: 0}, sender()), /expired/);
  const expiring = await api.handle('DOC_PREPARE', {key: 'applicantPhoto'}, sender());
  advance(60_001);
  await assert.rejects(api.handle('DOC_CHUNK', {token: expiring.token, offset: 0}, sender()), /expired/);
});
