// The public per-game row intentionally uses one score across practice and
// 120-second challenge results. Challenge-season-only device boards stay local.
export function bestSharedScore(profileRecord, challengeState) {
 let best=Math.max(0,Number(profileRecord?.best)||0);
 for(const score of Object.values(challengeState?.bests||{}))if(Number.isSafeInteger(score))best=Math.max(best,score);
 if(Number.isSafeInteger(challengeState?.attemptBest))best=Math.max(best,challengeState.attemptBest);
 return best;
}
