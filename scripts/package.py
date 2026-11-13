"""Build a reproducible extension ZIP from reviewed files only (stdlib only)."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    'manifest.json',
    'content.js',
    'document-store.js',
    'documents-worker.js',
    'documents.html',
    'documents.js',
    'options.html',
    'options.js',
    'popup.html',
    'popup.js',
    'styles.css',
    'LICENSE',
    'README.md',
    'PRIVACY.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'docs/RELEASING.md',
    'docs/TESTING.md',
)


def main():
    version = json.loads((ROOT / 'manifest.json').read_text())['version']
    # Restrict the version before using it in an output filename.
    if not all(part.isdecimal() for part in version.split('.')):
        raise ValueError('Invalid manifest version')
    for name in FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing or symlinked release file: {name}')
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    archive = output / f'iism-gulmarg-autofill-{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in sorted(FILES):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, (ROOT / name).read_bytes())
    with zipfile.ZipFile(archive) as bundle:
        if sorted(bundle.namelist()) != sorted(FILES) or bundle.testzip() is not None:
            raise ValueError('Release ZIP verification failed')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
    print(f'Created {archive.relative_to(ROOT)} ({len(FILES)} files)')
    print(f'SHA-256: {digest}')


if __name__ == '__main__':
    main()
