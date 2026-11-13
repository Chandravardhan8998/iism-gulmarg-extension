const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {source, control, contentHarness} = require('./helpers.cjs');
const harness = (options) => contentHarness({...options, baseline: true});

test('all existing text and dropdown profile fields still match', () => {
  const mapping = {
    course: 'ddlCourse', level: 'ddlLevel', schedule: 'ddlSchedule', state: 'ddlState',
    name: 'txtName', fatherName: 'txtFatherName', nationality: 'txtNationality', dob: 'txtDOB',
    domicile: 'txtDomicile', house: 'txtHouse', street: 'txtStreet', city: 'txtCity',
    pincode: 'txtPinCode', mobile: 'txtMobile', email: 'txtEmail', education: 'ddlQualification',
    employment: 'txtEmployment', diet: 'ddlDiet', bloodGroup: 'ddlBloodGroup',
    medicalCategory: 'txtMedicalCategory', height: 'txtHeight', weight: 'txtWeight',
    waist: 'txtWaist', shoeSize: 'txtShoeSize', emergencyName: 'txtEmergencyName',
    emergencyPhone: 'txtEmergencyPhone'
  };
  const inputs = Object.values(mapping).map((id) => control(id, {tagName: id.startsWith('ddl') ? 'SELECT' : 'INPUT'}));
  const {api} = harness({inputs});
  const matches = api.matchFields();
  for (const [key, id] of Object.entries(mapping)) assert.equal(matches.get(key)?.id, id, key);
});

test('readonly DOB remains fillable; hidden, disabled and other readonly values are protected', () => {
  const dob = control('txtDOB'); dob.readOnly = true;
  const name = control('txtName'); name.readOnly = true;
  const email = control('txtEmail'); email.disabled = true;
  const mobile = control('txtMobile', {hidden: ''});
  const {api} = harness({inputs: [dob, name, email, mobile]});
  assert.equal(api.matchFields().get('dob'), dob);
  assert.equal(api.matchFields().size, 1);
});

test('DOB preserves ISO date controls and existing date-format hints', () => {
  const {api} = harness();
  for (const [attributes, expected] of [
    [{type: 'date'}, '2000-06-15'], [{}, '15/06/2000'],
    [{'data-date-format': 'MM-DD-YYYY'}, '06-15-2000'],
    [{placeholder: 'YYYY/MM/DD'}, '2000/06/15'],
    [{title: 'DD.MM.YY'}, '15.06.00']
  ]) assert.equal(api.dateForControl('2000-06-15', control('txtDOB', attributes)), expected);
});

test('dropdown selection keeps exact/unique partial matching and rejects ambiguous choices', () => {
  const {api} = harness();
  const select = {options: [
    {value: 's', textContent: 'Skiing Basic'},
    {value: 'a', textContent: 'Skiing Advanced'},
    {value: 't', textContent: 'Trekking', disabled: true}
  ]};
  assert.equal(api.getOption(select, 'Skiing Basic').value, 's');
  assert.equal(api.getOption(select, 'Advanced').value, 'a');
  assert.equal(api.getOption(select, 'Skiing'), null);
  assert.equal(api.getOption(select, 'Trekking'), null);
});

test('text filling resumes after dependent dropdown passes and retains pending state until done', async () => {
  const course = control('ddlCourse', {tagName: 'SELECT'});
  course.options = [{value: 'ski', textContent: 'Skiing'}];
  const name = control('txtName');
  const dob = control('txtDOB'); dob.readOnly = true;
  const {api, location, session, timers} = harness({inputs: [course, name, dob],
    profile: {course: 'Skiing', name: 'Example Applicant', dob: '2000-06-15'}});
  location.href = 'https://admission.iismgulmarg.in/admission_form.aspx';
  session.set('iismAutofillPendingV1', JSON.stringify({startedAt: Date.now(), attempts: {}, selected: []}));
  await api.runPendingAutofill();
  assert.equal(course.value, 'ski');
  assert.equal(name.value, '');
  assert.ok(session.has('iismAutofillPendingV1'));
  assert.ok(timers.some((timer) => timer.delay === 1200));
  await api.runPendingAutofill();
  assert.equal(name.value, 'Example Applicant');
  assert.equal(dob.value, '15/06/2000');
  assert.deepEqual(course.events, ['input', 'change']);
  assert.equal(session.has('iismAutofillPendingV1'), false);
});

test('each of the five document types still attaches and releases transfer bytes', async () => {
  const slots = {applicantPhoto: 'fuPhoto', applicantSignature: 'fuSignature',
    educationProof: 'fuGraduation', dobProof: 'fuDOB', guardianSignature: 'fuParentSignature'};
  const inputs = Object.values(slots).map((id) => control(id, {type: 'file'}));
  const {api, messages} = harness({inputs, keys: Object.keys(slots)});
  const result = await api.attachSavedDocuments();
  assert.equal(result.attached.length, 5);
  for (const [index, key] of Object.keys(slots).entries()) {
    assert.equal(inputs[index].files[0].name, `${key}.png`);
    assert.equal(await inputs[index].files[0].text(), 'test');
    assert.deepEqual(inputs[index].events, ['input', 'change']);
  }
  assert.equal(messages.filter((message) => message.action === 'DOC_RELEASE').length, 5);
});

test('label matching, manual selection preservation and website accept rules still work', async () => {
  const input = control('', {type: 'file', label: 'Photo of candidate'});
  const {api} = harness({inputs: [input], keys: ['applicantPhoto']});
  assert.equal(api.matchUploadFields().get('applicantPhoto'), input);
  input.accept = '.pdf';
  assert.equal((await api.attachSavedDocuments()).attached.length, 0);
  input.accept = 'image/*';
  assert.equal((await api.attachSavedDocuments({manual: true})).attached.length, 1);
  const original = input.files[0];
  assert.equal((await api.attachSavedDocuments({manual: true})).skipped.length, 1);
  assert.equal(input.files[0], original);
});

test('unknown uploads and duplicate equally ranked inputs remain unmatched', () => {
  const {api} = harness({inputs: [control('', {type: 'file', label: 'Attach proof'}),
    control('fuPhoto', {type: 'file'}), control('filePhoto', {type: 'file'})]});
  assert.equal(api.matchUploadFields().size, 0);
});

test('automatic retries remain limited while the manual retry path remains available', async () => {
  const input = control('fuPhoto', {type: 'file'});
  const {api} = harness({inputs: [input], keys: ['applicantPhoto']});
  assert.equal((await api.attachSavedDocuments()).attached.length, 1);
  input.files = [];
  assert.equal((await api.attachSavedDocuments()).skipped.length, 1);
  assert.equal((await api.attachSavedDocuments({manual: true})).attached.length, 1);
  for (let i = 0; i < 2; i++) assert.equal(api.mayAutoAttempt('dobProof'), true);
  assert.equal(api.mayAutoAttempt('dobProof'), true);
  assert.equal(api.mayAutoAttempt('dobProof'), false);
});

test('diagnostics continue omitting entered and selected values', () => {
  const input = control('txtName'); input.value = 'PRIVATE SENTINEL';
  const {api} = harness({inputs: [input]});
  const report = JSON.stringify(api.diagnostics());
  assert.ok(report.includes('txtName'));
  assert.equal(report.includes('PRIVATE SENTINEL'), false);
});

test('local document validation keeps five slots, all supported types, and size limits', () => {
  const context = vm.createContext({Blob, Uint8Array});
  vm.runInContext(source('document-store.js', true) + '\nglobalThis.api = IismDocumentStore;', context);
  assert.equal(context.api.SLOTS.length, 5);
  const file = (name, size) => Object.assign(new Blob([new Uint8Array(size)]), {name});
  for (const extension of ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']) {
    context.api.validateFile('educationProof', file(`synthetic.${extension}`, 1));
  }
  for (const extension of ['jpg', 'jpeg', 'png']) {
    context.api.validateFile('applicantPhoto', file(`synthetic.${extension}`, 500 * 1024));
  }
  context.api.validateFile('dobProof', file('synthetic.pdf', 10 * 1024 * 1024));
  assert.throws(() => context.api.validateFile('applicantPhoto', file('synthetic.png', 500 * 1024 + 1)), /exceeds/);
  assert.throws(() => context.api.validateFile('dobProof', file('synthetic.pdf', 10 * 1024 * 1024 + 1)), /exceeds/);
  assert.throws(() => context.api.validateFile('applicantPhoto', file('synthetic.pdf', 1)), /Unsupported/);
  assert.throws(() => context.api.validateFile('dobProof', file('empty.pdf', 0)), /nonempty/);
  assert.throws(() => context.api.validateFile('unknown', file('synthetic.png', 1)), /Unknown/);
});
