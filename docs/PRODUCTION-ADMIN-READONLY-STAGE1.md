# Production admin stage 1: read-only

This rollout targets only Firebase project `manabi-game-land`. It keeps global backend/player sync, legacy score sync, management mutations, and preview Firebase disabled.

## Verification completed

- Authentication > Sign-in method in the production Console shows Email/Password enabled. No authentication settings were changed.
- The existing `productionAdmin/v1/private/admin` document remains enabled, rename-disabled, and matched to the existing password account. It was not modified.
- The client session check requires `auth_time` to be strictly later than `revocation.after`. An Auth + Firestore Emulator test covers timestamps earlier than, equal to, and later than `auth_time`.
- The candidate Rules preserve the current `/players` and `/productionRankings` blocks. They add direct admin identity reads for the matching password account and deny listing, creating, updating, or deleting admin documents.
- A full read-only copy of the live Rules was saved at `docs/PRODUCTION-FIRESTORE-RULES-BACKUP-2026-10-31.rules` for recovery and comparison.
- The Emulator suite passed 8/8 checks, including unauthorized admin access, write denial, preservation of child player access/write behavior, shared ranking compatibility, and revocation-time validation.

## Current production state

- The revocation document is still absent. Creating `productionAdmin/v1/private/revocation` with an `after` Firestore Timestamp failed in the Firebase Console with a generic “document creation failed” error. No document was written.
- The reviewed admin Rules addition is published to production. It only permits direct identity reads by the matching password-authenticated admin and denies list and all writes/deletes under the admin namespace.
- Production `adminReadOnly` remains false, so the management UI remains gated off.
- No player, ranking, points, possessions, achievement, or challenge data was changed. No preview project was accessed.

## Code behavior and constraints

- Read-only mode exposes only the Players view with UID, nickname, status, last-played time, best streaks, and title IDs.
- The UI does not render points, possessions, appearance, purchase history, audit history, or mutation controls.
- Snapshot/list reads are permitted in the client; mutations and password changes are rejected. Logout only calls Firebase Auth `signOut`.
- Firestore Rules cannot hide fields inside a permitted `/players/{uid}` document. The admin view projects only required fields, but the client SDK still receives the full document. Existing child access to `/players` is preserved.

## Remaining activation steps

1. Create only `productionAdmin/v1/private/revocation` with `{ after: <Firestore Timestamp> }` through an account authorized to write Firestore data. Use a timestamp before the next admin password sign-in.
2. Rules addition is live. The exact prior Rules version remains backed up at `docs/PRODUCTION-FIRESTORE-RULES-BACKUP-2026-10-31.rules`.
3. Set only `adminReadOnly: true` in production config. Keep global backend, player sync, legacy sync, rankings, and challenge flags unchanged.
4. Merge PR #20 and publish GitHub Pages after steps 1–3 succeed.
5. Sign in with the existing password account and verify the read-only player view and logout.
