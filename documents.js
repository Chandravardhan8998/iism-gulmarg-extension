'use strict';
const $ = (id) => document.getElementById(id);
const fileAccept = {proof: '.pdf,.jpg,.jpeg,.png,.doc,.docx', image: '.jpg,.jpeg,.png'};
let busy = false;
let previewUrl = null;

function feedback(text, error = false) {
  $('documentFeedback').textContent = text;
  $('documentFeedback').classList.toggle('error', error);
}

function renderRows() {
  const root = $('documentList');
  root.replaceChildren();
  for (const slot of IismDocumentStore.SLOTS) {
    const row = document.createElement('div');
    row.className = 'document-row';
    row.dataset.slot = slot.key;
    const detail = document.createElement('div');
    detail.className = 'document-row-details';
    const heading = document.createElement('h3');
    heading.textContent = slot.title;
    const description = document.createElement('p');
    description.textContent = slot.detail;
    const status = document.createElement('span');
    status.id = `doc-status-${slot.key}`;
    status.className = 'document-status';
    status.textContent = 'No file selected';
    detail.append(heading, description, status);
    const controls = document.createElement('div');
    controls.className = 'document-controls';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = fileAccept[slot.kind];
    picker.id = `doc-input-${slot.key}`;
    picker.setAttribute('aria-label', `Choose ${slot.title}`);
    picker.addEventListener('change', () => { void saveSelected(slot.key, picker); });
    const preview = document.createElement('button');
    preview.id = `doc-preview-${slot.key}`;
    preview.type = 'button';
    preview.className = 'text-button';
    preview.textContent = 'Preview';
    preview.addEventListener('click', () => { void previewSaved(slot.key); });
    const remove = document.createElement('button');
    remove.id = `doc-remove-${slot.key}`;
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => { void removeSaved(slot.key); });
    controls.append(picker, preview, remove);
    row.append(detail, controls);
    root.append(row);
  }
}

async function syncUi() {
  const saved = await IismDocumentStore.listDocuments();
  const byKey = new Map(saved.map((doc) => [doc.key, doc]));
  $('documentCount').textContent = `${saved.length} of ${IismDocumentStore.SLOTS.length} files saved · Automatic upload enabled`;
  for (const slot of IismDocumentStore.SLOTS) {
    const doc = byKey.get(slot.key);
    $(`doc-status-${slot.key}`).textContent = doc ? `${doc.name} · ${Math.ceil(doc.size / 1024)} KB · Saved locally` : 'No file selected';
    $(`doc-remove-${slot.key}`).hidden = !doc;
    $(`doc-preview-${slot.key}`).hidden = !doc;
    $(`doc-remove-${slot.key}`).disabled = busy;
    $(`doc-preview-${slot.key}`).disabled = busy;
    $(`doc-input-${slot.key}`).disabled = busy;
  }
}

async function runBusy(action) {
  if (busy) return;
  busy = true;
  try { await action(); }
  catch (error) { feedback(error.message || 'Operation failed.', true); }
  finally {
    busy = false;
    try { await syncUi(); } catch (error) { feedback(error.message || 'Cannot load saved documents.', true); }
  }
}

function clearPreview() {
  $('previewBody').replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

async function previewSaved(key) {
  try {
    const {meta, bytes} = await IismDocumentStore.readDocument(key);
    clearPreview();
    $('previewTitle').textContent = meta.name;
    const extension = meta.name.split('.').pop().toLowerCase();
    const mime = extension === 'png' ? 'image/png' : ['jpg','jpeg'].includes(extension) ? 'image/jpeg' : extension === 'pdf' ? 'application/pdf' : '';
    if (mime) {
      previewUrl = URL.createObjectURL(new Blob([bytes], {type: mime}));
      const el = document.createElement(mime.startsWith('image/') ? 'img' : 'iframe');
      el.src = previewUrl;
      el.title = 'Saved document preview';
      if (el.tagName === 'IMG') el.alt = meta.name;
      $('previewBody').append(el);
    } else {
      const note = document.createElement('p');
      note.textContent = 'Preview is available for JPG, PNG and PDF files only. This file is still saved for autofill.';
      $('previewBody').append(note);
    }
    $('previewDialog').showModal();
  } catch (error) { feedback(error.message || 'Preview failed.', true); }
}

async function saveSelected(key, picker) {
  const file = picker.files?.[0];
  if (!file) return;
  await runBusy(async () => {
    await IismDocumentStore.saveDocument(key, file);
    feedback(`${file.name} saved. It will be attached automatically when its field is found on the IISM form.`);
  });
  picker.value = '';
}

async function removeSaved(key) {
  if (!confirm('Remove this saved file?')) return;
  await runBusy(async () => {
    await IismDocumentStore.deleteDocument(key);
    feedback('Saved file removed.');
  });
}

$('closePreview').addEventListener('click', () => $('previewDialog').close());
$('previewDialog').addEventListener('close', clearPreview);
$('resetDocuments').addEventListener('click', () => {
  if (!confirm('Permanently remove all five stored documents? Your text profile will remain unchanged.')) return;
  void runBusy(async () => {
    await IismDocumentStore.resetDocuments();
    feedback('All five document slots cleared.');
  });
});
$('deleteLegacy').addEventListener('click', () => {
  if (!confirm('Delete all password-protected documents stored by v1.0.2? This cannot be undone.')) return;
  void runBusy(async () => {
    await IismDocumentStore.deleteLegacyVault();
    feedback('Old v1.0.2 document storage cleared.');
  });
});

renderRows();
syncUi().catch((error) => feedback(error.message || 'Cannot load saved documents.', true));
