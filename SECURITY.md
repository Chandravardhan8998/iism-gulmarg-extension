# Security

Security fixes target the latest version on the default branch. Older versions are not separately maintained. This is a community project with no guaranteed response time.

## Report a vulnerability privately

On the hosting GitHub repository, use **Security → Report a vulnerability** if private vulnerability reporting is enabled. Include the affected version, synthetic reproduction steps, impact, and a proposed fix if available.

If that option is unavailable, open an issue asking only for a private reporting channel. Do not include exploit details or personal data until a maintainer provides one. Never attach real documents, profile exports, passwords, or unredacted diagnostics.

## Boundaries

Saved data is not encrypted by the extension. Automatic attachment deliberately makes saved documents available to the official website when a matching input appears. These behaviors are described in [Privacy](PRIVACY.md); they are not a secure document vault.

Unauthorized document access, attachment on another origin/path or frame, ambiguous document selection, and replacement of a person's file selection are security-relevant bugs. Use only a local/synthetic fixture to demonstrate them.
