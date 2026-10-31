# Production admin stage 1 deployment

Project scope: `manabi-game-land` only.

## Checked

- Email/Password is enabled in Authentication > Sign-in method. No provider setting was changed.
- The existing `productionAdmin/v1/private/admin` role remains enabled and rename-disabled; its user ID matches the existing password account.
- The client accepts a session only when Firebase Auth `auth_time` is strictly later than the Firestore `revocation.after` timestamp. Emulator coverage checks older, equal, and later timestamps.
- The candidate Rules preserve the existing `/players` and `/productionRankings` policies. Admin identity reads are limited to a matching password user; client-side listing and all writes/deletes are denied.
- 8/8 Auth + Firestore Emulator tests pass.

## Not yet applied in production

- The Console rejected creation of `productionAdmin/v1/private/revocation` with a generic document-creation error. It remains absent.
- The reviewed admin Rules addition has been published. The existing `/players` and `/productionRankings` behavior was preserved; the new admin namespace allows only matching password-authenticated identity reads and denies listing and client writes/deletes.
- `adminReadOnly` remains false. The production management UI is not enabled.
- No child profile, ranking, points, possession, achievement, or challenge record was changed.

The exact Rules read from the production Console are backed up in `PRODUCTION-FIRESTORE-RULES-BACKUP-2026-10-31.rules`. Before enabling the feature, create the revocation document with an authorized Firestore data writer, then change only `adminReadOnly` to true and publish the site.
