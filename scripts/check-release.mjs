#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = resolve(repoRoot, 'extension');
const metadataPath = resolve(extensionRoot, 'metadata.json');
const productionUuid = 'cf-companion@Tanishgehlot05.github.io';
const schemaId = 'org.gnome.shell.extensions.cf-companion';
const requiredFiles = [
    'extension.js',
    'prefs.js',
    'stylesheet.css',
    'schemas/org.gnome.shell.extensions.cf-companion.gschema.xml',
    'services/contestService.js',
    'services/codeforcesUserService.js',
    'services/friendsService.js',
    'ui/panel.js',
    'utils/time.js',
    'utils/reminderService.js',
    'utils/timerManager.js',
    'utils/themes.js',
    'icons/codeforces.svg',
    'icons/codeforces-inverse.svg',
];
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(message) {
    console.error(`Release check failed: ${message}`);
    process.exit(1);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', ...options });
    if (result.error || result.status !== 0)
        fail(result.error?.message ?? result.stderr.trim() ?? `${command} failed`);
    return result.stdout.trim();
}

function readTagMetadata(tag) {
    const json = run('git', ['show', `${tag}:extension/metadata.json`], { cwd: repoRoot });
    try {
        return JSON.parse(json);
    } catch {
        fail(`tag ${tag} has invalid metadata.json`);
    }
}

const args = process.argv.slice(2);
let requestedTag = null;
let archivePath = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag')
        requestedTag = args[++i] ?? null;
    else if (args[i] === '--archive')
        archivePath = args[++i] ?? null;
    else
        fail(`unknown argument ${args[i]}`);
}
if (args.includes('--tag') && !requestedTag)
    fail('--tag requires a value');
if (args.includes('--archive') && !archivePath)
    fail('--archive requires a path');

if (!existsSync(metadataPath))
    fail('extension/metadata.json is missing');

let metadata;
try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
} catch (error) {
    fail(`metadata.json is not valid JSON: ${error.message}`);
}

if (metadata.uuid !== productionUuid)
    fail(`expected production UUID ${productionUuid}, found ${metadata.uuid ?? '(missing)'}`);
if (!Number.isSafeInteger(metadata.version) || metadata.version < 1)
    fail('metadata.version must be a positive integer');
if (typeof metadata['version-name'] !== 'string' || metadata['version-name'].trim() === '')
    fail('metadata.version-name must be a non-empty string');
if (!Array.isArray(metadata['shell-version']) || !metadata['shell-version'].includes('46'))
    fail('metadata.shell-version must include GNOME Shell 46');
if (metadata['settings-schema'] !== schemaId)
    fail(`metadata.settings-schema must be ${schemaId}`);

for (const relativePath of requiredFiles) {
    if (!existsSync(resolve(extensionRoot, relativePath)))
        fail(`required runtime file is missing: extension/${relativePath}`);
}
const schemaText = readFileSync(resolve(extensionRoot, requiredFiles[3]), 'utf8');
if (!schemaText.includes(`<schema id="${schemaId}"`))
    fail(`GSettings schema does not define ${schemaId}`);

if (requestedTag) {
    const expectedTag = `v${metadata['version-name']}`;
    if (!semverPattern.test(metadata['version-name']))
        fail(`version-name ${metadata['version-name']} is not SemVer`);
    if (requestedTag !== expectedTag)
        fail(`tag ${requestedTag} does not match version-name ${metadata['version-name']}`);

    const tagObject = run('git', ['cat-file', '-t', `refs/tags/${requestedTag}`], { cwd: repoRoot });
    if (tagObject !== 'tag')
        fail(`${requestedTag} must be an annotated tag`);
    const tagCommit = run('git', ['rev-parse', `${requestedTag}^{commit}`], { cwd: repoRoot });
    const headCommit = run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    if (tagCommit !== headCommit)
        fail(`${requestedTag} does not point to HEAD`);

    const previousVersions = [];
    const tags = run('git', ['tag', '--list', '--sort=version:refname'], { cwd: repoRoot })
        .split('\n').filter(tag => tag && tag !== requestedTag && /^v\d+\.\d+\.\d+/.test(tag));
    for (const tag of tags) {
        const taggedMetadata = readTagMetadata(tag);
        if (!Number.isSafeInteger(taggedMetadata.version) || taggedMetadata.version < 1)
            fail(`${tag} has invalid integer metadata.version`);
        previousVersions.push(taggedMetadata.version);
    }
    const priorMaximum = Math.max(0, ...previousVersions);
    if (metadata.version <= priorMaximum)
        fail(`metadata.version ${metadata.version} must be greater than prior tagged revision ${priorMaximum}`);
}

if (archivePath) {
    const absoluteArchive = resolve(repoRoot, archivePath);
    if (!existsSync(absoluteArchive))
        fail(`package archive is missing: ${archivePath}`);
    const entries = new Set(run('unzip', ['-Z1', absoluteArchive]).split('\n').filter(Boolean));
    for (const relativePath of requiredFiles) {
        if (!entries.has(relativePath))
            fail(`package is missing required file ${relativePath}`);
    }
    const forbiddenEntry = [...entries].find(entry =>
        /(^|\/)(\.git|tests?|docs?|backend|node_modules)(\/|$)|(^|\/)README\.md$|gschemas\.compiled$|\.zip$/i.test(entry));
    if (forbiddenEntry)
        fail(`package contains development-only content: ${forbiddenEntry}`);
    const packagedMetadataText = run('unzip', ['-p', absoluteArchive, 'metadata.json']);
    let packagedMetadata;
    try {
        packagedMetadata = JSON.parse(packagedMetadataText);
    } catch {
        fail('packaged metadata.json is invalid');
    }
    if (packagedMetadata.uuid !== productionUuid || packagedMetadata.version !== metadata.version ||
        packagedMetadata['version-name'] !== metadata['version-name'])
        fail('packaged metadata does not match the production source metadata');
}

console.log(`Release metadata valid: ${metadata['version-name']} (GNOME revision ${metadata.version})`);
if (requestedTag)
    console.log(`Annotated tag valid: ${requestedTag}`);
if (archivePath)
    console.log(`Production package valid: ${archivePath}`);
