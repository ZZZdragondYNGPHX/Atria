import {mountNativeFrontend} from '/scripts/native/frontend/runtime.js';
import {frontendHttpTransport} from '/scripts/native/frontend/bridge.js';
import {createHeadlessConversation} from '/scripts/native/frontend/conversation.js';
const compiled=await (await fetch('/compiled')).json();
let draft='',snapshot={revision:{revisionId:(await (await fetch('/snapshot')).json()).revision}};
const current={active:true,get snapshot(){return snapshot;},generationProjection:{state:'idle',text:'',error:''},reload:async()=>{snapshot={revision:{revisionId:(await (await fetch('/snapshot')).json()).revision}};}};
const conversation=createHeadlessConversation({runtime:current,composer:{getDraft:()=>draft,setDraft:t=>{draft=t;},appendDraft:t=>{draft+=t;},clearDraft:()=>{draft='';},focus:()=>{},submit:async({revision})=>{
 current.generationProjection.state='preparing';try{const r=await fetch('/composer-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:draft,revision})});await current.reload();if(!r.ok)throw Error('Composer response unconfirmed');draft='';current.generationProjection.state='idle';}catch(e){current.generationProjection.state='failed';throw e;}
}},stop:()=>{}});
window.diagnostics=[];
window.runtime=await mountNativeFrontend({entry:compiled.entry,mode:'full',onDiagnostic:d=>{window.diagnostics.push(d);console.error('Native diagnostic',JSON.stringify(d));},bridgeTransport:frontendHttpTransport({sessionId:compiled.sessionId}),onBridgeRevision:revision=>{snapshot={revision:{revisionId:revision}};},onBridgeEpoch:current.reload,hostServices:conversation,textScale:Number(new URL(location.href).searchParams.get('textScale')||1),loadBytes:p=>Uint8Array.from(atob(compiled.files[p]),c=>c.charCodeAt(0)),surfaceHost:{mount(){const container=document.createElement('div');container.style.height='100%';document.getElementById('surface').append(container);return {container,unmount:()=>container.remove()};}}});
