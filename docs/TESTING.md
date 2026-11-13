# Testing

## Automated checks

Run `npm test` with Node.js 22+. Tests use Node's built-in runner and isolated VM contexts with synthetic DOM and Chrome API stubs. No website requests or real applicant documents are used.

Coverage includes form-origin/path checks, service-worker sender authorization, transfer token ownership and expiry, file validation, date formatting, upload matching, type restrictions, and file selections changed while a saved document is transferring. Syntax and manifest/HTML resource checks run first.

These unit tests do not replace a browser check: the stubs do not implement Chrome's extension lifecycle, IndexedDB, real `DataTransfer`, ASP.NET postbacks, native clipboard access, or the live website's acceptance rules.

## Optional browser integration check

Set `IISM_CHROMIUM_PATH` to an extension-capable Chromium or Chrome for Testing executable, then run `npm run test:browser`. For example on macOS/Linux:

```sh
IISM_CHROMIUM_PATH="/absolute/path/to/Chromium" npm run test:browser
```

On Windows, set the same environment variable in your shell before running the npm command. Some consumer Chrome builds disable command-line extension loading; use a testing build that supports `--load-extension`. This project does not download a browser automatically.

The check creates a temporary browser profile, uses real extension pages, IndexedDB, worker messaging, and `DataTransfer`, and intercepts test-page HTTP requests locally. It verifies profile save/clear, five document slots and persistence, previews, automatic and manual attachment, text and DOB, popup status, diagnostics, individual and bulk deletion, and legacy cleanup. The synthetic form reloads after a dropdown changes to exercise pending autofill across navigation. No form request is sent to the institute. The profile is removed on exit.

To check the release ZIP, extract it and set `IISM_EXTENSION_DIR` to the extracted folder containing `manifest.json` while running the script from the repository. To compare existing core behavior against the original local commit, run `IISM_TEST_BASELINE=5aab6ea node --test tests/compatibility.test.cjs` in a clone containing that commit. Browser checks can also target a separately extracted original revision using `IISM_EXTENSION_DIR`.

The browser check does not verify live website markup or server acceptance, native file-picker dialogs, clipboard permission prompts, a true ASP.NET server, or every Chrome version. Record the browser version used.

## Verification recorded for 1.0.4

Performed on November 13, 2026, on macOS:

- All 20 unit/regression tests and manifest, resource, and JavaScript syntax checks passed with Node.js 25.9.0.
- The same 11 core compatibility cases passed against both the original `5aab6ea` revision and the prepared source.
- The optional browser integration check passed against both an extracted original revision and the extracted 1.0.4 release ZIP, using Chromium 138.0.7204.23. This covered real extension storage, previews, messaging, attachment, popup status, page-refresh resume, dynamic upload controls, and deletion controls described above.
- No institute form request or application submission was made. The live site, real ASP.NET server behavior, native clipboard/file-picker prompts, hosted GitHub Actions run, and other browser versions remain unverified.

The existing profile/document storage implementation and database names are unchanged. These results establish compatibility for the tested cases; they are not a guarantee against every possible website or browser change.

## Manual browser checks before a release

Use a dedicated test Chrome profile and synthetic data. Do not submit a real application for testing. Local tests must not weaken the production manifest or worker authorization checks.

- Load the extracted release ZIP as an unpacked extension. Confirm version 1.0.4 and no errors in `chrome://extensions` or the worker console.
- Open the popup on an unrelated site: fill, attach, and diagnostics actions must be disabled. Options and document management should still open.
- Save a synthetic text profile, reload the extension, and verify it persists. Clear it and verify it is gone after reopening options.
- In the document manager, save an image and a PDF made for testing; reopen the page and check filenames, sizes, preview, replacement, removal, and delete-all. Verify empty/unsupported/oversized files are rejected.
- Confirm ordinary updates in the same folder preserve the extension ID and saved data.
- If inspecting the live form, do so without saving documents or personal details first. Verify actual labels, supported types, and size rules. Never trigger final submission automatically.
- Only if you intentionally authorize sharing synthetic files with the institute, verify automatic and manual attachment, dropdown refresh/resume, dynamically added controls, manual file preservation, and website validation on the live form. Record what was tested and what remains unverified.
- Inspect copied diagnostics and verify entered values are absent. Redact contextual labels, options, identifiers, and filenames before sharing a report.
- Inspect the ZIP listing: it must contain only files from `scripts/package.py`, with no `.git`, local configuration, applicant files, or test data.

Record browser/version, operating system, checks completed, and any failures in the release notes. Never describe unperformed manual checks as passing.
