'use strict';

const SITE_HOST = 'admission.iismgulmarg.in';
const $ = (id) => document.getElementById(id);
const fillButton = $('fillButton');
const editButton = $('editButton');
const diagnosticButton = $('diagnosticButton');
const documentsButton = $('documentsButton');
const attachButton = $('attachButton');
const feedback = $('feedback');
let activeTabId = null;
let validPage = false;
let hasProfile = false;
let savedDocCount = 0;

function message(text, isError = false) {
  feedback.textContent = text;
  feedback.classList.toggle('error', isError);
}

function isAdmissionForm(urlString) {
  try {
    const url = new URL(urlString);
    return url.origin === `https://${SITE_HOST}` &&
      /^\/admission_form\.aspx$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    activeTabId = tab?.id ?? null;
    validPage = isAdmissionForm(tab?.url || '');
    $('siteStatus').textContent = validPage
      ? 'Admission form detected'
      : 'Open the IISM admission form tab first';
    $('statusDot').classList.toggle('ready', validPage);

    const {profile = {}} = await chrome.storage.local.get('profile');
    const savedCount = Object.values(profile).filter((v) =>
      typeof v === 'string' && v.trim().length > 0).length;
    hasProfile = savedCount > 0;
    $('savedStatus').textContent = hasProfile
      ? `${savedCount} profile fields saved on this device.`
      : 'No profile saved yet. Add your details first.';

    try {
      const docState = await chrome.runtime.sendMessage({action: 'DOC_STATUS'});
      if (!docState?.ok) throw new Error(docState?.error || 'Vault not available');
      savedDocCount = docState.count;
      $('documentsStatus').textContent = savedDocCount
        ? `${savedDocCount} of 5 documents saved · Auto-attach enabled`
        : 'No saved documents yet.';
    } catch {
      $('documentsStatus').textContent = 'Document storage unavailable. Text autofill remains available.';
    }
    fillButton.disabled = !(validPage && (hasProfile || savedDocCount));
    attachButton.disabled = !(validPage && savedDocCount);
    diagnosticButton.disabled = !validPage;
  } catch (error) {
    message(`Could not inspect tab: ${error.message}`, true);
    $('siteStatus').textContent = 'Unable to check this tab';
  }
}

fillButton.addEventListener('click', async () => {
  if (!validPage || !(hasProfile || savedDocCount) || activeTabId === null) return;
  fillButton.disabled = true;
  message('Starting autofill on the admission form…');
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, {action: 'START_FILL'});
    if (!result?.ok) throw new Error(result?.error || 'No response from form');
    message('Autofill started. Review text and attached files on the website before submitting. Dropdown changes may refresh the page.');
  } catch (error) {
    message(error.message || 'Cannot reach the form. Refresh the admission page and try again.', true);
  } finally {
    fillButton.disabled = false;
  }
});

editButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

diagnosticButton.addEventListener('click', async () => {
  if (!validPage || activeTabId === null) return;
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, {action: 'GET_FIELD_MAP'});
    if (!response?.ok) throw new Error('Unable to read fields');
    const report = JSON.stringify(response.fields, null, 2);
    await navigator.clipboard.writeText(report);
    message(`Copied ${response.fields.length} field descriptors (no entered values).`);
  } catch (error) {
    message('Could not copy. Refresh the form and try again.', true);
  }
});

init();

documentsButton.addEventListener('click', () => {
  void chrome.tabs.create({url: chrome.runtime.getURL('documents.html')});
});

attachButton.addEventListener('click', async () => {
  if (!validPage || !savedDocCount || activeTabId === null) return;
  attachButton.disabled = true;
  message('Attaching saved documents…');
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, {action: 'START_DOCS'});
    if (!response?.ok) throw new Error(response?.error || 'Cannot reach the admission form');
    message('Document attachment started. Check the admission form before submission.');
  } catch (error) {
    message(error.message || 'Refresh the admission tab and try again.', true);
  } finally { attachButton.disabled = false; }
});
