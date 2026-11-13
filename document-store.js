/* IISM local document storage, intentionally without passwords or encryption.
   Only five user-selected document categories are stored in extension-origin
   IndexedDB. Old v1.0.2 encrypted vault data is not read or modified here. */
'use strict';
const IismDocumentStore = (() => {
  const DB_NAME = 'iism_admission_open_documents_v1';
  const LEGACY_DB_NAME = 'iism_admission_document_vault_v1';
  const DB_VERSION = 1;
  const MAX_PROOF_BYTES = 10 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 500 * 1024;
  const SLOTS = Object.freeze([
    {key: 'applicantPhoto', title: 'Photo of candidate', detail: 'Candidate passport photo · JPG / PNG, up to 500 KB', kind: 'image'},
    {key: 'applicantSignature', title: 'Photo of signature', detail: 'Candidate signature photo · JPG / PNG, up to 500 KB', kind: 'image'},
    {key: 'educationProof', title: 'Graduation 3rd year marksheet', detail: 'Final-year / 3rd-year graduation marksheet', kind: 'proof'},
    {key: 'dobProof', title: 'DOB — 10th marksheet', detail: 'Class 10 marksheet as proof of date of birth', kind: 'proof'},
    {key: 'guardianSignature', title: 'Parent signature', detail: 'Parent / guardian signature photo · JPG / PNG, up to 500 KB', kind: 'image'}
  ]);
  const allowedKeys = new Set(SLOTS.map((slot) => slot.key));

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', {keyPath: 'key'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Cannot open local document storage.'));
    });
  }

  async function dbAction(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('documents', mode);
        let result;
        let req;
        try { req = callback(tx.objectStore('documents')); }
        catch (e) { try { tx.abort(); } catch {} reject(e); return; }
        if (req) {
          req.onsuccess = () => { result = req.result; };
          req.onerror = () => reject(req.error || new Error('Document storage error.'));
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('Document transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('Document transaction cancelled.'));
      });
    } finally { db.close(); }
  }

  function validateFile(key, file) {
    const slot = SLOTS.find((item) => item.key === key);
    if (!slot) throw new Error('Unknown document type.');
    if (!(file instanceof Blob) || file.size === 0) throw new Error('Choose a nonempty file.');
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    const allowed = slot.kind === 'image' ? ['jpg', 'jpeg', 'png'] : ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    if (!allowed.includes(extension)) throw new Error(`Unsupported file format. Allowed: ${allowed.join(', ')}.`);
    const maxSize = slot.kind === 'image' ? MAX_IMAGE_BYTES : MAX_PROOF_BYTES;
    if (file.size > maxSize) throw new Error(`File exceeds ${slot.kind === 'image' ? '500 KB' : '10 MB'} limit for saved storage.`);
    return slot;
  }

  async function saveDocument(key, file) {
    validateFile(key, file);
    const record = {
      key,
      name: file.name,
      size: file.size,
      type: file.type || '',
      lastModified: file.lastModified || Date.now(),
      blob: file
    };
    await dbAction('readwrite', (store) => store.put(record));
    return {key, name: record.name, size: record.size, type: record.type};
  }

  async function savedKeys() {
    const keys = await dbAction('readonly', (store) => store.getAllKeys());
    return keys.filter((key) => allowedKeys.has(key));
  }

  async function listDocuments() {
    const result = await dbAction('readonly', (store) => store.getAll());
    return result.filter((item) => allowedKeys.has(item.key))
      .map(({key, name, size, type, lastModified}) => ({key, name, size, type, lastModified}));
  }

  async function readDocument(key) {
    if (!allowedKeys.has(key)) throw new Error('Document type is not permitted.');
    const record = await dbAction('readonly', (store) => store.get(key));
    if (!record?.blob) throw new Error('Document not saved.');
    return {
      meta: {name: record.name, size: record.size, type: record.type, lastModified: record.lastModified},
      bytes: new Uint8Array(await record.blob.arrayBuffer())
    };
  }

  async function deleteDocument(key) {
    if (!allowedKeys.has(key)) throw new Error('Unknown document type.');
    await dbAction('readwrite', (store) => store.delete(key));
  }

  async function resetDocuments() {
    await dbAction('readwrite', (store) => store.clear());
  }

  // Optional cleanup for anyone upgrading from the password-protected v1.0.2.
  // Never run without the user's explicit confirmation.
  function deleteLegacyVault() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Unable to remove old storage.'));
      req.onblocked = () => reject(new Error('Close older extension tabs and try again.'));
    });
  }

  return {SLOTS, validateFile, saveDocument, savedKeys, listDocuments,
    readDocument, deleteDocument, resetDocuments, deleteLegacyVault};
})();
