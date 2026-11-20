return {
 canonicalPrompt(p) { if (p?.id !== 'one') throw Error('invalid-question'); return {id:p.id}; },
 correct(p, answer) { return p.id==='one' && answer===1; }
};