import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('production and preview game saves survive localStorage quota errors',()=>{
  const root=new URL('../',import.meta.url);
  for(const [file,mode,prefix] of [['environment-runtime.js',false,''],['preview/environment-runtime.js',true,'manabi_public_preview_sync_test:']]){
    const local=new Map(),session=new Map();let full=true;
    const localStorage={getItem:k=>local.get(k)??null,setItem(k,v){if(full)throw Error('QuotaExceededError');local.set(k,String(v))},removeItem:k=>local.delete(k)};
    const sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
    const window={MANABI_ENV:{preview:mode},addEventListener(){},dispatchEvent(){}};
    const document={currentScript:{src:'https://example.invalid/environment-runtime.js'},documentElement:{style:{}},addEventListener(){}};
    const location={href:'https://example.invalid/games/alphabet.html?syncTest=1',pathname:'/games/alphabet.html',replace(){}};
    const context={window,document,location,localStorage,sessionStorage,URL,Event:class{},Map};vm.createContext(context);
    vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),context);
    assert.doesNotThrow(()=>window.manabiStorage.setItem('mgl_alphabet','{"streak":2}'));
    assert.equal(window.manabiStorage.getItem('mgl_alphabet'),'{"streak":2}');assert.equal(window.ManabiStorageWarning,true);
    full=false;window.manabiStorage.setItem('mgl_alphabet','{"streak":3}');
    assert.equal(localStorage.getItem(prefix+'mgl_alphabet'),'{"streak":3}');assert.equal(sessionStorage.getItem('manabi_storage_fallback:'+prefix+'mgl_alphabet'),null);
    assert.equal(window.manabiStorage.getItem('mgl_alphabet'),'{"streak":3}');assert.equal(window.ManabiStorageWarning,false);
  }
});
