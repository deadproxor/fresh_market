#!/usr/bin/env python3
"""
FreshMarket Version Bumper Script
Usage:
  python3 bump.py patch    # e.g., 1.3.0 -> 1.3.1
  python3 bump.py minor    # e.g., 1.3.0 -> 1.4.0
  python3 bump.py major    # e.g., 1.3.0 -> 2.0.0
  python3 bump.py 1.3.5    # explicit target version
"""

import sys
import os
import re
import json

root_dir = os.path.dirname(os.path.abspath(__file__))
app_js_path = os.path.join(root_dir, 'app.js')
index_html_path = os.path.join(root_dir, 'index.html')
manifest_path = os.path.join(root_dir, 'manifest.json')

arg = (sys.argv[1] if len(sys.argv) > 1 else 'patch').strip().lower()

if arg in ['--help', '-h']:
    print("""
FreshMarket Version Bumper
--------------------------
Usage:
  python3 bump.py patch    (e.g., 1.3.0 -> 1.3.1)
  python3 bump.py minor    (e.g., 1.3.0 -> 1.4.0)
  python3 bump.py major    (e.g., 1.3.0 -> 2.0.0)
  python3 bump.py <semver> (e.g., python3 bump.py 1.3.5)
""")
    sys.exit(0)

# 1. Read current version from app.js
if not os.path.exists(app_js_path):
    print(f"[Error] app.js not found at {app_js_path}")
    sys.exit(1)

with open(app_js_path, 'r', encoding='utf-8') as f:
    app_js_content = f.read()

m = re.search(r"const\s+APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", app_js_content)
if not m:
    print("[Error] Could not find const APP_VERSION in app.js")
    sys.exit(1)

current_version = m.group(1)
parts = [int(p) if p.isdigit() else 0 for p in current_version.split('.')]
while len(parts) < 3:
    parts.append(0)

major, minor, patch = parts[0], parts[1], parts[2]

if arg == 'patch':
    next_version = f"{major}.{minor}.{patch + 1}"
elif arg == 'minor':
    next_version = f"{major}.{minor + 1}.0"
elif arg == 'major':
    next_version = f"{major + 1}.0.0"
elif re.match(r"^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$", arg):
    next_version = arg.lstrip('v')
else:
    print(f'[Error] Invalid version or command "{arg}". Use patch, minor, major, or explicit semver like 1.3.5')
    sys.exit(1)

print(f"Bumping FreshMarket version: v{current_version} -> v{next_version}")

# 2. Update app.js
app_js_content = re.sub(
    r"const\s+APP_VERSION\s*=\s*['\"][^'\"]+['\"]",
    f"const APP_VERSION = '{next_version}'",
    app_js_content,
    count=1
)
with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_js_content)
print(f"  [Updated] app.js (const APP_VERSION = '{next_version}')")

# 3. Update index.html
if os.path.exists(index_html_path):
    with open(index_html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Update splash screen version
    html = re.sub(
        r'(<div class="splash-version"[^>]*>)([^<]*)(</div>)',
        rf'\g<1>v{next_version}\g<3>',
        html
    )

    # Update settings footer version
    html = re.sub(
        r'(<span id="settingsAppVersion"[^>]*>)([^<]*)(</span>)',
        rf'\g<1>v{next_version}\g<3>',
        html
    )

    # Update cache busting query strings
    html = re.sub(r'href="style\.css\?v=[^"]*"', f'href="style.css?v=v{next_version}"', html)
    html = re.sub(r'src="app\.js\?v=[^"]*"', f'src="app.js?v=v{next_version}"', html)

    with open(index_html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("  [Updated] index.html (splash, settings footer, and asset cache queries)")

# 4. Update manifest.json
if os.path.exists(manifest_path):
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        manifest['version'] = next_version
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f'  [Updated] manifest.json (version: "{next_version}")')
    except Exception as e:
        print(f"  [Skipped] manifest.json could not be updated: {e}")

print(f"\nVersion successfully bumped to v{next_version} across all files!")
