import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'cf-companion-release-check-'));

function run(command, args, cwd, expectedStatus = 0) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, expectedStatus,
        `${command} ${args.join(' ')} expected exit ${expectedStatus}, got ${result.status}\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
}

function setVersion(versionName, integerVersion) {
    const metadataPath = join(fixtureRoot, 'extension/metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    metadata['version-name'] = versionName;
    metadata.version = integerVersion;
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function commitAndTag(tag, message) {
    run('git', ['add', 'extension/metadata.json'], fixtureRoot);
    run('git', ['commit', '-m', message], fixtureRoot);
    run('git', ['tag', '-a', tag, '-m', tag], fixtureRoot);
}

try {
    mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
    cpSync(join(sourceRoot, 'extension'), join(fixtureRoot, 'extension'), { recursive: true });
    cpSync(join(sourceRoot, 'scripts/check-release.mjs'), join(fixtureRoot, 'scripts/check-release.mjs'));

    run('git', ['init', '-q'], fixtureRoot);
    run('git', ['config', 'user.name', 'Release validation test'], fixtureRoot);
    run('git', ['config', 'user.email', 'release-test@example.invalid'], fixtureRoot);
    run('git', ['add', '.'], fixtureRoot);
    run('git', ['commit', '-m', 'Development fixture'], fixtureRoot);

    const checker = join(fixtureRoot, 'scripts/check-release.mjs');
    run('node', ['--experimental-default-type=module', checker], fixtureRoot);

    setVersion('2.0.0', 3);
    commitAndTag('v2.0.0', 'Release 2.0.0');
    run('node', ['--experimental-default-type=module', checker, '--tag', 'v2.0.0'], fixtureRoot);

    setVersion('2.0.1', 3);
    commitAndTag('v2.0.1', 'Release 2.0.1 with conflicting integer');
    run('node', ['--experimental-default-type=module', checker, '--tag', 'v2.0.1'], fixtureRoot, 1);

    setVersion('2.0.2', 4);
    commitAndTag('v2.0.2', 'Release 2.0.2');
    run('node', ['--experimental-default-type=module', checker, '--tag', 'v2.0.2'], fixtureRoot);

    console.log('release validation tests passed');
} finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
}
