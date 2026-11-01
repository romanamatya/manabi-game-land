import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedChampionGames} from '../shared-src/site/champion-visibility.js';
import fs from 'node:fs';
import vm from 'node:vm';

const games=[{id:'alpha',name:'A'},{id:'beta',name:'B'},{id:'gamma',name:'C'}];

test('only independently confirmed published games are eligible for home champions',()=>{
 const statuses=new Map([['alpha','published'],['beta','hidden'],['gamma','preparing']]);
 assert.deepEqual(publishedChampionGames(games,statuses),[games[0]]);
});

test('unknown, missing, and failed reads stay hidden without affecting published games',()=>{
 const statuses=new Map([['alpha','published'],['beta','unknown']]);
 assert.deepEqual(publishedChampionGames(games,statuses),[games[0]]);
});

test('production and preview home entrypoints subscribe per game and fail closed on errors',()=>{
 const production=fs.readFileSync(new URL('../home-data.js',import.meta.url),'utf8');
 const shared=fs.readFileSync(new URL('../shared-src/site/home-data.js',import.meta.url),'utf8');
 for(const source of [production,shared]){
  assert.match(source,/subscribeGame\(game\.id/);
  assert.match(source,/statuses\.set\(game\.id,'unknown'\)/);
  assert.match(source,/publishedChampionGames\(games,statuses\)/);
 }
 for(const file of ['../index.html','../shared-src/site/index.html']){
  const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert(html.indexOf('public-firebase-session.js')<html.indexOf('public-admin-settings.js'));
  assert(html.indexOf('public-admin-settings.js')<html.indexOf('leaderboard.js'));
 }
});

test('a previously hidden game can reappear with its original ranking row after republishing',()=>{
 const oldRow={game:'beta',row:{nickname:'こはる',bestStreak:17}};
 const byGame=new Map([[oldRow.game,oldRow.row]]);
 const statuses=new Map([['alpha','published'],['beta','hidden'],['gamma','preparing']]);
 assert.deepEqual(publishedChampionGames(games,statuses).map(g=>g.id),['alpha']);
 statuses.set('beta','published');
 assert.deepEqual(publishedChampionGames(games,statuses).map(g=>g.id),['alpha','beta']);
 assert.equal(byGame.get('beta'),oldRow.row);
});

test('home rendering filters cards while leaving ranking rows untouched',()=>{
 const children=[];
 const element=()=>({children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},set textContent(value){this.text=value;},get textContent(){return this.text;}});
 const list=element(),document={getElementById:()=>list,createElement:element};
 const window={ManabiProfileCatalog:games,ManabiProfile:{appearanceFor:p=>p.appearance}};
 vm.runInNewContext(fs.readFileSync(new URL('../shared-src/site/leaderboard.js',import.meta.url),'utf8'),{window,document});
 const rows=[{game:'alpha',row:{nickname:'あお',bestStreak:9}},{game:'beta',row:{nickname:'はる',bestStreak:17}}];
 window.ManabiLeaderboard.render([{alphaBestStreak:9,nickname:'あお'},{betaBestStreak:17,nickname:'はる'}],{visibleGames:[games[0]]});
 assert.equal(list.children.length,1);
 assert.equal(list.children[0].children[0].text,'A');
 assert.equal(rows[1].row.bestStreak,17);
 window.ManabiLeaderboard.render([{alphaBestStreak:9,nickname:'あお'},{betaBestStreak:17,nickname:'はる'}],{visibleGames:[games[0],games[1]]});
 assert.equal(list.children.length,2);
 assert.equal(list.children[1].children[0].text,'B');
});

test('production champion cards hide unpublished games and retain their ranking rows',()=>{
 const list={children:[],replaceChildren(...nodes){this.children=nodes;}};
 const element=()=>({children:[],append(...nodes){this.children.push(...nodes);},set textContent(value){this.text=value;}});
 const document={getElementById:()=>list,createElement:element};
 const window={ManabiProfileCatalog:games};
 vm.runInNewContext(fs.readFileSync(new URL('../leaderboard.js',import.meta.url),'utf8'),{window,document});
 const rows=[{game:'alpha',row:{nickname:'あお',bestStreak:9}},{game:'beta',row:{nickname:'はる',bestStreak:17}}];
 window.ManabiLeaderboard.renderChampions(rows,{visibleGames:[games[0]]});
 assert.equal(list.children.length,1);
 window.ManabiLeaderboard.renderChampions(rows,{visibleGames:[games[0],games[1]]});
 assert.equal(list.children.length,2);
 assert.equal(list.children[1].children.at(-1).text,'17問連続');
 assert.equal(rows[1].row.bestStreak,17);
});
