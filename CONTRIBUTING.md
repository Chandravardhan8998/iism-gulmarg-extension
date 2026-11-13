# Contributing

Bug reports, documentation improvements, and focused pull requests are welcome. Please be respectful, give specific feedback, and use synthetic examples. Harassment and sharing another person's private information are not acceptable.

## Local workflow

1. Fork and clone the repository. Use Node.js 22+ for checks and Python 3.9+ for packaging. No npm install is required.
2. Load this folder as an unpacked extension in desktop Chrome; see [README](README.md).
3. Make a focused change in plain JavaScript, HTML, or CSS, matching the existing style. Keep the extension dependency-free unless a dependency has a clear benefit.
4. Run `npm test`. For changes to permissions, storage, matching, or document transfer, add regression coverage and complete the relevant [manual checks](docs/TESTING.md).
5. Run `npm run package` and inspect the ZIP if runtime files changed. Update the packaging allowlist if a new runtime file is needed.
6. Open a pull request describing the problem, resulting behavior, checks performed, and any unverified behavior.

Never commit real admission data, browser profile directories, credentials, or diagnostic captures containing personal information. Use names such as `Example Applicant`, addresses at `example.invalid`, and generated text files for test documents. Review labels, option text, and filenames as well as field values before sharing diagnostics.

## Design constraints

- Keep final submission, declarations, CAPTCHA, and OTP under the applicant's control.
- Scope document access to this extension's top-frame content script on the exact official form origin/path.
- Do not overwrite existing file selections, including selections made during a transfer.
- Leave ambiguous upload controls for manual completion.
- Document automatic attachment and storage behavior clearly; do not add telemetry or external data transfer silently.
- Preserve saved profiles and documents during ordinary upgrades. Storage migrations need explicit tests and recovery instructions.

## Reporting problems

For ordinary bugs, include extension and Chrome versions, steps to reproduce, expected and actual behavior, and redacted or synthetic field markup if relevant. Avoid submitting a real application just to reproduce a bug.

Report security vulnerabilities through [Security](SECURITY.md), not a public bug report.
