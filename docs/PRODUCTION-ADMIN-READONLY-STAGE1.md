# Production admin stage 1: read-only rollout proposal

This proposal targets only Firebase project `manabi-game-land`. It does not enable global backend/player sync, legacy score sync, management mutations, or preview Firebase. The production feature flag remains off until the Firebase changes below are reviewed and applied.

## Code behavior

- The admin client accepts a separate production-only `adminReadOnly` gate while requiring `enabled: false` and `productionReleaseApproved: true`.
- Read-only mode exposes only the Players view. Returned UI rows contain UID, nickname, status, last-played timestamp, best streaks, and title IDs.
- The UI does not render points, possessions, appearance, purchase history, admin history, or management controls.
- Only snapshot/list reads are accepted. All mutation actions and password changes are rejected in the client. Logout calls Firebase Auth `signOut` locally and writes no revocation document.
- Existing `/players` and `/productionRankings` rule blocks are copied unchanged into `firebase/production-admin-readonly-stage1.rules`. The new admin rule permits only direct reads of the `admin` and `revocation` identity documents by a password-authenticated user whose UID matches an enabled admin record. It denies list and all writes/deletes.
- This candidate Rules file is not referenced by `firebase.json`; merging the code does not publish Firebase Rules or change live project access.

## Required Firebase Console work before enabling

1. Confirm Authentication > Sign-in method > Email/Password is enabled. The existing admin Auth account was visible as an Email provider user, but the provider settings page did not allow a read-only confirmation because the current Console account lacks owner-level permission.
2. In Firestore, create/update only these two admin identity documents (never a player document):
   - `productionAdmin/v1/private/admin`: `{ uid: <UID of the existing admin-production email account>, enabled: true, renameEnabled: false }`
   - `productionAdmin/v1/private/revocation`: `{ after: <Firestore Timestamp set before the next login> }`
3. Publish the reviewed candidate Rules by merging only the `productionAdmin/v1/private/{documentId}` addition into the current production Rules. Preserve the existing `/players` and `/productionRankings` blocks byte-for-byte. Do not use preview Rules or deploy an all-file replacement without comparing the live Console Rules.
4. After Rules and documents are in place, set only `adminReadOnly: true` in the production environment config. Keep `enabled: false`, `playerSyncEnabled: false`, `legacyScoreSyncEnabled: false`, `rankingSyncEnabled: true`, and `challenge120Enabled: true` unchanged.
5. Sign in with the existing password account after setting the revocation timestamp; verify player rows and local logout. No child data should be edited.

## Security limitations

Firestore Rules cannot hide individual fields within a document. An authorized read of a `/players/{uid}` document returns all fields in that document to the admin client even though the stage-1 UI projection discards private fields immediately. If field-level minimization is required, a separately designed server-side projection would be necessary and is outside this read-only client-only stage.

## Existing player-read rule

The live `/players/{playerId}` rule currently allows reads for any Firebase-authenticated user (`request.auth != null`), which includes the game's anonymous-authenticated child clients. The admin page itself additionally requires the password provider, matching enabled role document, and a fresh session. This stage preserves the existing `/players` rule as requested; therefore the new admin namespace is restricted, but raw `/players` document reads are not admin-only at the Firestore layer. Tightening that existing rule needs a separate compatibility review of all game callers before deployment.
