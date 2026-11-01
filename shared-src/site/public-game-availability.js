(()=>{
 'use strict';
 const CONTROL='button,input,select,textarea,[role="button"]';
 const EXEMPT='a[href],header,nav,aside,#challenge120Gate,#challenge120Status,#publicGameAccessStatus,[data-profile-panel]';
 const SURFACE='main,.layout,.play,[data-game-area]';
 const TIMEOUT_MS=10000;
 function settingStatus(setting){
  if(!setting)return 'published';
  if(['published','preparing','hidden'].includes(setting.status))return setting.status;
  if(setting.published===false)return 'hidden';
  if(setting.status==null||setting.status==='')return 'published';
  return 'hidden';
 }
 function create(documentRef=window.document,{timeoutMs=TIMEOUT_MS}={}){
  let state='checking',attempt=0,timer=null,host=null,retryAction=null,domReady=false;
  const messages={
   checking:'ゲームの公開状態を確認しています。確認中は回答を送信できません。',
   unknown:'公開状態を確認できません。ゲームは開始できません。通信を確認して再試行してください。',
   preparing:'このゲームは公開準備中です。公開までお待ちください。',
   hidden:'このゲームは現在非公開です。'
  };
  function render(){
   if(state==='published'){host?.remove();host=null;return}
   if(!documentRef.body){
    if(!domReady){domReady=true;documentRef.addEventListener('DOMContentLoaded',render,{once:true});}
    return;
   }
   if(!host){host=documentRef.getElementById('publicGameAccessStatus')||documentRef.createElement('section');host.id='publicGameAccessStatus';host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.style.cssText='margin:8px;padding:12px 16px;border:2px solid #b98200;border-radius:12px;background:#fff8df;color:#3d321b;font:16px/1.5 system-ui;position:relative;z-index:10';documentRef.body.insertBefore(host,documentRef.body.firstChild);}
   const text=documentRef.createElement('p');text.textContent=messages[state]||messages.unknown;host.replaceChildren(text);
   if(state==='unknown'&&retryAction){const button=documentRef.createElement('button');button.type='button';button.textContent='もう一度確認';button.addEventListener('click',retryAction);host.append(button);}
  }
  function guard(event){
   if(state==='published')return;
   const target=event.target,control=target?.closest?.(CONTROL);
   if(!control||control.closest?.(EXEMPT)||!control.closest?.(SURFACE))return;
   event.preventDefault();event.stopImmediatePropagation();
  }
  for(const type of ['click','pointerdown','keydown','submit'])documentRef.addEventListener(type,guard,true);
  render();
  function check(readSetting,hooks={}){
   const id=++attempt;if(timer)clearTimeout(timer);state='checking';retryAction=null;render();
   timer=setTimeout(()=>{if(id!==attempt||state!=='checking')return;state='unknown';try{hooks.onTimeout?.()}catch{}retryAction=()=>check(readSetting,hooks);render();},timeoutMs);
   return Promise.resolve().then(readSetting).then(setting=>{
    if(id!==attempt)return 'stale';if(timer)clearTimeout(timer);timer=null;retryAction=null;
    state=settingStatus(setting);render();return state;
   },()=>{
    if(id!==attempt)return 'stale';if(timer)clearTimeout(timer);timer=null;state='unknown';try{hooks.onError?.()}catch{}retryAction=()=>check(readSetting,hooks);render();return state;
   });
  }
  function dispose(){attempt++;if(timer)clearTimeout(timer);for(const type of ['click','pointerdown','keydown','submit'])documentRef.removeEventListener(type,guard,true);host?.remove();host=null;}
  return Object.freeze({check,dispose,get state(){return state}});
 }
 window.ManabiGameAvailability=Object.freeze({create,settingStatus,TIMEOUT_MS});
})();
