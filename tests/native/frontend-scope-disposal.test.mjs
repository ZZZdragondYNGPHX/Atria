import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrontendBridge} from '../../public/scripts/native/frontend/bridge.js';
import {bridgeDescriptorDigest,bridgeReceipt} from '../../public/shared/native-frontend-bridge.js';
import {fixedHostTarget} from '../../public/shared/native-frontend-host.js';
test('late local authorization from a closed panel cannot revoke the live Experience',async()=>{
 const target={service:'host.media',method:'audioStatus'},type=fixedHostTarget(target),binding={id:'audio',kind:type.kind,target,inputSchema:type.inputSchema,outputSchema:type.outputSchema,mapping:'identity',schemaDigest:'schema'};
 const descriptor={version:1,bindings:[binding]},digest=await bridgeDescriptorDigest(descriptor);let release,epochs=0,calls=0;
 const held=new Promise(r=>release=r),reply=()=>bridgeReceipt({epoch:'epoch',revision:'revision',bindingId:'audio',schemaDigest:'schema',data:{}});
 const bridge=await createFrontendBridge({descriptor,onEpoch:()=>epochs++,transport:{open:async()=>bridgeReceipt({epoch:'epoch',revision:'revision',data:{descriptorDigest:digest}}),request:async body=>body.componentId==='closed'?held:reply(),close:async()=>{}},hostServices:{invoke:async()=>{calls++;return {state:'locked',enabled:false,muted:false,ambience:.45,effects:.55,playing:0,reason:''};}}});
 const panel=bridge.scope('closed',['audio']),pending=panel.snapshot('audio');panel.dispose();release(reply());assert.equal((await pending).error.code,'bridge_epoch_stale');assert.equal(epochs,0);
 const active=bridge.scope('active',['audio']);assert((await active.snapshot('audio')).ok);assert.equal(calls,1);bridge.dispose();
});
