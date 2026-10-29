(()=>{
const names=['ay','bee','see','dee','ee','ef','gee','aitch','eye','jay','kay','el','em','en','oh','pee','cue','ar','ess','tee','you','vee','double you','ex','why','zee'];
function create(synthesis,Utterance,onError=()=>{},AudioCtor,base='../assets/audio/alphabet/'){
 const speechSupported=!!synthesis&&typeof synthesis.speak==='function'&&typeof Utterance==='function',fileSupported=typeof AudioCtor==='function';let player=null,generation=0;
 function cancel(){generation++;if(player){player.pause();try{player.currentTime=0}catch{}player=null}if(speechSupported)synthesis.cancel()}
 function speak(letter){if(!speechSupported){onError();return false}try{const speech=new Utterance(names[letter.charCodeAt(0)-65]);speech.volume=window.ManabiProfile?window.ManabiProfile.profile(window.manabiStorage).volume:1;speech.lang='en-US';speech.rate=.85;speech.pitch=1;const voices=synthesis.getVoices?.()||[];const voice=voices.find(v=>/^en[-_]US$/i.test(v.lang))||voices.find(v=>/^en[-_]/i.test(v.lang));if(voice)speech.voice=voice;speech.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))onError()};synthesis.speak(speech);return true}catch{onError();return false}}
 return {supported:fileSupported||speechSupported,cancel,read(letter){if(!/^[A-Z]$/.test(letter))return false;cancel();if(!fileSupported)return speak(letter);const ticket=generation;let failed=false;const fail=()=>{if(failed||ticket!==generation)return;failed=true;speak(letter)};try{player=new AudioCtor(base+letter+'.mp3');player.volume=window.ManabiProfile?window.ManabiProfile.profile(window.manabiStorage).volume:1;player.preload='none';player.onerror=fail;const playing=player.play();if(playing?.catch)playing.catch(fail);return true}catch{fail();return speechSupported}}};
}
window.AlphabetAudio={create};
})();

