# IISM Gulmarg Admission Autofill

A free, open-source Chrome extension that fills saved admission details and attaches five saved documents on the [IISM admission form](https://admission.iismgulmarg.in/admission_form.aspx).

**Independent community project. Not affiliated with or endorsed by the Indian Institute of Skiing & Mountaineering.** This extension does not reserve seats, guarantee admission, submit applications, accept declarations, or bypass CAPTCHA or OTP.

## Before you use it

Saved profiles and documents are **not encrypted by this extension**. Documents attach automatically when you visit the supported form after saving them. The website can read attached files and filled details, and its own events may upload them **before final submission**. Use a browser profile you control and review every field and filename. See [Privacy](PRIVACY.md) for storage, permissions, and deletion details.

## Install

Use desktop Google Chrome. Other Chromium browsers may work but are not verified. There is no build step, account, API key, or paid service to configure.

1. Download this repository using **Code → Download ZIP** on GitHub, or download a packaged extension ZIP if one is available in Releases.
2. Extract the ZIP to a permanent folder. Find the folder containing `manifest.json`; do not select the ZIP itself.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select that folder.
5. Pin **IISM Gulmarg Admission Autofill** from Chrome's Extensions menu if desired.

The project is currently distributed as an unpacked extension. A Chrome Web Store listing is not included in this repository.

## Use

1. Click the extension icon, then **Edit saved profile**. Enter the details you want filled and click **Save profile**. Leave other fields blank. For course, level, schedule, and state, use the exact option text displayed by the website.
2. Optionally open **Manage five saved documents** and select your files. Saving a document enables automatic attachment of that document on the supported form; there is no separate enable switch.
3. Open or refresh the [admission form](https://admission.iismgulmarg.in/admission_form.aspx). Saved documents attach when recognizable upload controls appear.
4. To fill text and dropdowns, click **Fill admission form** in the extension popup. Dropdown changes may refresh the page; autofill tries to resume afterward.
5. Review all details, document selections, website validation, declarations, and verification steps. Submit the application yourself.

**Attach saved documents only** retries document attachment. Existing file selections are preserved. Unknown or ambiguous upload fields are left for manual completion.

| Saved document | Accepted local file types | Local storage limit |
| --- | --- | --- |
| Candidate photo | JPG, JPEG, PNG | 500 KiB |
| Candidate signature | JPG, JPEG, PNG | 500 KiB |
| Graduation final-year / 3rd-year marksheet | PDF, JPG, JPEG, PNG, DOC, DOCX | 10 MiB |
| Class 10 marksheet for date of birth | PDF, JPG, JPEG, PNG, DOC, DOCX | 10 MiB |
| Parent / guardian signature | JPG, JPEG, PNG | 500 KiB |

These are extension limits, not the institute's requirements. The website may require different sizes or formats. Type validation checks filename extensions, not file contents. Preview supports images and PDF; Word files can be saved but not previewed.

## Update or remove

To keep saved data, replace the extension files **in the same installed folder**, click **Reload** at `chrome://extensions`, and refresh open admission tabs. Keep the folder path and extension ID stable. Do not uninstall first if you want to keep your data.

To delete data, use **Clear saved profile** and **Manage five saved documents → Delete these five saved files**. Older v1.0.2 encrypted documents require reselecting and can be removed separately with **Clear old v1.0.2 document storage**. Removing a saved document does not clear a file already attached to an open web page; clear that input or close the page separately.

Remove the extension from `chrome://extensions` when finished. See [Privacy](PRIVACY.md) for remaining copies such as original files and website submissions.

## Troubleshooting and limitations

- If buttons are disabled, open the exact supported form URL above. Other paths, subdomains, and embedded frames are not supported.
- If the extension cannot reach the page, reload the extension and then refresh the admission tab.
- If a field is missed, use the exact dropdown option text or complete it manually. Website layout changes can break matching.
- Custom upload widgets, browser restrictions, trusted-event checks, postbacks, or server validation can prevent attachment or acceptance. The extension limits repeated automatic attempts to reduce postback loops.
- **Copy detected form fields** copies field metadata to your clipboard. It omits entered values, but labels and option text can still contain personal information. Review and redact the output before sharing it in an issue.
- Automated tests cover simulated fields and extension message boundaries. The complete live admission workflow and server acceptance have not been verified. No admission outcome is guaranteed.

## Development

The extension itself needs only Chrome. Use the repository source for development; the packaged extension ZIP omits development tools. Development checks require **Node.js 22 or newer**; ZIP packaging also requires **Python 3.9 or newer**. There are no npm dependencies and no install step.

```sh
npm test
npm run package
```

The package command runs checks, then creates `dist/iism-gulmarg-autofill-1.0.4.zip` and a SHA-256 checksum. Packaging uses an explicit file allowlist so Git history, tests, personal files, and local configuration are excluded.

An optional `npm run test:browser` check runs the real unpacked extension in an isolated Chromium profile against an intercepted synthetic form. See [Testing](docs/TESTING.md) for browser requirements and configuration.

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 configuration and permissions |
| `popup.*` | Active-tab actions and status |
| `options.*` | Saved text profile in `chrome.storage.local` |
| `document-store.js`, `documents.*` | IndexedDB storage and document manager |
| `documents-worker.js` | Authorized, chunked document transfer |
| `content.js` | Field matching, postback retries, and attachment |
| `tests/`, `scripts/` | Dependency-free checks and packaging |

Read [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), and the [release checklist](docs/RELEASING.md) before contributing or publishing. GitHub Actions runs checks and builds a downloadable artifact for pushes and pull requests. It does not publish releases automatically.

## License

[MIT](LICENSE). Copyright holders retain their rights; reuse must preserve the license notice. Institute names are used only to identify the supported website and do not imply endorsement.
