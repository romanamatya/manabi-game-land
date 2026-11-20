(()=>{
 'use strict';
 const profile=window.ManabiProfile;if(!profile)return;
 const rows=profile.playerRows.bind(profile),points=profile.subjectPoints.bind(profile);
 profile.playerRows=player=>rows(player).map(row=>row.id==='missingAlphabet'?{...row,best:Number(player?.missingAlphabetBestStreak)||0}:row);
 profile.subjectPoints=items=>points(items).map(subject=>subject.name==='英語'?{...subject,games:subject.games.filter(g=>g.id==='alphabet').concat(items.filter(g=>g.id==='missingAlphabet')),points:subject.points+items.filter(g=>g.id==='missingAlphabet').reduce((sum,g)=>sum+g.points,0)}:subject);
})();

