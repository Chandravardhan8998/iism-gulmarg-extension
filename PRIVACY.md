# Privacy

This describes version 1.0.4 of the unpacked extension. It has no analytics, telemetry, advertising, remote scripts, or extension-operated server. The extension code makes no network requests of its own. It runs on the supported IISM form and fills that website's controls.

## Data stored on your device

- The saved text profile, including any contact, address, date-of-birth, and fitness information you enter, is stored in `chrome.storage.local` under `profile`. It is not stored in `chrome.storage.sync`.
- The five optional documents, filenames, types, sizes, and modification times are stored in extension-origin IndexedDB (`iism_admission_open_documents_v1`).
- Retry timestamps, counters, and selected field keys are stored in the admission tab's website-origin `sessionStorage`. That state contains no profile values or file bytes, but is visible to website scripts.
- The service worker temporarily holds file bytes while transferring them to the content script. Transfer tokens expire after 60 seconds; completed transfers are released. An interrupted transfer can remain in worker memory until the worker stops or the extension reloads.
- Previews use temporary object URLs, revoked when the preview closes. The diagnostic action writes field metadata to the system clipboard only when clicked.

There is no extension-level encryption or password protection. Anyone with access to the browser profile or computer may be able to read saved information. Device backups or profile copies may also retain it. Avoid shared or public computers.

## When the website receives information

Text filling starts when you click **Fill admission form**. Saved documents attach automatically when matching controls appear on `https://admission.iismgulmarg.in/admission_form.aspx`. Saving a document authorizes that automatic attachment; delete it from the manager to stop future attachment.

Once fields are filled or files are attached, the website's scripts can read them. The extension dispatches input/change events; the website may send information to its servers during those events or dropdown postbacks, before you press Submit. The institute's own privacy practices govern data it receives. The extension does not control website scripts, server retention, or processing.

## Permissions

| Permission or access | Reason |
| --- | --- |
| `storage` | Save and read the local text profile |
| `activeTab` | Inspect the tab you invoke the popup on and send actions to the content script |
| `clipboardWrite` | Copy diagnostic field metadata when you click the diagnostic action |
| Host permission and content script on `https://admission.iismgulmarg.in/*` | Retain access to the admission tab URL for sender validation and inject the script; filling and document access are gated to the exact form path in the top frame |

Host access is limited to the admission subdomain; there is no access to arbitrary websites, no external message listener, and no web-accessible resource. Document-transfer requests must come from this extension's top-frame content script on the supported origin and path. Local storage is not protection against malicious software or a compromised browser/profile.

## Delete information

1. In **Edit saved profile**, choose **Clear saved profile**.
2. In **Manage five saved documents**, remove individual files or choose **Delete these five saved files**.
3. If you used v1.0.2, separately choose **Clear old v1.0.2 document storage** to delete its encrypted IndexedDB vault. This version does not read that vault.
4. Close any open admission tabs and document previews, and reload or remove the extension to stop pending work and clear worker memory. Clear your clipboard separately if you copied diagnostics.

Deletion does not erase original files on your device, backups, files already selected in open website controls, or information already sent to the institute. Clear selected website files or close the admission tab separately.

## Reports

Do not include real profiles, photos, signatures, marksheets, document names, or unredacted diagnostics in public issues or pull requests. See [Security](SECURITY.md) for vulnerability reporting.
