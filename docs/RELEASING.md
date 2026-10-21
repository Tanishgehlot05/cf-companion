# Releasing CF Companion

## Version policy

The intended product sequence is:

- `1.0.0`: initial V1 release.
- `1.0.1`: V1 patch containing the reviewer-requested fixes.
- `2.0.0`: first stable V2 release.
- `2.0.1`: backward-compatible V2 bug fix.
- `2.1.0`: backward-compatible V2 feature release.
- `2.1.1`: bug fix after V2.1.0.
- `3.0.0`: a future major release.

Use PATCH for compatible bug fixes, security fixes, and small corrections that
add no functionality. Use MINOR for new backward-compatible functionality. Use
MAJOR for incompatible changes or a deliberately designated new generation.
After publication, never replace a release's contents in place; make a new
version and tag instead.

`extension/metadata.json` is the canonical version source. Its `version-name`
is SemVer without the `v` prefix. Its integer `version` is the GNOME Extensions
revision and must increase beyond the latest accepted/submitted revision for
the production UUID. The latest public EGO submission observed while preparing
this workflow is `1.1 (2)`, so the next V2 submission should use integer `3`.
Confirm the current EGO version before every upload; the website may have
advanced since this note was written.

## Branches

- `main` preserves the existing V1 history and remains the V1 maintenance line.
- `v2-stable` is the V2 development and stable-release line. V2-compatible
  patches and features continue here.
- Create feature branches from `v2-stable`, for example
  `feature/friend-export`, and merge them back through review.
- Do not merge the independent V2 history into V1 `main` just to combine
  repositories. Do not create a V3 branch now.
- When a new major generation is approved, create `v3-development` from the
  selected V2 stable release commit (normally the commit tagged `v2.x.y` that
  V3 is based on). Keep the V2 line available for compatible maintenance.

## Verified history note

The repository has no V1 release tags or GitHub Releases. The GNOME review page
shows V1 version `1` as rejected and the reviewer-fix submission as `1.1 (2)`,
currently unreviewed. The source commits likewise have no `v1.0.0` or
`v1.0.1` SemVer metadata: the initial commit has no `version-name`, and the
review-fix line records `1.1`. Therefore the requested V1 SemVer tags must not
be fabricated or applied to mismatching snapshots. Reconcile the historical
labels before creating those tags. V2 release tags must match the tagged
snapshot's `version-name` exactly.

## Local verification and package build

Run these commands from the V2 repository root. They do not install or enable
the extension:

```sh
for test in tests/*.test.mjs; do node --experimental-default-type=module "$test"; done
for test in tests/*.test.js; do gjs --module "$test"; done
find extension scripts tests -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -n1 node --experimental-default-type=module --check
glib-compile-schemas --strict --dry-run extension/schemas
node --experimental-default-type=module scripts/generate-theme-stylesheet.mjs --check
git diff --check
```

Build and inspect the installable package:

```sh
node --experimental-default-type=module scripts/package-extension.mjs --out-dir=dist
zip_path="dist/cf-companion@Tanishgehlot05.github.io.shell-extension.zip"
node --experimental-default-type=module scripts/check-release.mjs --archive "$zip_path"
unzip -l "$zip_path"
```

The packaging helper reads the production UUID from source metadata, stages
only runtime files, and calls `gnome-extensions pack`. It excludes `tests/`, Git
data, backend code, and development documentation.

## Release procedure

1. Choose the next SemVer release using the policy above.
2. Update `version-name` and increment the GNOME integer `version` in
   `extension/metadata.json`. Add a changelog entry based only on merged code.
3. Review the diff, run every verification command above, and inspect the ZIP.
4. Merge the reviewed changes to `v2-stable` and ensure the worktree is clean.
5. Create an annotated tag whose name exactly matches the metadata:

   ```sh
   git switch v2-stable
   git pull --ff-only origin v2-stable
   node --experimental-default-type=module scripts/check-release.mjs
   git tag -a v2.0.0 -m "CF Companion 2.0.0"
   node --experimental-default-type=module scripts/check-release.mjs --tag v2.0.0
   git push origin v2-stable
   git push origin v2.0.0
   ```

   Replace `v2.0.0` with the chosen release tag. Never force-push a branch or
   tag. If a tag already exists at a different commit, stop and cut a new
   version instead.
6. The `v2.*` GitHub Actions workflow validates and packages the exact tagged
   commit, then attaches the ZIP to a GitHub Release. It does not upload to
   extensions.gnome.org. Upload the inspected ZIP there manually after the
   release and runtime checks are complete.

For example, a V2 bug fix after 2.0.0 becomes 2.0.1; a compatible feature
becomes 2.1.0; a fix after that becomes 2.1.1. A future major generation uses
3.0.0 when the scope or compatibility warrants it.

## Release checks

`scripts/check-release.mjs` always checks metadata, production identity, the
GNOME 46 target, required runtime modules, and optional ZIP contents. Ordinary
development commits may retain a legacy or draft `version-name` while no tag
is being validated. Passing `--tag vX.Y.Z` enables strict SemVer/tag checks,
requires an annotated tag at `HEAD`, and checks that the GNOME integer is
higher than the integer values in earlier V-tags.
