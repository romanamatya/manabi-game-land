// Preview rollout only. Historical ranking files/data are kept, but their routes and
// script entry points cannot start ranking work in the retired release.
export function removeElements(html, predicate) {
  const tokens = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[A-Za-z][^>]*>/gi;
  const voids = new Set(['meta','link','img','input','br','hr','source','wbr','area','base','embed','param','track','col']);
  let match, skip = [], result = '', cursor = 0;
  while ((match = tokens.exec(html))) {
    const raw=match[0], tag=raw.match(/^<\/?([\w-]+)/)?.[1]?.toLowerCase();
    if (!skip.length) result += html.slice(cursor, match.index);
    const closing=/^<\//.test(raw), whole=/^<(script|style)\b/i.test(raw);
    if (skip.length) {
      if (!whole && tag===skip.at(-1)) { if (closing) skip.pop(); else if(!voids.has(tag)&&!raw.endsWith('/>'))skip.push(tag); }
    } else if (!closing && predicate(raw,tag)) {
      if(!whole&&!voids.has(tag)&&!raw.endsWith('/>'))skip.push(tag);
    } else result+=raw;
    cursor=tokens.lastIndex;
  }
  if(!skip.length)result+=html.slice(cursor);
  if(skip.length)throw Error('unbalanced-retired-ui:'+skip.join(','));
  return result;
}
export function transformTitleMode(file, text, config, collectionPage) {
  if (!config.rankingsRetired || !file.endsWith('.html')) return text;
  if (/(?:^|\/)(ranking|summary-ranking)\.html$/.test(file)) text=collectionPage;
  const names=['leaderboard','social-score-sync','missing-alphabet-ranking-sync','parallel-ranking','ranking-page','summary-ranking','new-game-badge'];
  text=removeElements(text,(raw,tag)=>
    tag==='script'&&names.some(name=>new RegExp('src="(?:\\.\\./)?'+name+'\\.js(?:[?" ])').test(raw))
    || /\bdata-game-ranking\b|\bdata-profile-panel="ranking"/.test(raw)
    || /\bclass="[^"]*\brank-button\b/.test(raw)
    || /\bid="(?:ranking-open|ranking-close|ranking-refresh|line-ranking|parallel-ranking|parallel-ranking-status)"/.test(raw));
  if(file==='index.html'){
    text=text.replace(/<section class="leaderboard" id="leaderboard">[\s\S]*?<\/section>/,'<section id="titleCollectionHome" aria-live="polite"></section>');
    for(const [page,id] of [['japanese','japanese'],['math','math'],['social','social'],['science','science'],['language','english']])text=text.replace('class="card subject-card" href="'+page+'.html"','class="card subject-card" data-subject-card="'+id+'" href="'+page+'.html"');
  }
  if(/^(index|math|math-calculation|math-geometry|japanese|social|science|language|ranking|titles|summary-ranking)\.html$/.test(file)){
    if(!text.includes('href="title-collection.css"'))text=text.replace('</head>','<link rel="stylesheet" href="title-collection.css"><script type="module" src="title-collection.js?v=collection-v1"></script></head>');
    // Legacy home closes the head implicitly; make the insertion explicit there.
    if(!text.includes('src="title-collection.js'))text=text.replace('<body','<link rel="stylesheet" href="title-collection.css"><script type="module" src="title-collection.js?v=collection-v1"></script><body');
  }
  return text;
}
