# Corrected common build — 2026-10-29

Preparation only. Do not republish the invalid b16b799b5c1d / 90-file package.

- Corrected build: corrected-401602e10d6a
- Exact patch: 88 files
- Package digest: 07967a5374f3220ac76bfa9f5f0e75c0a05ba049a85709ade7d5bbdb3187df29
- Production baseline: 5505a58d2ca17ce0cb3bc78684983613694e81cd
- This baseline has TEN games, not eight. The common migration covers the original eight; the two math games published afterward are retained byte-for-byte in nine files, with their existing menu cards and device-only records. They must not disappear during migration.

## Reproduce

1. Check out the baseline under `.release/current-production` (git worktree, detached).
2. `npm run build:both`
3. `node tools/rebuild-corrected-production.mjs`
4. `npm test`
5. `node tools/check-site.mjs`

The default production build remains blocked. The runnable candidate is generated separately under `.release/corrected-production`; its manifest does not authorize publication. `renameEnabled` is not enabled, admin access remains disabled and general player sync remains off. No Firebase operations are performed by these tools.

## Dependency protection

The profile registry is evaluated to enumerate runtime-generated image paths. The four starter PNGs are included in the forward patch, as well as the complete verified site. HTML links/scripts/images, CSS URLs, static imports/fetches and literal asset URLs are recursively checked against the reconstructed deployment tree. Every patched dependency is checked against the actual upload bytes and SHA256, not merely file existence. The production build removes a link to an excluded kotowaza review page. Invalid PNG signatures fail validation; a separate PIL decode verified 63 raster images, including all four 512x512 starter PNGs.

141 dependency files and 72 materialized profile assets were checked. All 60 automated tests passed, covering record retention, 700-answer history, ownership, titles, wallet conflicts, duplicate grants and rollback. This is isolated-data validation, not live positive-score Firestore testing.

## Rollback

Before publishing, verify current target hashes against every `beforeSHA256` in RELEASE.json. Any drift stops the release. Apply only the manifest-listed 88 paths. Files with a previous hash have byte-for-byte backups under `package/rollback`; newly introduced paths have a null before hash. On failure, restore previous files and remove only manifest-listed newly added files, after validating the deployed after hashes. Do not clear browser storage, change Firestore documents, publish Rules, change Authentication or alter administrator permissions. Offline forward application and reverse application were verified for all 88 paths.

## Remaining approval boundary

Production re-publication needs new approval for this build ID, file list and package digest. Prior approval for b16b799b5c1d is invalid for this corrected migration. The isolated preview uses a dedicated test storage prefix and disables Firebase access; it is not the production runtime configuration. No live positive-record Firestore test is claimed.

## Browser verification completed

Isolated preview URL: https://romanamatya.github.io/manabi-game-land/preview/qa/corrected-common-401602e10d6a/index.html?adminTest=1

Preview-only commit a32174ecaa0720bb5410b50e9e6863a365be936c changed 141 paths strictly under preview/qa. GitHub Pages run 40868195380 succeeded. Production root files were not changed.

The original eight game pages started and rendered their questions. Answer interaction was verified in all eight (arithmetic reduction, two-stage distribution, expression input, exchange/association, alphabet, proverb and both map games). All four starter icons loaded with natural dimensions 512x512 in the icon selector. The fixture math balance 123 and existing best 700 survived navigation/reload. Test mode deliberately suppresses points and Firebase writes. Positive point grants and retention of titles/ownership are covered by isolated automated tests, not production child-data operations.

Candidate branch: corrected-common-401602e10d6a-candidate
Candidate commit: ddbf1ad7c0163cbb975e26d7f881c58af8468658
Candidate tree: d6252e0aa25b3b2d04c854cdc3d2a9e5879132d5
The candidate is not merged to main and not published as production.
