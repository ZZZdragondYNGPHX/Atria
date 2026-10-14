import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudioHost} from '../../public/scripts/native/frontend/audio.js';
import {frontendFeatureAvailability} from '../../public/shared/native-frontend-contract.js';
import {validateFrontendCapabilities} from '../../src/native/experience-validation.js';
test('bounded audio declares a negotiated feature',()=>{
 const features=[{id:'frontend-audio',version:1,required:true}],graph={resources:[],bridge:{bindings:[{target:{service:'host.media',method:'audioStatus'}}]}};
 assert.equal(frontendFeatureAvailability(features)[0].status,'available');
 assert.throws(()=>validateFrontendCapabilities({features:[]},graph,new Map()),/frontend-audio/);
 validateFrontendCapabilities({features},graph,new Map());
 assert.throws(()=>frontendFeatureAvailability([{...features[0],version:2}]),/Unsupported required/);
});
function harness(){const listeners={},voices=[];const document={hidden:false,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]};let t=0;const window={document,performance:{now:()=>t},requestAnimationFrame:f=>{t+=1000;queueMicrotask(f);return 1},cancelAnimationFrame(){}};const media={async resolve(ref,type){assert.equal(type,'audio');return {url:'blob:'+ref.id}}};const host=createAudioHost({window,document,media,createAudio:()=>{const v={paused:true,playCalls:0,volume:0,async play(){this.paused=false;this.playCalls++},pause(){this.paused=true},removeAttribute(){},load(){},addEventListener(){}};voices.push(v);return v;}});return {host,document,listeners,voices};}
const scene={ambience:[{ref:{kind:'exact',id:'rain'},gain:.6}],events:[{id:'bell',ref:{kind:'exact',id:'bell'},gain:.5}],transitionMs:0};
test('requires a real gesture, plays only armed current event once, restores ambience only',async()=>{
 const {host,voices,listeners}=harness();await host.invoke('setAudioScene',scene,'old');assert.equal(voices.length,1);assert.equal(voices[0].playCalls,0);
 listeners.pointerdown({isTrusted:true,type:'pointerdown'});await host.invoke('enableAudio',{});host.commit('new');await host.invoke('setAudioScene',scene,'new');assert.equal(voices.length,2);assert.equal(voices[1].playCalls,1);
 host.commit('new');await host.invoke('setAudioScene',scene,'new');assert.equal(voices.length,2);host.commit('another');await host.invoke('setAudioScene',scene,'another');assert.equal(voices.length,2);host.reset();await host.invoke('setAudioScene',scene,'new');assert.equal(voices.length,3);assert.equal(voices[2].loop,true);host.dispose();assert(voices.every(v=>v.paused));
});
test('group gain and mute, hidden pause and visible resume remain presentation-only',async()=>{
 const {host,listeners,voices,document}=harness();listeners.keydown({isTrusted:true,type:'keydown'});await host.invoke('enableAudio',{});await host.invoke('setAudioScene',scene,'old');await host.invoke('setAudioPreferences',{muted:false,ambience:.2,effects:.4});assert.equal(voices[0].volume,.12);document.hidden=true;listeners.visibilitychange();assert.equal(host.status().state,'hidden');assert(voices[0].paused);document.hidden=false;listeners.visibilitychange();await Promise.resolve();assert(!voices[0].paused);await host.invoke('setAudioPreferences',{muted:true,ambience:.2,effects:.4});assert.equal(host.status().state,'muted');assert(voices[0].paused);host.dispose();
});
