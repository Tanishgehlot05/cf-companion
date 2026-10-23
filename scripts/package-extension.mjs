#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repoRoot, 'extension');
const runtimeRootFiles = ['extension.js', 'metadata.json', 'prefs.js', 'stylesheet.css'];
const runtimeDirectories = new Map([
    ['icons', new Set(['.svg'])],
    ['prefs', new Set(['.js'])],
    ['schemas', new Set(['.xml'])],
    ['services', new Set(['.js'])],
    ['ui', new Set(['.js'])],
    ['utils', new Set(['.js'])],
]);

function fail(message) {
    console.error(`Package build failed: ${message}`);
    process.exit(1);
}

const args = process.argv.slice(2);
let outputDirectory = resolve(repoRoot, 'dist');
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir' || args[i].startsWith('--out-dir=')) {
        const value = args[i] === '--out-dir' ? args[++i] : args[i].slice('--out-dir='.length);
        if (!value)
            fail('--out-dir requires a path');
        outputDirectory = resolve(repoRoot, value);
    } else {
        fail(`unknown argument ${args[i]}`);
    }
}

const metadata = JSON.parse(readFileSync(join(sourceRoot, 'metadata.json'), 'utf8'));
if (metadata.uuid !== 'cf-companion@Tanishgehlot05.github.io')
    fail(`refusing to package non-production UUID ${metadata.uuid ?? '(missing)'}`);
for (const file of runtimeRootFiles) {
    if (!existsSync(join(sourceRoot, file)))
        fail(`required runtime file is missing: ${file}`);
}

const stagingRoot = mkdtempSync(join(tmpdir(), 'cf-companion-package-'));
const stagingExtension = join(stagingRoot, 'extension');
mkdirSync(stagingExtension);

function copyRuntimeFiles(sourceDirectory, destinationDirectory, allowedExtensions) {
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
        if (entry.isDirectory())
            continue;
        const sourcePath = join(sourceDirectory, entry.name);
        const destinationPath = join(destinationDirectory, entry.name);
        if (!entry.isFile() || !allowedExtensions.has(extname(entry.name)))
            continue;
        cpSync(sourcePath, destinationPath);
    }
}

try {
    for (const file of runtimeRootFiles)
        cpSync(join(sourceRoot, file), join(stagingExtension, file));
    for (const [directory, allowedExtensions] of runtimeDirectories) {
        const sourceDirectory = join(sourceRoot, directory);
        if (!statSync(sourceDirectory).isDirectory())
            fail(`runtime directory is missing: ${directory}`);
        const destinationDirectory = join(stagingExtension, directory);
        mkdirSync(destinationDirectory);
        copyRuntimeFiles(sourceDirectory, destinationDirectory, allowedExtensions);
    }

    mkdirSync(outputDirectory, { recursive: true });
    const result = spawnSync('gnome-extensions', [
        'pack', stagingExtension,
        '--force',
        `--out-dir=${outputDirectory}`,
        '--extra-source=services',
        '--extra-source=ui',
        '--extra-source=utils',
        '--extra-source=prefs',
        '--extra-source=icons',
        '--schema=schemas/org.gnome.shell.extensions.cf-companion.gschema.xml',
    ], { cwd: repoRoot, encoding: 'utf8' });
    if (result.error || result.status !== 0)
        fail(result.error?.message ?? (result.stderr.trim() || 'gnome-extensions pack failed'));
    const archive = join(outputDirectory, `${metadata.uuid}.shell-extension.zip`);
    console.log(archive);
} finally {
    rmSync(stagingRoot, { recursive: true, force: true });
}
