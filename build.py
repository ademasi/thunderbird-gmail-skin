from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent
source = root / 'inline-labels'
version = json.loads((source / 'manifest.json').read_text())['version']
output = root / f'gmail-inline-labels-{version}.xpi'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(source).as_posix()
        data = path.read_bytes()
        if relative == 'experiments/api.js':
            # Package renderer into the experiment script. loadSubScript rejects
            # unsigned extension jar URIs as untrusted in Thunderbird 153.
            data += b'\n' + (source / 'labels.js').read_bytes()
            data += b'\n' + (source / 'reading.js').read_bytes()
            data += b'\n' + (source / 'dates.js').read_bytes()
        archive.writestr(relative, data)
print(output)
