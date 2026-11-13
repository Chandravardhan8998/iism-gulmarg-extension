'use strict';

const SECTIONS = [
  {
    title: 'Course details',
    helper: 'Optional. Enter the displayed option text; the institute may change its course schedules.',
    fields: [
      ['course', 'Select course', 'text', 'e.g. Skiing'],
      ['level', 'Course level', 'text', 'e.g. Basic'],
      ['schedule', 'Schedule of course', 'text', 'Enter exact batch/schedule text'],
      ['state', 'State', 'text', 'e.g. Rajasthan']
    ]
  },
  {
    title: 'Basic details',
    fields: [
      ['name', 'Full name', 'text', 'As written on your documents'],
      ['fatherName', "Father's name", 'text', ''],
      ['nationality', 'Nationality', 'text', 'e.g. Indian'],
      ['dob', 'Date of birth', 'date', ''],
      ['domicile', 'Domicile', 'text', 'If applicable']
    ]
  },
  {
    title: 'Permanent address',
    fields: [
      ['house', 'House no. / Apartment', 'text', ''],
      ['street', 'Street / Village / Colony', 'text', ''],
      ['city', 'District / City', 'text', ''],
      ['pincode', 'PIN code', 'text', '6-digit PIN'],
      ['mobile', 'Mobile number', 'tel', '10-digit mobile number'],
      ['email', 'Email address', 'email', '']
    ]
  },
  {
    title: 'Academic details',
    fields: [
      ['education', 'Education qualification', 'text', 'Match option text on the website'],
      ['employment', 'Current employment', 'text', 'If the form has an editable field']
    ]
  },
  {
    title: 'Identification & fitness',
    fields: [
      ['diet', 'Vegetarian / Non-Vegetarian', 'select', ''],
      ['bloodGroup', 'Blood group', 'text', 'e.g. O+'],
      ['medicalCategory', 'Medical category', 'text', 'If known'],
      ['height', 'Height', 'text', 'Use units requested on website'],
      ['weight', 'Weight', 'text', 'Use units requested on website'],
      ['waist', 'Waist', 'text', 'Use units requested on website'],
      ['shoeSize', 'Shoe size', 'text', 'Use sizing requested on website']
    ]
  },
  {
    title: 'Indemnity / emergency contacts',
    fields: [
      ['emergencyName', 'Emergency contact name', 'text', ''],
      ['emergencyPhone', 'Emergency contact phone', 'tel', '']
    ]
  }
];

const sectionsRoot = document.getElementById('formSections');
const form = document.getElementById('profileForm');
const saveStatus = document.getElementById('saveStatus');
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (ch) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

for (const section of SECTIONS) {
  const sectionElement = document.createElement('section');
  sectionElement.className = 'form-section';
  const fieldsMarkup = section.fields.map(([key, label, type, placeholder]) => {
    const attributes = `id="field_${key}" name="${key}" data-profile-key="${key}"`;
    const control = type === 'select'
      ? `<select ${attributes}><option value="">Choose only if known</option><option value="Vegetarian">Vegetarian</option><option value="Non-Vegetarian">Non-Vegetarian</option></select>`
      : `<input ${attributes} type="${type}" placeholder="${escapeHTML(placeholder)}" autocomplete="off">`;
    return `<div class="profile-field"><label for="field_${key}">${escapeHTML(label)}</label>${control}</div>`;
  }).join('');
  sectionElement.innerHTML = `<div class="section-heading"><h2>${escapeHTML(section.title)}</h2>${section.helper ? `<p>${escapeHTML(section.helper)}</p>` : ''}</div><div class="field-grid">${fieldsMarkup}</div>`;
  sectionsRoot.append(sectionElement);
}

const controls = [...document.querySelectorAll('[data-profile-key]')];

async function loadProfile() {
  const {profile = {}} = await chrome.storage.local.get('profile');
  for (const control of controls) control.value = profile[control.dataset.profileKey] || '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = {};
  for (const control of controls) {
    const value = control.value.trim();
    if (value) profile[control.dataset.profileKey] = value;
  }
  await chrome.storage.local.set({profile});
  saveStatus.textContent = '✓ Saved locally';
  window.setTimeout(() => { saveStatus.textContent = ''; }, 3500);
});

document.getElementById('clearButton').addEventListener('click', async () => {
  if (!window.confirm('Erase your saved IISM admission details from this Chrome profile?')) return;
  await chrome.storage.local.remove('profile');
  form.reset();
  saveStatus.textContent = 'Saved profile cleared';
});

loadProfile().catch(() => { saveStatus.textContent = 'Could not load saved profile'; });

// Documents are deliberately stored separately from the v1.0.1 text profile.
document.getElementById('openDocuments').addEventListener('click', () => {
  void chrome.tabs.create({url: chrome.runtime.getURL('documents.html')});
});
