# Publishing and releases

## First public publication

1. Review the MIT license and confirm you have the rights to publish every included file. Institute names identify compatibility and do not imply endorsement.
2. Review tracked files **and all Git history** for credentials and applicant information. The initial local commit contains the author's personal email in Git metadata; decide whether you want that public before pushing history. Changing future Git identity does not change old commits. Do not rewrite shared history without coordinating with collaborators.
3. Choose a repository name, create a public GitHub repository, and configure its remote. These are hosting steps; no repository URL or account is hardcoded in this project.
4. Enable GitHub private vulnerability reporting so the private route in `SECURITY.md` is usable. Configure branch protection and require the CI check if desired.
5. Follow the release steps below, commit the reviewed files, and push the branch to your chosen repository. Confirm GitHub Actions passes on the hosted repository before announcing it.

## Release steps

1. Update `manifest.json` and `package.json` together. Update version references in README, Privacy, manual testing instructions, and the changelog.
2. Run `npm run package` (Node.js 22+, Python 3.9+). This runs the automated checks and builds the allowlisted ZIP and checksum in `dist/`.
3. Inspect the ZIP and load an extracted copy in a dedicated Chrome profile. Complete and record the applicable [manual checks](TESTING.md), including any unverified live behavior.
4. Commit the reviewed source. Use a tag such as `v1.0.4` for the exact commit being released.
5. Create a GitHub release for that tag. Attach the generated `.zip` and `.zip.sha256`; include the changelog and browser-verification results. CI artifacts are convenient previews, not automatically published releases.
6. Download the uploaded ZIP, verify its SHA-256 checksum, and check the installation instructions from a fresh profile.

Packaging includes runtime files, the MIT notice, and user documentation. It excludes Git history, development tools, and arbitrary local files. GitHub's source ZIP includes the development files too, so it can also be loaded directly from the folder containing `manifest.json`.

Chrome Web Store publication is a separate process and is not automated here. Do not advertise a store listing or verified live-site compatibility until those steps are actually complete.
