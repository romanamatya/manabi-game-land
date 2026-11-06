# Missing Alphabet production readiness proposal

Status: proposal only. This file does not enable production behavior.

## Current candidate settings

The production configuration keeps `productionReleaseApproved`, `productionAuthVerified`, `productionRulesApproved`, `rankingSyncEnabled`, and `playerNameSyncEnabled` false. The dedicated `missingAlphabetRankingSyncEnabled` gate is absent or false by default. The new game is absent from `gameIds` and `rankingGameIds`; `playerSyncEnabled` and `legacyScoreSyncEnabled` are also false. These gates remain unchanged until review and explicit approval.

## Proposed changes after Rules review and approval

| Setting | Proposed value | Scope |
| --- | --- | --- |
| `gameIds` | Add `missingAlphabet` | Adds only this game to the production catalog. |
| `rankingGameIds` | Add `missingAlphabet` | Allows the dedicated missing-alphabet ranking module to use its game path. |
| `rankingSyncEnabled` | Keep `false` | This is global. On existing production pages, `home-data.js` starts `ranking-sync-client.js`, whose writer can publish local records for the existing game list. |
| `playerNameSyncEnabled` | Keep `false` | Also global. The new-game path uses the existing identity-link lookup only within its scoped client. |
| `missingAlphabetRankingSyncEnabled` | `true` only after approval | New per-game gate. Its client allowlist is locked to `missingAlphabet`; it also requires that game in `gameIds` and `rankingGameIds`. |
| `challenge120GameIds` | Add only `missingAlphabet` | Enables the 120-second challenge for this game alone while `challenge120Enabled` stays `false`; its storage key already includes the game ID. |
| `challenge120Enabled` | Keep `false` | This is the legacy global challenge switch. Enabling it would affect other games. |
| `productionAuthVerified` | `true` after verification | Release gate. |
| `productionRulesApproved` | `true` after Rules approval | Release gate. |
| `productionReleaseApproved` | `true` after all release checks | Activates the production build. |
| `playerSyncEnabled` | Keep `false` | Avoids enabling the separate profile/points sync service. |
| `legacyScoreSyncEnabled` | Keep `false` | Avoids enabling the legacy score writer used by other games. |

`challenge120Enabled` is currently absent, so the production runtime defaults it to false. Turning it on is a global setting for all games, not a missing-alphabet-only switch; it must remain off unless its effect on the existing games is separately accepted. The scoped ranking gate and client allowlist are implemented in this PR, but the production flag stays false until the Rules and release are approved. The publication proposal does not change any Firestore document or existing game availability state.

`playerSyncEnabled` also remains false. The candidate Rules permit the new best-streak profile field, but the current release-gated game path does not write `missingAlphabetBestStreak` to the production `players` collection. Its saved game best remains local, while shared ranking uses the separate ranking document. If a server profile field write is required, it needs an isolated, separately tested client path before release; this proposal does not turn on the existing global player-sync service.

## Rules candidate

`firebase/production-console-backup-20261104.rules` is an exact copy of the Rules text supplied for this review (SHA-256 `892038a6b25f2aa61fc754e0c40ea485bf304252ffaef84a69232aefe9ea8c5b`).
