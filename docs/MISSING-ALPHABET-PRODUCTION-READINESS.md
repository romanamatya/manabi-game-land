# Missing Alphabet production readiness proposal

Status: proposal only. This file does not enable production behavior.

## Current candidate settings

`environments/production.json` keeps `productionReleaseApproved`, `productionAuthVerified`, `productionRulesApproved`, `rankingSyncEnabled`, and `playerNameSyncEnabled` false. The new game is absent from `gameIds` and `rankingGameIds`; `playerSyncEnabled` and `legacyScoreSyncEnabled` are also false. These gates remain unchanged until review and explicit approval.

## Proposed changes after Rules review and approval

| Setting | Proposed value | Scope |
| --- | --- | --- |
| `gameIds` | Add `missingAlphabet` | Adds only this game to the production catalog. |
| `rankingGameIds` | Add `missingAlphabet` | Allows the dedicated missing-alphabet ranking module to use its game path. |
| `rankingSyncEnabled` | Keep `false` for now | This is global. On existing production pages, `home-data.js` starts `ranking-sync-client.js`, whose writer can publish local records for the existing game list. Enabling it for this game could therefore publish old local records for other games. |
| `playerNameSyncEnabled` | Keep `false` for now | Also global. Do not enable until the new game's ranking path is isolated from existing game writers. |
| `productionAuthVerified` | `true` after verification | Release gate. |
| `productionRulesApproved` | `true` after Rules approval | Release gate. |
| `productionReleaseApproved` | `true` after all release checks | Activates the production build. |
| `playerSyncEnabled` | Keep `false` | Avoids enabling the separate profile/points sync service. |
| `legacyScoreSyncEnabled` | Keep `false` | Avoids enabling the legacy score writer used by other games. |

`challenge120Enabled` is currently absent, so the production runtime defaults it to false. Turning it on is a global setting for all games, not a missing-alphabet-only switch; it must remain off unless its effect on the existing games is separately accepted. The Rules patch alone is not sufficient to activate the new game's shared ranking safely: a per-game scoped client gate (or equivalent isolation) must be added and tested before any ranking flag is enabled. The publication proposal does not change any Firestore document or existing game availability state.

`playerSyncEnabled` also remains false. The candidate Rules permit the new best-streak profile field, but the current release-gated game path does not write `missingAlphabetBestStreak` to the production `players` collection. Its saved game best remains local, while shared ranking uses the separate ranking document. If a server profile field write is required, it needs an isolated, separately tested client path before release; this proposal does not turn on the existing global player-sync service.

## Rules candidate

`firebase/production-console-backup-20261104.rules` is an exact copy of the Rules text supplied for this review (SHA-256 `892038a6b25f2aa61fc754e0c40ea485bf304252ffaef84a69232aefe9ea8c5b`).
