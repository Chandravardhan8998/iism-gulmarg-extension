/*
 * IISM Gulmarg admission autofill — Manifest V3 content script.
 * Text autofill is only activated with the Fill button. The five user-selected
 * documents auto-attach on the official admission form when fields appear.
 * No automatic form submission, checkbox agreement, or verification bypass.
 */
(() => {
  'use strict';

  const PENDING_KEY = 'iismAutofillPendingV1';
  const PENDING_MAX_AGE_MS = 90_000;
  const RETRY_DELAY_MS = 1200;
  const MAX_UPDATES_PER_DROPDOWN = 2;
  const FORM_PATH = /^\/admission_form\.aspx$/i;
  const AUTO_GUARD_KEY = 'iismDocsAutoGuardV103';
  const AUTO_WINDOW_MS = 45_000;
  const MAX_AUTO_ATTEMPTS_PER_SLOT = 3;
  const attemptedInputs = new WeakSet();
  let autoScanTimer = null;
  let lastAutoNotice = '';


  const RULES = [
    // Dependent ASP.NET dropdowns: fill first, so server postbacks happen before text filling.
    {key: 'course', kind: 'select', ids: ['ddlCourse', 'ddlSelectCourse', 'ddlCourseName', 'drpCourse', 'drpCourseName'], labels: ['Select Course', 'Course']},
    {key: 'level', kind: 'select', ids: ['ddlCourseLevel', 'ddlLevel', 'drpCourseLevel', 'ddlLevelOfCourse'], labels: ['Course Level', 'Level of Course']},
    {key: 'schedule', kind: 'select', ids: ['ddlSchedule', 'ddlCourseSchedule', 'ddlBatch', 'ddlCourseDate', 'ddlScheduleOfCourse'], labels: ['Schedule of Course', 'Course Schedule', 'Batch', 'Course Batch']},
    {key: 'state', kind: 'select', ids: ['ddlState', 'drpState', 'ddlStates'], labels: ['State', 'Select State']},

    {key: 'name', kind: 'text', ids: ['txtName', 'txtApplicantName', 'txtCandidateName', 'txtFullName', 'txtStudentName'], labels: ['Name', 'Applicant Name', 'Name of Applicant', 'Full Name', 'Candidate Name'], exclude: ['father', 'emergency', 'guardian', 'parent', 'contact']},
    {key: 'fatherName', kind: 'text', ids: ['txtFatherName', 'txtFathersName', 'txtFather', 'txtFather_Name'], labels: ["Father's Name", 'Fathers Name', 'Father Name', 'Name of Father']},
    {key: 'nationality', kind: 'text', ids: ['txtNationality', 'txtNation'], labels: ['Nationality']},
    {key: 'dob', kind: 'text', ids: ['txtDOB', 'txtDateOfBirth', 'txtBirthDate', 'dob', 'datepickerDOB'], labels: ['Date of Birth', 'DOB']},
    {key: 'domicile', kind: 'text', ids: ['txtDomicile', 'txtDomicileState'], labels: ['Domicile']},

    {key: 'house', kind: 'text', ids: ['txtHouse', 'txtHouseNo', 'txtHouseNumber', 'txtApartment', 'txtAddress1'], labels: ['House No/Apartment', 'House Number', 'House No', 'House/Apartment']},
    {key: 'street', kind: 'text', ids: ['txtStreet', 'txtVillage', 'txtColony', 'txtAddress2', 'txtStreetVillageColony'], labels: ['Street/Village/Colony', 'Street Village Colony', 'Street', 'Village/Colony']},
    {key: 'city', kind: 'text', ids: ['txtDistrict', 'txtCity', 'txtDistrictCity', 'txtDistrict_City'], labels: ['District/City', 'District', 'City']},
    {key: 'pincode', kind: 'text', ids: ['txtPinCode', 'txtPIN', 'txtZip', 'txtPostalCode', 'txtPincode'], labels: ['PIN Code', 'PIN code', 'Postal Code']},
    {key: 'mobile', kind: 'text', ids: ['txtMobile', 'txtMobileNo', 'txtMobileNumber', 'txtMobNo', 'txtPhone'], labels: ['Mobile No', 'Mobile Number', 'Mobile'], exclude: ['emergency', 'contact', 'guardian', 'parent']},
    {key: 'email', kind: 'text', ids: ['txtEmail', 'txtEmailId', 'txtEMail', 'txtEmailAddress'], labels: ['Email Id', 'Email ID', 'Email Address', 'Email']},

    {key: 'education', kind: 'any', ids: ['ddlQualification', 'ddlEducation', 'ddlEducationalQualification', 'ddlEducationQualification', 'drpEducation', 'txtQualification'], labels: ['Education Qualification', 'Educational Qualification', 'Qualification']},
    {key: 'employment', kind: 'text', ids: ['txtEmployment', 'txtCurrentEmployment', 'txtOccupation', 'txtProfession'], labels: ['Current Employment', 'Occupation', 'Employment']},
    {key: 'diet', kind: 'any', ids: ['ddlFood', 'ddlDiet', 'ddlVegNonVeg', 'ddlFoodPreference', 'ddlVegetarian', 'drpDiet'], labels: ['Vegetarian / Non-Vegetarian', 'Vegetarian/Non-Vegetarian', 'Food Preference', 'Diet']},
    {key: 'bloodGroup', kind: 'any', ids: ['txtBloodGroup', 'ddlBloodGroup', 'txtBlood', 'ddlBlood'], labels: ['Blood Group']},
    {key: 'medicalCategory', kind: 'text', ids: ['txtMedicalCategory', 'txtMedical', 'ddlMedicalCategory'], labels: ['Medical Category']},
    {key: 'height', kind: 'text', ids: ['txtHeight'], labels: ['Height']},
    {key: 'weight', kind: 'text', ids: ['txtWeight'], labels: ['Weight']},
    {key: 'waist', kind: 'text', ids: ['txtWaist', 'txtWaistSize'], labels: ['Waist', 'Waist Size']},
    {key: 'shoeSize', kind: 'text', ids: ['txtShoeSize', 'txtShoesSize'], labels: ['Shoe Size', 'Shoes Size']},

    {key: 'emergencyName', kind: 'text', ids: ['txtEmergencyContactName', 'txtEmergencyName', 'txtEmgName', 'txtEmergencyPersonName'], labels: ['Emergency Contact Name', 'Emergency Name']},
    {key: 'emergencyPhone', kind: 'text', ids: ['txtEmergencyContactPhone', 'txtEmergencyPhone', 'txtEmergencyMobile', 'txtEmergencyContactNumber', 'txtEmgPhone'], labels: ['Emergency Contact Phone', 'Emergency Phone', 'Emergency Contact Number', 'Emergency Mobile']}
  ];

  const SELECT_ORDER = ['course', 'level', 'schedule', 'state', 'education', 'diet', 'bloodGroup'];
  const norm = (value) => String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const isFormPage = () => FORM_PATH.test(window.location.pathname) &&
    window.location.origin === 'https://admission.iismgulmarg.in';
  let isBusy = false;

  function isWritable(el) {
    // Date picker inputs are often readonly: include them as candidates, but
    // ruleAllows() permits filling readonly controls ONLY for DOB.
    if (!el || el.disabled || el.hasAttribute('hidden')) return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'file', 'button', 'image', 'reset', 'submit', 'checkbox', 'radio', 'password'].includes(type)) return false;
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      el.getClientRects().length > 0;
  }

  function pushSignal(signals, value, strength) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/\s*\*+\s*$/, '').trim();
    if (text && text.length <= 140 && !signals.some((s) => s.text === text)) {
      signals.push({text, strength});
    }
  }

  function getSignals(el) {
    const signals = [];
    if (el.labels) for (const label of el.labels) pushSignal(signals, label.textContent, 120);
    pushSignal(signals, el.getAttribute('aria-label'), 120);
    pushSignal(signals, el.getAttribute('placeholder'), 95);
    pushSignal(signals, el.getAttribute('title'), 82);

    const tableCell = el.closest('td,th');
    const row = el.closest('tr');
    if (tableCell && row) {
      const cells = Array.from(row.querySelectorAll(':scope > td, :scope > th'));
      const cellIndex = cells.indexOf(tableCell);
      if (cellIndex > 0) {
        for (let i = cellIndex - 1; i >= Math.max(0, cellIndex - 2); i--) {
          const cell = cells[i];
          const label = cell.querySelector('label, .control-label, .form-label');
          pushSignal(signals, label?.textContent || cell.textContent, 111);
        }
      }
    }

    for (let node = el, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
      const prev = node.previousElementSibling;
      if (prev && !prev.querySelector('input,select,textarea')) {
        const label = prev.matches('label,span,strong,b') ? prev : prev.querySelector('label,.form-label,.control-label');
        pushSignal(signals, label?.textContent || (prev.textContent?.length < 60 ? prev.textContent : ''), 96 - depth * 5);
      }
      const parent = node.parentElement;
      if (!parent) continue;
      const fields = parent.querySelectorAll('input:not([type="hidden"]),select,textarea');
      if (fields.length > 2) continue;
      for (const label of parent.querySelectorAll('label,.form-label,.control-label')) {
        pushSignal(signals, label.textContent, 100 - depth * 5);
      }
      if (fields.length === 1 && parent.textContent.trim().length < 85) {
        pushSignal(signals, parent.textContent, 88 - depth * 5);
      }
    }
    return signals;
  }

  function ruleAllows(rule, el) {
    // Never overwrite other read-only form values (e.g. course fees).
    // The DOB calendar can expose a readonly text input that can still be
    // safely populated programmatically and validated by the website.
    if (el.readOnly && (rule.key !== 'dob' || el.tagName !== 'INPUT')) return false;
    if (rule.kind === 'select') return el.tagName === 'SELECT';
    if (rule.kind === 'text') return el.tagName !== 'SELECT';
    return true;
  }

  function scoreControl(rule, el, signals) {
    if (!ruleAllows(rule, el)) return 0;
    const id = norm(el.id);
    const name = norm(el.getAttribute('name'));
    const surroundingText = [id, name, ...signals.map((s) => norm(s.text))];
    if (rule.exclude?.some((word) => surroundingText.some((s) => s.includes(norm(word))))) {
      return 0;
    }

    let best = 0;
    for (const alias of rule.ids) {
      const a = norm(alias);
      if (id === a || name === a) best = Math.max(best, 160);
      else if (a.length >= 6 && (id.endsWith(a) || name.endsWith(a))) best = Math.max(best, 150);
      else if (a.length >= 10 && (id.includes(a) || name.includes(a))) best = Math.max(best, 120);
    }
    for (const signal of signals) {
      const s = norm(signal.text);
      for (const label of rule.labels) {
        const l = norm(label);
        if (s === l) best = Math.max(best, signal.strength + 4);
        else if (l.length >= 10 && s.startsWith(l) && s.length <= l.length + 13) {
          best = Math.max(best, signal.strength - 23);
        }
      }
    }
    return best;
  }

  function matchFields() {
    const elements = Array.from(document.querySelectorAll('input,select,textarea')).filter(isWritable);
    const signals = new Map(elements.map((el) => [el, getSignals(el)]));
    const ranked = [];
    for (const rule of RULES) {
      for (const el of elements) {
        const score = scoreControl(rule, el, signals.get(el));
        if (score >= 88) ranked.push({key: rule.key, el, score});
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    const matched = new Map();
    const used = new Set();
    for (const match of ranked) {
      if (matched.has(match.key) || used.has(match.el)) continue;
      matched.set(match.key, match.el);
      used.add(match.el);
    }
    return matched;
  }

  function getOption(select, requestedValue) {
    const q = norm(requestedValue);
    if (!q) return null;
    const options = [...select.options].filter((option) => !option.disabled &&
      (option.value.trim() || option.textContent.trim()));
    let matches = options.filter((option) => norm(option.textContent) === q || norm(option.value) === q);
    if (matches.length === 1) return matches[0];
    matches = options.filter((option) => q.length >= 4 &&
      (norm(option.textContent).includes(q) || q.includes(norm(option.textContent)) && norm(option.textContent).length >= 4));
    return matches.length === 1 ? matches[0] : null;
  }

  function setElementValue(el, value) {
    const base = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
      el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(base, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }

  function dateForControl(isoValue, el) {
    // HTML date inputs must receive ISO dates, regardless of display locale.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) return isoValue;
    if ((el.getAttribute('type') || '').toLowerCase() === 'date') return isoValue;
    const [year, month, day] = isoValue.split('-');
    // Date-picker libraries use different separators and date orders; honor
    // explicit hints before falling back to India's common DD/MM/YYYY order.
    const hints = [
      el.getAttribute('data-date-format'), el.getAttribute('data-dateformat'),
      el.getAttribute('data-format'), el.getAttribute('data-inputmask'),
      el.getAttribute('pattern'), el.getAttribute('placeholder'),
      el.getAttribute('title')
    ].filter(Boolean);
    for (const hint of hints) {
      // Recognizes DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.
      // Works with short tokens (d/m/Y), too.
      const found = String(hint).match(/(?:d{1,2}|m{1,2}|y{2,4})([./-])(?:d{1,2}|m{1,2}|y{2,4})\1(?:d{1,2}|m{1,2}|y{2,4})/i);
      if (!found) continue;
      const separator = found[1];
      const tokens = found[0].toLowerCase().split(separator);
      if (new Set(tokens.map((token) => token[0])).size !== 3) continue;
      const dateParts = {d: day, m: month, y: year};
      return tokens.map((token) => token[0] === 'y' && token.length === 2
        ? year.slice(-2) : dateParts[token[0]]).join(separator);
    }
    return `${day}/${month}/${year}`;
  }

  function loadPending() {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state.startedAt || Date.now() - state.startedAt > PENDING_MAX_AGE_MS) {
        sessionStorage.removeItem(PENDING_KEY);
        return null;
      }
      return state;
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
  }

  function storePending(state) {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(state));
  }

  function notify(text) {
    const existing = document.getElementById('iism-autofill-notification');
    existing?.remove();
    const container = document.createElement('div');
    container.id = 'iism-autofill-notification';
    container.setAttribute('role', 'status');
    container.style.cssText = [
      'position:fixed','top:20px','right:20px','z-index:2147483647',
      'max-width:360px','padding:16px 38px 16px 16px',
      'border:1px solid #cce4df','border-radius:12px',
      'background:#fff','color:#173e3b','box-shadow:0 12px 40px #0002',
      'font:13px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
      'white-space:pre-line'
    ].join(';');
    const content = document.createElement('div');
    content.textContent = text;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss autofill notice');
    dismiss.textContent = '×';
    dismiss.style.cssText = 'position:absolute;top:4px;right:10px;padding:2px 5px;border:0;background:transparent;color:#53706b;font-size:22px;cursor:pointer';
    dismiss.addEventListener('click', () => container.remove());
    container.append(content, dismiss);
    (document.body || document.documentElement).append(container);
    setTimeout(() => container.remove(), 16000);
  }

  // Only specific, unambiguous upload fields are filled. Generic "Attach proof"
  // controls are not guessed: placing the wrong personal document is worse
  // than leaving a file input for manual completion.
  const UPLOAD_RULES = [
    {key: 'applicantPhoto', ids: ['fuPhoto', 'filePhoto', 'fuApplicantPhoto', 'fuCandidatePhoto', 'fuPicture', 'fileApplicantPhoto', 'photoOfApplicant', 'photoOfCandidate'],
      labels: ['photo of candidate', 'candidate photo', 'photo of applicant', 'applicant photo', 'applicant photograph', 'passport size photograph'],
      exclude: ['signature', 'guardian', 'parent']},
    {key: 'applicantSignature', ids: ['fuSignature', 'fuApplicantSignature', 'fuCandidateSignature', 'fileApplicantSignature', 'applicantSign', 'fileSignature', 'photoOfSignature'],
      labels: ['photo of signature', 'candidate signature', 'signature of candidate', 'signature of applicant', 'applicant signature', 'candidate sign'],
      exclude: ['parent', 'guardian']},
    {key: 'educationProof', ids: ['fuGraduation', 'fuThirdYear', 'fu3rdYear', 'fileGraduation', 'fileGraduationMarksheet', 'fuQualification', 'fuEducation', 'fileQualification', 'fileEducation', 'qualificationProof', 'educationProof'],
      labels: ['graduation 3rd yr marksheet', 'graduation 3rd year marksheet', 'graduation third year marksheet', 'graduation final year marksheet', 'third year marksheet', '3rd year marksheet', 'graduation marksheet', 'education qualification proof', 'educational qualification proof', 'education qualification', 'qualification attach proof'],
      exclude: ['date of birth', '10th marksheet', 'tenth marksheet', 'class 10']},
    {key: 'dobProof', ids: ['fuDOB', 'fileDOB', 'fuBirth', 'fuDateOfBirth', 'fileUploadDOB', 'fudobproof', 'dobcertificate', 'file10thMarksheet', 'fu10thMarksheet'],
      labels: ['dob 10th marksheet', 'date of birth proof', 'dob proof', 'birth certificate', '10th marksheet', '10th mark sheet', 'class 10 marksheet', 'date of birth'],
      exclude: ['graduation', '3rd year', 'third year']},
    {key: 'guardianSignature', ids: ['fuParentSignature', 'fuGuardianSignature', 'fileGuardianSignature', 'parentSign', 'guardianSign', 'photoOfParentSignature'],
      labels: ['parent signature', 'parent photo of signature', 'parent guardian signature', 'guardian signature', 'parents signature', 'signature of parent', 'signature of guardian'],
      exclude: ['applicant signature', 'candidate signature']}
  ];

  function uploadSignals(el) {
    const signals = getSignals(el);
    let node = el.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const fileCount = node.querySelectorAll('input[type="file"]').length;
      if (fileCount > 1) break;
      const text = node.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (text.length >= 6 && text.length < 140) pushSignal(signals, text, 95 - depth * 6);
    }
    return signals;
  }

  function uploadScore(rule, el, signals) {
    const identifier = [el.id, el.name].map(norm);
    const texts = [...identifier, ...signals.map((signal) => norm(signal.text))];
    if (rule.exclude?.some((word) => texts.some((value) => value.includes(norm(word))))) return 0;
    let score = 0;
    for (const alias of rule.ids) {
      const a = norm(alias);
      if (identifier.some((id) => id === a || id.endsWith(a))) score = Math.max(score, 170);
      else if (a.length >= 6 && identifier.some((id) => id.includes(a))) score = Math.max(score, 138);
    }
    for (const signal of signals) {
      const s = norm(signal.text);
      for (const label of rule.labels) {
        const l = norm(label);
        if (s === l) score = Math.max(score, signal.strength + 10);
        else if (l.length >= 8 && s.includes(l) && s.length <= l.length + 36) {
          score = Math.max(score, signal.strength + 2);
        }
      }
    }
    return score;
  }

  function matchUploadFields() {
    const inputs = [...document.querySelectorAll('input[type="file"]')]
      .filter((el) => !el.disabled && !el.hasAttribute('hidden'));
    const scored = [];
    for (const rule of UPLOAD_RULES) {
      for (const input of inputs) {
        const score = uploadScore(rule, input, uploadSignals(input));
        if (score >= 98) scored.push({key: rule.key, input, score});
      }
    }
    const candidates = new Map();
    for (const rule of UPLOAD_RULES) {
      const options = scored.filter((x) => x.key === rule.key).sort((a, b) => b.score - a.score);
      if (options[0] && (!options[1] || options[0].score - options[1].score >= 12)) {
        candidates.set(rule.key, options[0]);
      }
    }
    const winners = [...candidates.values()].sort((a, b) => b.score - a.score);
    const matched = new Map();
    const used = new Set();
    for (const winner of winners) {
      if (used.has(winner.input)) continue;
      // A single input must also have a clear winner across document types.
      // Otherwise a mixed label/identifier could expose the wrong document.
      const rivals = scored.filter((candidate) => candidate.input === winner.input && candidate.key !== winner.key);
      if (rivals.some((candidate) => winner.score - candidate.score < 12)) continue;
      matched.set(winner.key, winner.input);
      used.add(winner.input);
    }
    return matched;
  }

  function siteAcceptsFile(input, file) {
    const accept = (input.accept || '').trim();
    if (!accept) return true;
    const filename = file.name.toLowerCase();
    const mime = (file.type || '').toLowerCase();
    return accept.toLowerCase().split(',').map((item) => item.trim()).some((item) =>
      item.startsWith('.') ? filename.endsWith(item) :
        item.endsWith('/*') ? mime.startsWith(item.slice(0, -1)) :
          mime === item);
  }

  async function transferSavedFile(key) {
    const prepared = await chrome.runtime.sendMessage({action: 'DOC_PREPARE', key});
    if (!prepared?.ok) throw new Error(prepared?.error || 'Cannot read saved document');
    try {
      const bytes = new Uint8Array(prepared.size);
      let offset = 0;
      while (offset < bytes.length) {
        const chunk = await chrome.runtime.sendMessage({action: 'DOC_CHUNK', token: prepared.token, offset});
        if (!chunk?.ok) throw new Error(chunk?.error || 'Document transfer failed');
        const binary = atob(chunk.data || '');
        if (!binary.length || offset + binary.length > bytes.length) throw new Error('Invalid document chunk');
        for (let i = 0; i < binary.length; i++) bytes[offset + i] = binary.charCodeAt(i);
        offset += binary.length;
      }
      return new File([bytes], prepared.name, {
        type: prepared.type || 'application/octet-stream', lastModified: prepared.lastModified || Date.now()
      });
    } finally {
      await chrome.runtime.sendMessage({action: 'DOC_RELEASE', token: prepared.token}).catch(() => {});
    }
  }

  function mayAutoAttempt(key) {
    // Controls that cause a server postback can repeatedly reload the page.
    // A per-tab, rolling 45-second guard prevents infinite attachment loops.
    try {
      const now = Date.now();
      const existing = JSON.parse(sessionStorage.getItem(AUTO_GUARD_KEY) || 'null');
      const record = existing && now - existing.startedAt < AUTO_WINDOW_MS
        ? existing : {startedAt: now, counts: {}};
      if ((record.counts[key] || 0) >= MAX_AUTO_ATTEMPTS_PER_SLOT) return false;
      record.counts[key] = (record.counts[key] || 0) + 1;
      sessionStorage.setItem(AUTO_GUARD_KEY, JSON.stringify(record));
    } catch {
      // WeakSet below still prevents repeated events within this document.
    }
    return true;
  }

  async function attachSavedDocuments({manual = false} = {}) {
    const attached = [], review = [], skipped = [];
    const list = await chrome.runtime.sendMessage({action: 'DOC_LIST'});
    if (!list?.ok) return {attached, review, skipped, message: list?.error || 'Saved documents unavailable.'};
    if (!list.keys?.length) return {attached, review, skipped, message: ''};
    const matched = matchUploadFields();
    for (const key of list.keys) {
      const input = matched.get(key);
      if (!input || !input.isConnected) { review.push(key); continue; }
      if (input.files?.length) { skipped.push(key); continue; } // Do not override a manual selection.
      if (!manual && attemptedInputs.has(input)) { skipped.push(key); continue; }
      try {
        const file = await transferSavedFile(key);
        // Reading file chunks is asynchronous. A person or page script may
        // have changed this control while the saved file was being read.
        if (!input.isConnected || input.disabled || input.files?.length) { skipped.push(key); continue; }
        if (matchUploadFields().get(key) !== input) { review.push(key); continue; }
        if (!siteAcceptsFile(input, file)) { review.push(`${key} (website file type restriction)`); continue; }
        if (!manual && !mayAutoAttempt(key)) { review.push(`${key} (automatic retry limit reached)`); continue; }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        // Remember the attempt before change events; they may trigger a postback.
        attemptedInputs.add(input);
        input.files = transfer.files;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        if (input.files?.length === 1 && input.files[0].name === file.name) attached.push(key);
        else review.push(key);
      } catch (error) {
        review.push(`${key} (${error.message})`);
      }
    }
    return {attached, review, skipped, message: ''};
  }

  function scheduleAutoDocsScan(delay = 500) {
    if (!isFormPage()) return;
    if (autoScanTimer !== null) clearTimeout(autoScanTimer);
    autoScanTimer = setTimeout(() => {
      autoScanTimer = null;
      void autoAttachDocuments();
    }, delay);
  }

  async function autoAttachDocuments() {
    if (isBusy || loadPending()) return; // Let pending text autofill finish first.
    if (!document.querySelector('input[type="file"]')) return;
    isBusy = true;
    try {
      const result = await attachSavedDocuments();
      if (result.attached.length) {
        const text = `IISM: Automatically attached ${result.attached.length} saved document(s). ` +
          `Review the chosen files and submit the application yourself.`;
        if (text !== lastAutoNotice) { notify(text); lastAutoNotice = text; }
      } else if (result.review.some((item) => item.includes('restriction') || item.includes('limit'))) {
        const text = 'IISM: Some saved documents could not be attached automatically. Check file restrictions and attach remaining files manually.';
        if (text !== lastAutoNotice) { notify(text); lastAutoNotice = text; }
      }
    } catch (error) {
      // The manual retry button remains available; avoid noisy popups on every DOM mutation.
      console.warn('IISM document auto-attach could not complete:', error);
    } finally {
      isBusy = false;
    }
  }

  async function runDocumentsOnly() {
    if (isBusy || !isFormPage()) return;
    isBusy = true;
    try {
      const result = await attachSavedDocuments({manual: true});
      const status = `${result.attached.length} document(s) attached to upload fields.`;
      const caution = result.review.length ? `Complete manually: ${result.review.join(', ')}.\n` : '';
      notify(`IISM documents: ${status}\n${caution}${result.message ? `${result.message}\n` : ''}Review the attached file names before submitting.`);
    } catch (error) {
      notify(`Document attachment failed: ${error.message}. Attach remaining files manually.`);
    } finally {
      isBusy = false;
    }
  }


  async function runPendingAutofill() {
    if (isBusy || !isFormPage()) return;
    let state = loadPending();
    if (!state) return;
    isBusy = true;
    try {
      const {profile = {}} = await chrome.storage.local.get('profile');
      state = loadPending(); // Might have been cleared while we awaited storage.
      if (!state) return;
      if (!Object.values(profile).some((v) => typeof v === 'string' && v.trim())) {
        const docs = await chrome.runtime.sendMessage({action: 'DOC_LIST'}).catch(() => null);
        if (!docs?.ok || !docs.keys?.length) {
          sessionStorage.removeItem(PENDING_KEY);
          notify(docs?.error || 'No saved profile or documents. Open the extension to add your details.');
          return;
        }
      }
      const matched = matchFields();

      // Set one dropdown per pass. If a dropdown triggers an ASP.NET postback,
      // sessionStorage survives page reload and the content script resumes.
      for (const key of SELECT_ORDER) {
        const desired = String(profile[key] || '').trim();
        const el = matched.get(key);
        if (!desired || !el || el.tagName !== 'SELECT') continue;
        const option = getOption(el, desired);
        if (!option || el.value === option.value) continue;
        if ((state.attempts?.[key] || 0) >= MAX_UPDATES_PER_DROPDOWN) continue;

        state.attempts = {...state.attempts, [key]: (state.attempts?.[key] || 0) + 1};
        state.selected = Array.from(new Set([...(state.selected || []), key]));
        storePending(state); // Must happen BEFORE onchange potentially reloads the page.
        setElementValue(el, option.value);
        setTimeout(() => { runPendingAutofill(); }, RETRY_DELAY_MS);
        return;
      }

      const filled = [];
      const review = [];
      for (const rule of RULES) {
        const value = String(profile[rule.key] || '').trim();
        if (!value) continue;
        const el = matched.get(rule.key);
        if (!el) {
          review.push(rule.key);
          continue;
        }
        if (el.tagName === 'SELECT') {
          const option = getOption(el, value);
          if (!option || el.value !== option.value) review.push(rule.key);
          continue;
        }
        const formatted = rule.key === 'dob' ? dateForControl(value, el) : value;
        if (el.value !== formatted) setElementValue(el, formatted);
        if (el.value === formatted) filled.push(rule.key);
        else review.push(rule.key);
      }

      const documents = await attachSavedDocuments({manual: true});
      sessionStorage.removeItem(PENDING_KEY);
      const selectedCount = (state.selected || []).length;
      const heading = `IISM Autofill: ${filled.length} text fields filled, ${selectedCount} dropdown selections applied, ${documents.attached.length} documents attached.`;
      const caution = review.length
        ? `Check text fields manually: ${review.join(', ')}.\n`
        : '';
      const documentReview = documents.review.length
        ? `Attach/check manually: ${documents.review.join(', ')}.\n` : '';
      const skipped = documents.skipped.length
        ? `Previously selected/attempted uploads: ${documents.skipped.join(', ')}.\n` : '';
      notify(`${heading}\n${caution}${documentReview}${skipped}${documents.message ? `${documents.message}\n` : ''}Verify all file selections and submit manually.`);
    } catch (error) {
      sessionStorage.removeItem(PENDING_KEY);
      notify(`Autofill stopped: ${error.message}. Please fill any remaining fields manually.`);
    } finally {
      isBusy = false;
      scheduleAutoDocsScan(850);
    }
  }

  function diagnostics() {
    return [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => el.getAttribute('type') !== 'hidden')
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        id: el.id || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        readOnly: Boolean(el.readOnly),
        dateFormatHint: el.getAttribute('data-date-format') || el.getAttribute('data-dateformat') || el.getAttribute('data-format') || '',
        labelHints: getSignals(el).slice(0, 4).map((s) => s.text),
        optionLabels: el.tagName === 'SELECT' ? [...el.options].map((option) => option.textContent.trim()).slice(0, 80) : []
        // Intentionally no input values or selected values.
      }));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'START_FILL') {
      if (!isFormPage()) {
        sendResponse({ok: false, error: 'Not on admission form'});
        return;
      }
      storePending({startedAt: Date.now(), attempts: {}, selected: []});
      sendResponse({ok: true});
      void runPendingAutofill();
    } else if (message?.action === 'START_DOCS') {
      if (!isFormPage()) { sendResponse({ok: false, error: 'Not on admission form'}); return; }
      sendResponse({ok: true});
      void runDocumentsOnly();
    } else if (message?.action === 'GET_FIELD_MAP') {
      sendResponse({ok: true, fields: diagnostics()});
    }
  });

  // Text autofill resumes only after the user clicked Fill (original v1.0.1 behavior).
  if (isFormPage() && loadPending()) {
    setTimeout(() => { void runPendingAutofill(); }, 450);
  }

  // Documents are different: these five explicit user-selected files attach
  // automatically as soon as matching controls appear on the official form.
  if (isFormPage()) {
    scheduleAutoDocsScan(750);
    setTimeout(() => scheduleAutoDocsScan(150), 1800);
    setTimeout(() => scheduleAutoDocsScan(150), 4300);

    function newFileControl(node) {
      return node?.nodeType === 1 &&
        (node.matches?.('input[type="file"]') || node.querySelector?.('input[type="file"]'));
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if ((mutation.type === 'attributes' && mutation.target.matches?.('input[type="file"]')) ||
            (mutation.type === 'childList' && [...mutation.addedNodes].some(newFileControl))) {
          scheduleAutoDocsScan(450);
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'disabled']
    });
    document.addEventListener('change', (event) => {
      if (event.target?.tagName === 'SELECT') scheduleAutoDocsScan(900);
    }, true);
  }
})();
