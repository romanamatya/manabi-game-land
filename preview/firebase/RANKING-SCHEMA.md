# Preview leaderboard projection (not production)
 
Path: `previewSpark/v1/rankings/{gameId}/players/{authUid}`

One document per authenticated child and game. It contains only:
- `uid`: Firebase anonymous Auth UID (document ID)
- `game`: allowlisted game ID (path ID)
- `nickname`
- `bestStreak`: positive integer, monotonic
- `icon`, `frame`: display IDs only
- `title`, `badge`: display IDs only or null
- `updatedAt`: server timestamp

Points, balances, owned items, purchase receipts, admin fields, answer history, and progress are excluded. Authenticated users can read projections; anonymous Auth users may create/update only their own UID document. Rules reject decreases, identity/path mismatches, unknown games, extra fields, invalid names, and deletes.

This adds a read-only display projection. It does not migrate or alter any existing player profile or local save. The next code step must write this projection from the authenticated player-sync transaction and read it from ranking pages. Firestore Rules must be deployed to the **preview project only** before live reads/writes will be allowed.
