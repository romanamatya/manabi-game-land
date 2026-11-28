// Education Publishing grade 4, pp.144–149: heat travels from the heated part.
export const GAME = 'metalHeat';
export const WEIGHTS = Object.freeze({ first: 4, order: 4, predict: 4, ink: 4, method: 3, safety: 1 });
const labels = { first:'最初の場所', order:'あたたまる順番', predict:'結果の予想',
  ink:'し温インク', method:'器具と方法', safety:'安全と結果' };

const points = ['ア','イ','ウ','エ'];
const boards = [
  ['rod','左のはし', [10,50], [[24,50],[43,50],[64,50],[83,50]]],
  ['rod','右のはし', [90,50], [[12,50],[34,50],[54,50],[75,50]]],
  ['rod','中央', [50,50], [[15,50],[29,50],[43,50],[74,50]]],
  ['plate','左の角', [10,18], [[21,24],[39,36],[56,46],[75,58]]],
  ['plate','右の角', [90,82], [[18,39],[36,50],[55,60],[74,72]]],
  ['plate','中央', [50,50], [[15,50],[29,50],[43,50],[76,50]]],
  ['plate','上のはし', [50,13], [[50,25],[50,40],[50,58],[50,81]]],
  ['plate','下のはし', [50,87], [[50,20],[50,37],[50,55],[50,72]]],
];
const permutations = a => a.length ? a.flatMap((x,i) => permutations(a.filter((_,j)=>i!==j)).map(rest=>[x,...rest])) : [[]];
const letterOrders=permutations(points);
const distance = ([x,y],[a,b]) => (x-a)**2 + (y-b)**2;
function predictionFrames(heat) {
  const [x,y]=heat;
  const far=x===50&&y===50 ? [13,20] : [100-x,100-y];
  const off=[x<70?x+34:x-34,y<55?y+25:y-25];
  return {
    '近くから広がる図':[[heat,12],[heat,42]],
    '遠くから広がる図':[[far,12],[far,42]],
    '近くで止まる図':[[heat,12],[heat,12]],
    'はなれて広がる図':[[heat,12],[off,32]],
  };
}
const inkFact = 'この図では、し温インクがあたたまると青色からピンク色に変わります。';
const themed = {
  ink:[
    ['この図の見方をたしかめよう。あたたまった部分は何色？','ピンク色',['黄色','緑色','白色'],inkFact,'swatches'],
    ['青色からピンク色に変わった部分では、何が起きた？','温度が上がった',['温度が下がった','温度は変わらなかった','金ぞくがとけた'],inkFact],
    ['し温インクを使うと、何の変化が見つけやすくなる？','金ぞくの温度の変化',['金ぞくの重さの変化','金ぞくの形の変化','金ぞくの向きの変化'],'し温インクは、温度の変化を色で知らせます。'],
    ['熱する場所の近くから順にピンク色になった。何がわかる？','熱した場所から順にあたたまる',['遠い場所から順にあたたまる','全体が同時にあたたまる','熱した場所だけがあたたまる'],'色が変わった順は、その部分があたたまった順を表します。'],
    ['教科書の例で、ピンク色になったし温インクを冷やすと何色になる？','青色',['ピンク色','黄色','緑色'],'教科書で紹介されているし温インクは、冷やすとピンク色から青色にもどります。'],
    ['熱している間、ピンク色の部分が少しずつ広がった。何がいえる？','あたたまった部分が広がった',['金ぞくが動いた','金ぞくがとけた','熱した場所が動いた'],'金ぞくの位置は変わらず、あたたまった部分が広がります。'],
  ],
  method:[
    ['色で温度の変化を見る実験で、金ぞくに何をぬる？','し温インク',['油','のり','絵の具'],'し温インクの色を見ると、あたたまったところがわかります。'],
    ['金ぞくの一部を熱する器具の一つはどれ？','実験用ガスコンロ',['スタンド','ものさし','虫めがね'],'実験用ガスコンロは、金ぞくの一部を熱する器具です。'],
    ['色の変化を調べるとき、熱する前に何をする？','金ぞくにし温インクをぬる',['熱した直後の金ぞくを持つ','観察せずに片づける','結果を決めてから記録する'],'先にし温インクをぬっておくと、熱し始めてから色が変わる順を見られます。'],
    ['金ぞくのあたたまる順をたしかめる記録はどれ？','どこから順に色が変わったか',['金ぞくの重さだけ','教室の広さだけ','器具の数だけ'],'場所と順番を記録すると、どこからあたたまったかがわかります。'],
    ['この実験で調べることはどれ？','金ぞくがどんな順にあたたまるか',['金ぞくの長さ','金ぞくの重さ','金ぞくが光をはね返すか'],'金ぞくの一部を熱して、あたたまる順を調べます。'],
    ['金ぞくのぼうを固定するために使う器具はどれ？','スタンド',['温度計','ストップウォッチ','ものさし'],'スタンドを使うと、金ぞくのぼうを固定できます。'],
  ],
  safety:[
    ['実験が終わった直後、熱した金ぞくはどうする？','よく冷めるまでさわらない',['すぐに手で持つ','熱した場所以外を手で持つ','手でさわって温度を調べる'],'熱した場所からはなれていても熱くなるので、よく冷めるまでさわりません。'],
    ['火を消した直後に金ぞくを手で持たない理由は？','まだ熱く、やけどをするおそれがある',['火を消すと金ぞくが光る','金ぞくの重さが急に変わる','し温インクが光る'],'火を消しても、金ぞくがすぐに冷めるとはかぎりません。'],
    ['金ぞくの一部を熱したときの説明として正しいものは？','熱した場所から順にあたたまる',['全体が同時にあたたまる','熱した場所しかあたたまらない','遠い場所だけが先にあたたまる'],'金ぞくでは、熱した場所から近くの部分へ熱が伝わります。'],
    ['熱した場所からはなれた部分にもさわらないのはなぜ？','熱が伝わり、その部分も熱くなるから',['熱した場所が移動するから','はなれた部分だけが先に冷えるから','金ぞくの形が必ず変わるから'],'見た目で熱さは決められません。実験後はよく冷めるまで待ちます。'],
  ],
};
function buildQuestion(type, variant) {
  if (Object.hasOwn(themed,type)) {
    const [prompt, answer, wrong, explanation, visual] = themed[type][variant];
    return { prompt, answer, options:[answer,...wrong], explanation, visual:visual?{kind:visual}:null };
  }
  if (type === 'predict') {
    const [shape, where, heat] = boards[3+variant];
    const frames=predictionFrames(heat);
    return { prompt:'赤い印を熱したときの、し温インクの変化はどの図？',
      answer:'近くから広がる図', options:Object.keys(frames),
      explanation:'この模式図では、赤い印の近くからピンク色の範囲が広がります。金ぞくは熱した場所の近くからあたたまります。',
      visual:{kind:'predict', shape, where, heat, frames} };
  }
  const [shape, where, heat, positions] = boards[Math.floor(variant/24)];
  const letters = letterOrders[variant%24];
  const sites = positions.slice(0,type==='first'?4:3).map((xy,i)=>({xy,label:letters.filter(l=>type==='first'||l!=='エ')[i]}));
  const order = sites.slice().sort((a,b)=>distance(a.xy,heat)-distance(b.xy,heat)).map(x=>x.label);
  const answer = type==='first'?order[0]:order.join(' → ');
  return { prompt:type==='first'?'赤い印を熱すると、どこが最初にあたたまる？':'赤い印を熱すると、どの順にあたたまる？',
    answer, options:type==='first'?points:permutations(['ア','イ','ウ']).map(p=>p.join(' → ')).filter((option,i,all)=>option===answer||all.filter(x=>x!==answer).indexOf(option)<3),
    explanation:'図のように、同じ金ぞくの一か所を熱すると、近い場所から順にあたたまります。'+order.join(' → ')+' の順です。',
    visual:{kind:'positions',shape,where,heat,sites} };
}
const counts = {first:boards.length*24, order:boards.length*24, predict:5,
  ink:themed.ink.length, method:themed.method.length, safety:themed.safety.length};
const shuffle = (items,random) => {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
};
export function questionFromPrompt({type,variant}={}) {
  if (!Object.hasOwn(counts,type)||!Number.isInteger(variant)||variant<0||variant>=counts[type]) throw Error('invalid-metal-heat-question');
  return {...buildQuestion(type,variant),type,label:labels[type],scorePrompt:{type,variant}};
}
const block=Object.entries(WEIGHTS).flatMap(([type,count])=>Array(count).fill(type));
export function createDeck(random=Math.random) {
  let cycle=[], previousType=null;
  const previousVariant=new Map();
  function fill() {
    const bag=shuffle(block,random);
    // A 20-question block can always separate repeated types because each weight is at most four.
    let last=previousType;
    while(bag.length) {
      const index=bag.findIndex(type=>type!==last);
      if(index<0) {
        const stranded=bag.pop();
        const space=cycle.findIndex((type,i)=>i>0&&type!==stranded&&cycle[i-1]!==stranded);
        cycle.splice(space,0,stranded);
      } else {
        [last]=bag.splice(index,1);
        cycle.push(last);
      }
    }
  }
  return { next() {
    if (!cycle.length) fill();
    const type=cycle.shift();
    const old=previousVariant.get(type);
    let variant=Math.floor(random()*(counts[type]-(old===undefined?0:1)));
    if (old!==undefined&&variant>=old) variant++;
    previousVariant.set(type,variant);
    previousType=type;
    const question=questionFromPrompt({type,variant});
    return {...question,options:shuffle(question.options,random)};
  }};
}
