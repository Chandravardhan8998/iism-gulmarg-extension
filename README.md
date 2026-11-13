# IISM Gulmarg Admission Autofill v1.0.3 — Five automatic document uploads

Built on the **v1.0.1 text autofill and DOB fix**, not the v1.1 copy-list version. The five-document feature replaces the eight-category locked vault from v1.0.2.

## Documents supported (only these five)

1. Photo of candidate (JPG/PNG)
2. Photo of signature — candidate signature (JPG/PNG)
3. Graduation 3rd-year marksheet (PDF/JPG/PNG/DOC/DOCX)
4. DOB — 10th marksheet (PDF/JPG/PNG/DOC/DOCX)
5. Parent signature (JPG/PNG)

Photos and signatures can be saved up to 500 KB; marksheets up to 10 MB. The live website may impose stricter limits.

## Update your installed extension without losing the text profile

1. Extract the ZIP and copy **all files inside the extracted `iism-gulmarg-autofill` folder** into your **existing installed extension folder**, replacing files in place.
2. Open `chrome://extensions`, then click **Reload** on the IISM extension. It should show **1.0.3**.
3. Do not uninstall/re-add the extension if you want to keep the original Chrome extension ID and saved text profile.
4. Open **Manage saved documents**. Choose each of the five files from your device **once**. There is no password, passphrase, or unlock step.
5. Open or refresh `https://admission.iismgulmarg.in/admission_form.aspx` in Chrome. The extension attempts to attach matching documents automatically as upload controls appear, including dynamically loaded controls. The **Attach saved documents only** button lets you retry manually when needed. The normal text autofill button still works as before.
6. **Review all file names, sizes, text fields, declarations, and website validation before manually submitting.** The extension does not submit or bypass CAPTCHA/OTP.

## If upgrading from v1.0.2

Documents saved in v1.0.2 are encrypted with the earlier passphrase and **cannot be automatically converted to unprotected files without that passphrase**. Choose the five documents again in the new manager. Old v1.0.2 encrypted files stay untouched until you choose **Clear old v1.0.2 document storage**; that button removes only the older encrypted vault.

## Privacy and technical limitations

- As requested, the new documents are **not password-protected or encrypted**. Their full bytes and filenames are stored in Chrome extension-origin IndexedDB on this device. Anyone who gains access to your Chrome profile/computer may be able to access them.
- The extension sends no documents to AI services or third-party servers. On the official IISM form, page scripts can access file inputs that have been populated, and the IISM website may upload files when its own page events run.
- Auto-attachment only runs on the official `https://admission.iismgulmarg.in/admission_form.aspx` path. It does not submit forms, click declarations, or bypass security checks.
- Files are attached only to recognizable, unambiguous HTML file inputs. Browser protections, custom widgets, `isTrusted` checks, size/type rules, or website reload behavior can prevent auto-attachment or server acceptance. In those cases attach manually.
- Existing manually selected files are never overwritten.
- An attempt limit prevents auto-upload loops caused by repeated website postbacks.
- This implementation was tested with simulated form fields; the live IISM form's complete upload markup has not been independently verified.

This extension is independent of the Indian Institute of Skiing & Mountaineering.
