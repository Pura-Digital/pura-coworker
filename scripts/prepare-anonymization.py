"""Build the private CPU worker with Python 3.11+. Run on each target OS/architecture."""
from pathlib import Path
import os
import platform
import subprocess
import sys
import venv

root = Path(__file__).resolve().parents[1]
target_os = {'Darwin': 'darwin', 'Windows': 'win32', 'Linux': 'linux'}[platform.system()]
arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'x64'
target = root / '.bundle-resources' / 'anonymization' / f'{target_os}-{arch}'
env = root / '.cache' / 'anonymization-build'
if sys.version_info < (3, 11):
    raise SystemExit('Anonymization build requires Python 3.11 or newer')
venv.create(env, with_pip=True)
python = env / ('Scripts/python.exe' if target_os == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', '--extra-index-url',
                'https://download.pytorch.org/whl/cpu', '-r',
                str(root / 'resources/anonymization/requirements.txt')], check=True)
subprocess.run([str(python), str(root / 'tests/anonymization-worker-test.py')], check=True)
subprocess.run([str(python), '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
                '--name', 'rizzo-worker', '--distpath', str(target),
                '--workpath', str(env / 'work'), '--specpath', str(env),
                '--paths', str(root / 'resources/anonymization/vendor'),
                '--add-data', str(root / 'resources/anonymization/vendor/LICENSE') + os.pathsep + 'licenses/rizzo-pii',
                '--add-data', str(root / 'resources/anonymization/vendor/UPSTREAM.json') + os.pathsep + 'licenses/rizzo-pii',
                '--hidden-import', 'inference', '--hidden-import', 'detectors',
                '--collect-all', 'transformers', '--collect-all', 'torch',
                str(root / 'resources/anonymization/worker.py')], check=True)
