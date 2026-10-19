#!/usr/bin/env python3
"""
FreshMarket — Automated Version Synchronization Tool (bump_version.py)
====================================================================
Synchronizes application release versions, service worker cache identifiers,
and cache-busting query parameters (?v=...) across the entire project in
a single atomic operation.

Zero external dependencies: uses Python 3 standard library only.

Usage:
  python3 scripts/bump_version.py --status                # Display current detected versions
  python3 scripts/bump_version.py 1.5.0                   # Set explicit version
  python3 scripts/bump_version.py --patch                 # Increment patch: 1.5.0 -> 1.5.1
  python3 scripts/bump_version.py --minor                 # Increment minor: 1.5.0 -> 1.6.0
  python3 scripts/bump_version.py --major                 # Increment major: 1.5.0 -> 2.0.0
  python3 scripts/bump_version.py --dry-run 1.5.0         # Preview changes without modifying files
"""

import argparse
import os
import re
import sys
from pathlib import Path

# Workspace Root
REPO_ROOT = Path(__file__).resolve().parent.parent

# Semantic Version Regex
SEMVER_REGEX = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")

# Target HTML Files with Asset Cache-Busters
HTML_FILES = [
    REPO_ROOT / "shop.html",
    REPO_ROOT / "admin" / "index.html",
    REPO_ROOT / "index.html",
    REPO_ROOT / "components.html",
]

# Asset Tag Regex (links and scripts with local relative paths ending in .css or .js)
ASSET_TAG_REGEX = re.compile(
    r'(<(?:link|script)\s+[^>]*?(?:href|src)=["\'])(?!https?:\/\/|\/\/)([^"?#\'\s]+\.(?:css|js))(?:\?v=[^"\'&]*)?(["\'][^>]*>)',
    re.IGNORECASE
)

# Splash Version Regex (<div class="splash-version" id="splashVersion">v...</div>)
SPLASH_VERSION_REGEX = re.compile(
    r'(<div\s+class="splash-version"\s+id="splashVersion">)v[^<]+(</div>)',
    re.IGNORECASE
)


def parse_semver(ver_str: str):
    """Parses a version string into (major, minor, patch, prerelease)."""
    clean_ver = ver_str.strip().lstrip("v")
    match = SEMVER_REGEX.match(clean_ver)
    if not match:
        raise ValueError(f"Invalid semver version format: '{ver_str}' (expected X.Y.Z or X.Y.Z-prerelease)")
    major, minor, patch, prerelease = match.groups()
    return int(major), int(minor), int(patch), prerelease or ""


def format_semver(major: int, minor: int, patch: int, prerelease: str = "") -> str:
    """Formats components back into semver string."""
    base = f"{major}.{minor}.{patch}"
    return f"{base}-{prerelease}" if prerelease else base


def bump_version(current_ver: str, bump_type: str) -> str:
    """Increments major, minor, or patch component of current_ver."""
    major, minor, patch, _ = parse_semver(current_ver)
    if bump_type == "major":
        return format_semver(major + 1, 0, 0)
    elif bump_type == "minor":
        return format_semver(major, minor + 1, 0)
    elif bump_type == "patch":
        return format_semver(major, minor, patch + 1)
    else:
        raise ValueError(f"Unknown bump type: {bump_type}")


def detect_current_versions():
    """Detects versions across all key project files."""
    versions = {}

    # 1. Shop JS
    shop_js = REPO_ROOT / "js" / "shop.js"
    if shop_js.is_file():
        m = re.search(r"const\s+SHOP_VERSION\s*=\s*'([^']+)'", shop_js.read_text(encoding="utf-8"))
        versions["js/shop.js (SHOP_VERSION)"] = m.group(1) if m else "Not found"

    # 2. Admin Catalog JS
    admin_cat = REPO_ROOT / "admin" / "js" / "admin-catalog.js"
    if admin_cat.is_file():
        m = re.search(r"const\s+APP_VERSION\s*=\s*'([^']+)'", admin_cat.read_text(encoding="utf-8"))
        versions["admin/js/admin-catalog.js (APP_VERSION)"] = m.group(1) if m else "Not found"

    # 3. Shared Utils JS
    utils_js = REPO_ROOT / "js" / "shared" / "utils.js"
    if utils_js.is_file():
        m = re.search(r"const\s+APP_VERSION\s*=\s*'([^']+)'", utils_js.read_text(encoding="utf-8"))
        versions["js/shared/utils.js (APP_VERSION)"] = m.group(1) if m else "Not set"

    # 4. Service Worker Shop
    sw_shop = REPO_ROOT / "sw-shop.js"
    if sw_shop.is_file():
        m = re.search(r"const\s+CACHE_NAME\s*=\s*'freshmarket-shop-v([^']+)'", sw_shop.read_text(encoding="utf-8"))
        versions["sw-shop.js (CACHE_NAME)"] = m.group(1) if m else "Not found"

    # 5. Service Worker Admin
    sw_admin = REPO_ROOT / "admin" / "sw-admin.js"
    if sw_admin.is_file():
        m = re.search(r"const\s+CACHE_NAME\s*=\s*'freshmarket-admin-v([^']+)'", sw_admin.read_text(encoding="utf-8"))
        versions["admin/sw-admin.js (CACHE_NAME)"] = m.group(1) if m else "Not found"

    return versions


def get_canonical_version():
    """Determines the primary baseline version to use when bumping."""
    detected = detect_current_versions()
    candidates = []
    for k, v in detected.items():
        if v not in ("Not found", "Not set"):
            try:
                parse_semver(v)
                candidates.append(v)
            except ValueError:
                continue

    if not candidates:
        return "1.5.0"

    # Sort versions according to semver tuple
    candidates.sort(key=lambda s: parse_semver(s), reverse=True)
    return candidates[0]


def print_status():
    """Displays a formatted table of all currently detected versions."""
    detected = detect_current_versions()
    canonical = get_canonical_version()

    print("\n📦 FreshMarket Version Status Report")
    print("=" * 64)
    print(f"{'Target Location':<42} | {'Detected Version'}")
    print("-" * 64)
    for target, ver in detected.items():
        icon = "🟢" if ver != "Not found" and ver != "Not set" else "⚪"
        print(f"{icon} {target:<39} | {ver}")

    print("-" * 64)
    print(f"⭐ Canonical Baseline Version: {canonical}")

    # Inspect HTML asset tags count
    print("\n🔍 HTML Local Asset Cache-Busters (?v=...):")
    total_tags = 0
    for html_file in HTML_FILES:
        if html_file.is_file():
            content = html_file.read_text(encoding="utf-8")
            matches = list(ASSET_TAG_REGEX.finditer(content))
            total_tags += len(matches)
            rel_path = html_file.relative_to(REPO_ROOT)
            print(f"   • {str(rel_path):<30} : {len(matches)} local assets tracked")
    print(f"   Total tracked assets: {total_tags}")
    print("=" * 64 + "\n")


def update_file(path: Path, new_content: str, dry_run: bool = False):
    """Safely writes updated content to a file if changed."""
    old_content = path.read_text(encoding="utf-8")
    if old_content == new_content:
        return False
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    return True


def apply_version(target_ver: str, dry_run: bool = False):
    """Synchronizes all target files with the new target version."""
    clean_ver = target_ver.strip().lstrip("v")
    parse_semver(clean_ver)  # Validation check

    mode_prefix = "[DRY-RUN] Would update" if dry_run else "Updating"
    print(f"\n🚀 {mode_prefix} FreshMarket version -> v{clean_ver}")
    print("=" * 64)

    modified_count = 0

    # 1. Update sw-shop.js
    sw_shop_path = REPO_ROOT / "sw-shop.js"
    if sw_shop_path.is_file():
        content = sw_shop_path.read_text(encoding="utf-8")
        updated = re.sub(
            r"(const\s+CACHE_NAME\s*=\s*'freshmarket-shop-v)[^']+(';)",
            rf"\g<1>{clean_ver}\g<2>",
            content
        )
        if update_file(sw_shop_path, updated, dry_run):
            print(f"  ✅ sw-shop.js (freshmarket-shop-v{clean_ver})")
            modified_count += 1
        else:
            print("  ⏺ sw-shop.js (already up to date)")

    # 2. Update admin/sw-admin.js
    sw_admin_path = REPO_ROOT / "admin" / "sw-admin.js"
    if sw_admin_path.is_file():
        content = sw_admin_path.read_text(encoding="utf-8")
        updated = re.sub(
            r"(const\s+CACHE_NAME\s*=\s*'freshmarket-admin-v)[^']+(';)",
            rf"\g<1>{clean_ver}\g<2>",
            content
        )
        if update_file(sw_admin_path, updated, dry_run):
            print(f"  ✅ admin/sw-admin.js (freshmarket-admin-v{clean_ver})")
            modified_count += 1
        else:
            print("  ⏺ admin/sw-admin.js (already up to date)")

    # 3. Update js/shop.js
    shop_js_path = REPO_ROOT / "js" / "shop.js"
    if shop_js_path.is_file():
        content = shop_js_path.read_text(encoding="utf-8")
        updated = re.sub(
            r"(const\s+SHOP_VERSION\s*=\s*')[^']+(';)",
            rf"\g<1>{clean_ver}\g<2>",
            content
        )
        if update_file(shop_js_path, updated, dry_run):
            print(f"  ✅ js/shop.js (SHOP_VERSION = '{clean_ver}')")
            modified_count += 1
        else:
            print("  ⏺ js/shop.js (already up to date)")

    # 4. Update admin/js/admin-catalog.js
    admin_cat_path = REPO_ROOT / "admin" / "js" / "admin-catalog.js"
    if admin_cat_path.is_file():
        content = admin_cat_path.read_text(encoding="utf-8")
        updated = re.sub(
            r"(const\s+APP_VERSION\s*=\s*')[^']+(';)",
            rf"\g<1>{clean_ver}\g<2>",
            content
        )
        if update_file(admin_cat_path, updated, dry_run):
            print(f"  ✅ admin/js/admin-catalog.js (APP_VERSION = '{clean_ver}')")
            modified_count += 1
        else:
            print("  ⏺ admin/js/admin-catalog.js (already up to date)")

    # 5. Update js/shared/utils.js
    utils_path = REPO_ROOT / "js" / "shared" / "utils.js"
    if utils_path.is_file():
        content = utils_path.read_text(encoding="utf-8")
        if re.search(r"const\s+APP_VERSION\s*=\s*'[^']+'", content):
            updated = re.sub(
                r"(const\s+APP_VERSION\s*=\s*')[^']+(';)",
                rf"\g<1>{clean_ver}\g<2>",
                content
            )
        else:
            # Inject constant after introductory comment
            version_block = (
                f"/**\n * Global Application Version (FreshMarket)\n */\n"
                f"const APP_VERSION = '{clean_ver}';\n"
                f"if (typeof window !== 'undefined') window.APP_VERSION = APP_VERSION;\n\n"
            )
            comment_end = content.find("*/")
            if comment_end != -1:
                insert_pos = comment_end + 2
                updated = content[:insert_pos] + "\n\n" + version_block + content[insert_pos:].lstrip()
            else:
                updated = version_block + content

        if update_file(utils_path, updated, dry_run):
            print(f"  ✅ js/shared/utils.js (APP_VERSION = '{clean_ver}')")
            modified_count += 1
        else:
            print("  ⏺ js/shared/utils.js (already up to date)")

    # 6. Update HTML files (Assets ?v=... and Splash screens)
    total_html_assets = 0
    for html_file in HTML_FILES:
        if not html_file.is_file():
            continue
        content = html_file.read_text(encoding="utf-8")

        # 6a. Replace splash screen version
        step1 = SPLASH_VERSION_REGEX.sub(rf"\g<1>v{clean_ver}\g<2>", content)

        # 6b. Replace asset ?v= query parameters
        def repl_asset(match):
            nonlocal total_html_assets
            prefix = match.group(1)
            asset_path = match.group(2)
            suffix = match.group(3)
            total_html_assets += 1
            return f"{prefix}{asset_path}?v={clean_ver}{suffix}"

        step2 = ASSET_TAG_REGEX.sub(repl_asset, step1)

        rel_path = html_file.relative_to(REPO_ROOT)
        if update_file(html_file, step2, dry_run):
            print(f"  ✅ {str(rel_path):<30} (assets & splash updated to ?v={clean_ver})")
            modified_count += 1
        else:
            print(f"  ⏺ {str(rel_path):<30} (already up to date)")

    print("-" * 64)
    status_msg = "Preview completed:" if dry_run else "Successfully completed:"
    print(f"🎉 {status_msg} {modified_count} files synchronized ({total_html_assets} asset references updated).")
    print("=" * 64 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="FreshMarket Version Synchronization Tool (bump_version.py)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python3 scripts/bump_version.py --status
  python3 scripts/bump_version.py 1.5.0
  python3 scripts/bump_version.py --patch
  python3 scripts/bump_version.py --minor
  python3 scripts/bump_version.py --dry-run 1.5.0
"""
    )

    parser.add_argument("version", nargs="?", help="Explicit version string (e.g. 1.5.0 or v1.5.0)")
    parser.add_argument("-s", "--status", "--check", action="store_true", help="Show current version status report")
    parser.add_argument("-p", "--patch", action="store_true", help="Bump patch version (e.g. 1.4.9 -> 1.4.10)")
    parser.add_argument("-m", "--minor", action="store_true", help="Bump minor version (e.g. 1.4.9 -> 1.5.0)")
    parser.add_argument("-M", "--major", action="store_true", help="Bump major version (e.g. 1.4.9 -> 2.0.0)")
    parser.add_argument("-n", "--dry-run", action="store_true", help="Simulate execution without modifying files")

    args = parser.parse_args()

    if args.status or (not args.version and not args.patch and not args.minor and not args.major):
        print_status()
        return 0

    canonical = get_canonical_version()

    if args.major:
        target_version = bump_version(canonical, "major")
    elif args.minor:
        target_version = bump_version(canonical, "minor")
    elif args.patch:
        target_version = bump_version(canonical, "patch")
    elif args.version:
        target_version = args.version.strip().lstrip("v")
    else:
        print_status()
        return 0

    apply_version(target_version, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
