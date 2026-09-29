#!/usr/bin/env node
/**
 * FreshMarket Version Bumper Script
 * Usage:
 *   node bump.js patch   -> 1.3.0 -> 1.3.1
 *   node bump.js minor   -> 1.3.0 -> 1.4.0
 *   node bump.js major   -> 1.3.0 -> 2.0.0
 *   node bump.js 1.3.5   -> sets to 1.3.5
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const appJsPath = path.join(rootDir, 'app.js');
const indexHtmlPath = path.join(rootDir, 'index.html');
const manifestPath = path.join(rootDir, 'manifest.json');

const arg = (process.argv[2] || 'patch').toLowerCase().trim();

if (arg === '--help' || arg === '-h') {
  console.log(`
FreshMarket Version Bumper
--------------------------
Usage:
  node bump.js patch    (e.g., 1.3.0 -> 1.3.1)
  node bump.js minor    (e.g., 1.3.0 -> 1.4.0)
  node bump.js major    (e.g., 1.3.0 -> 2.0.0)
  node bump.js <semver> (e.g., node bump.js 1.3.5)
  `);
  process.exit(0);
}

// 1. Read current version from app.js
if (!fs.existsSync(appJsPath)) {
  console.error('[Error] app.js not found at ' + appJsPath);
  process.exit(1);
}

let appJsContent = fs.readFileSync(appJsPath, 'utf8');
const versionMatch = appJsContent.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!versionMatch) {
  console.error('[Error] Could not find const APP_VERSION in app.js');
  process.exit(1);
}

const currentVersion = versionMatch[1];
const semverParts = currentVersion.split('.').map(n => parseInt(n, 10) || 0);

while (semverParts.length < 3) semverParts.push(0);

let [major, minor, patch] = semverParts;
let nextVersion = '';

if (arg === 'patch') {
  nextVersion = `${major}.${minor}.${patch + 1}`;
} else if (arg === 'minor') {
  nextVersion = `${major}.${minor + 1}.0`;
} else if (arg === 'major') {
  nextVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/.test(arg)) {
  nextVersion = arg.replace(/^v/, '');
} else {
  console.error(`[Error] Invalid version or command "${arg}". Use patch, minor, major, or explicit semver like 1.3.5`);
  process.exit(1);
}

console.log(`Bumping FreshMarket version: v${currentVersion} -> v${nextVersion}`);

// 2. Update app.js
appJsContent = appJsContent.replace(
  /const\s+APP_VERSION\s*=\s*['"][^'"]+['"]/,
  `const APP_VERSION = '${nextVersion}'`
);
fs.writeFileSync(appJsPath, appJsContent, 'utf8');
console.log(`  [Updated] app.js (const APP_VERSION = '${nextVersion}')`);

// 3. Update index.html
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');

  // Update splash version
  html = html.replace(
    /(<div class="splash-version"[^>]*>)([^<]*)(<\/div>)/,
    `$1v${nextVersion}$3`
  );

  // Update settings footer version
  html = html.replace(
    /(<span id="settingsAppVersion"[^>]*>)([^<]*)(<\/span>)/,
    `$1v${nextVersion}$3`
  );

  // Update cache busting queries
  html = html.replace(
    /href="style\.css\?v=[^"]*"/g,
    `href="style.css?v=v${nextVersion}"`
  );
  html = html.replace(
    /src="app\.js\?v=[^"]*"/g,
    `src="app.js?v=v${nextVersion}"`
  );

  fs.writeFileSync(indexHtmlPath, html, 'utf8');
  console.log(`  [Updated] index.html (splash, settings footer, and asset query strings)`);
}

// 4. Update manifest.json
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = nextVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`  [Updated] manifest.json (version: "${nextVersion}")`);
  } catch (e) {
    console.warn('  [Skipped] manifest.json could not be updated:', e.message);
  }
}

console.log(`\nVersion successfully bumped to v${nextVersion} across all files!`);
