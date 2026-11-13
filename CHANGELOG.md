# Changelog

## 1.0.4

- Prepare a public MIT-licensed release with installation, privacy, contribution, security, testing, and release documentation.
- Add dependency-free automated checks, regression tests, GitHub CI, and allowlisted ZIP packaging.
- Preserve existing site permissions, storage names, and automatic attachment behavior for upgrade compatibility.
- Reject prefixed form paths and nonstandard origins consistently in popup, content script, and document worker checks.
- Skip conflicting document-category matches and recheck controls after asynchronous transfer to preserve manual selections and avoid stale targets.
- Correct an outdated decryption error message for unencrypted saved documents.

## 1.0.3

- Existing baseline: local storage and automatic attachment of five documents, text autofill, date formatting, and dropdown postback retries.
- Retain separate cleanup for the legacy v1.0.2 encrypted vault.
