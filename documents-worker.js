/* Restrict file access to content scripts on the exact IISM admission form.
   No passphrases, temporary unlocks, network calls, or auto-submission. */
'use strict';
importScripts('document-store.js');
const BLOCK_BYTES = 96 * 1024;
const pendingTransfers = new Map();

function allowedPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'https://admission.iismgulmarg.in' &&
      /^\/admission_form\.aspx$/i.test(parsed.pathname);
  } catch { return false; }
}

function trustedExtensionPage(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

function authorizedForm(sender) {
  return sender.id === chrome.runtime.id && sender.tab?.id != null &&
    sender.frameId === 0 && allowedPage(sender.url || '') &&
    allowedPage(sender.tab.url || '');
}

function toBase64(bytes) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return btoa(text);
}

async function handle(action, message, sender) {
  switch (action) {
    case 'DOC_STATUS': {
      if (!trustedExtensionPage(sender)) throw new Error('Not permitted.');
      const keys = await IismDocumentStore.savedKeys();
      return {ok: true, count: keys.length, keys};
    }
    case 'DOC_LIST': {
      if (!authorizedForm(sender)) throw new Error('Document access is only available on the official admission form.');
      const keys = await IismDocumentStore.savedKeys();
      return {ok: true, keys};
    }
    case 'DOC_PREPARE': {
      if (!authorizedForm(sender)) throw new Error('Not permitted.');
      const {meta, bytes} = await IismDocumentStore.readDocument(message.key);
      const token = crypto.randomUUID();
      pendingTransfers.set(token, {bytes, tabId: sender.tab.id, createdAt: Date.now()});
      return {ok: true, token, name: meta.name, size: bytes.length,
        type: meta.type || '', lastModified: meta.lastModified};
    }
    case 'DOC_CHUNK': {
      if (!authorizedForm(sender)) throw new Error('Not permitted.');
      const entry = pendingTransfers.get(message.token);
      if (!entry || entry.tabId !== sender.tab.id || Date.now() - entry.createdAt > 60000) {
        throw new Error('Document transfer expired.');
      }
      const offset = Number(message.offset);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= entry.bytes.length) {
        throw new Error('Invalid file position.');
      }
      return {ok: true, data: toBase64(entry.bytes.subarray(offset, offset + BLOCK_BYTES))};
    }
    case 'DOC_RELEASE': {
      if (!authorizedForm(sender)) throw new Error('Not permitted.');
      const entry = pendingTransfers.get(message.token);
      if (entry?.tabId === sender.tab.id) pendingTransfers.delete(message.token);
      return {ok: true};
    }
    default: throw new Error('Unsupported operation.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.action !== 'string' || !message.action.startsWith('DOC_')) return false;
  Promise.resolve().then(() => handle(message.action, message, sender))
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ok: false, error: error?.message || 'Document action failed.'}));
  return true;
});
