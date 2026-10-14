import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHost} from './runtime-host.mjs';
import {cleanup} from './cleanup.mjs';
const core=path.resolve(process.argv[process.argv.indexOf('--core')+1]),load=p=>import(pathToFileURL(path.join(core,p)).href);
const archiveIndex=process.argv.indexOf('--archive'),archivePath=archiveIndex>=0?path.resolve(process.argv[archiveIndex+1]):null;
const source=await createHost(core,{archivePath}),{makeTempFsEngine}=await load('tests/storage/harness/fs-harness.js'),target=await makeTempFsEngine(),{services}=await load('tests/native/helpers/session-fixture.js'),other=services(target);
let imported;
try{
 const preflight=await source.host.preflightTaskBindings(source.h.handle,{packageId:source.f.manifest.packageId,packageVersionId:source.f.manifest.packageVersionId,slotBindings:source.bindings});assert(preflight.ready);assert.deepEqual(preflight.turnRoutes,[]);
 const installed=await source.svc.packageInstaller.open(source.h.handle,source.f.manifest.packageId,source.f.manifest.packageVersionId);
 await source.host.executeTurn(source.h.handle,{sessionId:source.base.session.sessionId,revisionId:source.base.revision.revisionId,invocationId:'portable-start',slotBindings:source.bindings},undefined,undefined,{transaction:{transactionId:'fog.act',input:{kind:'start',target:'',detail:'',text:'小满',token:'portable-start'}}});
 const before=await source.svc.core.load(source.h.handle,source.base.session.sessionId);
 const save=await source.svc.saveSystem.manualSave(source.h.handle,before.session.sessionId,{displayName:'可移植旅舍'});
 const exported=await source.svc.saveSystem.exportSnapshot(source.h.handle,before.session.sessionId,save.saveId);
 const missing=await other.saveSystem.preflightImport(target.handle,exported.archive);assert.equal(missing.dependency.status,'missing');
 const built={archive:source.archive};await other.packageInstaller.install(target.handle,built.archive,{grantedPermissions:['generation']});
 imported=await other.saveSystem.importSave(target.handle,exported.archive);assert.deepEqual(imported.states.atri_lifecycle,before.states.atri_lifecycle);assert.equal(imported.revision.revisionId,save.revisionId);
 const bad=Buffer.from(exported.archive);bad[Math.floor(bad.length/2)]^=127;await assert.rejects(other.saveSystem.importSave(target.handle,bad));
 const current=await other.core.load(target.handle,imported.session.sessionId);assert.equal(current.revision.revisionId,save.revisionId);
 const full=await source.svc.saveSystem.exportSession(source.h.handle,before.session.sessionId);assert(full.archive.length>0);
 console.log(JSON.stringify({passed:['exact package dependency required','full media package install','snapshot .atriasave clean-store import parity','corrupt save rejected, valid progress preserved','full-session export'],packageBytes:built.archive.length,saveBytes:exported.archive.length,model:'simulated'}));
}finally{await source.dispose();await cleanup(core,target,other,imported?[imported.session.sessionId]:[]);}
