// Offline setup for a disposable full-product browser test. Never use user data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const arg=n=>process.argv[process.argv.indexOf(n)+1],core=path.resolve(arg('--core')),dataRoot=path.resolve(arg('--dataRoot')),endpoint=arg('--endpoint');
if(path.basename(dataRoot)!=='foglight-app-data'||!/^http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions$/.test(endpoint))throw Error('Disposable local simulation paths required');
const load=p=>import(pathToFileURL(path.join(core,p)).href),{FsEngine}=await load('src/storage/engines/fs-engine.js'),{USER_DIRECTORY_TEMPLATE}=await load('src/constants.js'),{seedGenerationProfiles}=await load('tests/native/helpers/generation-fixture.js');
const handle='default-user',dirs=Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([k,rel])=>[k,path.join(dataRoot,handle,rel)]));
const engine=new FsEngine({directoriesByHandle:h=>{if(h!==handle)throw Error('Simulation user only');return dirs;}});
const {setConfigFilePath}=await load('src/util.js');setConfigFilePath(path.join(dataRoot,'..','foglight-app-config.yaml'));
const {SecretManager,SECRET_KEYS}=await load('src/endpoints/secrets.js');
const synthetic=new SecretManager(dirs).writeSecret(SECRET_KEYS.ATRIA_RUNTIME,'foglight-local-simulation-only','Local test placeholder',{activate:false});
const f=await seedGenerationProfiles({engine,handle,endpoint});
f.connection.secretRef.secretId=synthetic;f.connection.displayName='[模拟] 雾灯旅舍本机供应商';await f.persistence.saveConnectionProfile(handle,f.connection);
const {CredentialTargetAuthority}=await load('src/native/model-prompt-runtime/credential-targets.js'),authority=new CredentialTargetAuthority({persistence:f.persistence});
const inspection=await authority.inspect(handle,{connectionProfileId:f.connection.connectionProfileId});
await authority.authorize(handle,{connectionProfileId:f.connection.connectionProfileId,expectedFingerprint:inspection.connectionFingerprint,expectedTargetFingerprint:inspection.targetFingerprint,expectedPermitFingerprint:inspection.permitFingerprint,allowLocal:true});
f.model.limits.outputTokens=2048;f.model.displayName='[模拟] 只用于界面联测';await f.persistence.saveModelProfile(handle,f.model);
f.generation.revision='r2';f.generation.output.maxTokens=2048;await f.library.commit(handle,'core.generation-profile',f.generation);
for(const r of f.routes){r.displayName='[模拟] 雾灯旅舍本机联测';r.generationProfileRef.revision='r2';await f.persistence.saveRuntimeRoute(handle,r);}
console.log(JSON.stringify({mode:'simulation only',routeId:f.routes[0].runtimeRouteId}));
