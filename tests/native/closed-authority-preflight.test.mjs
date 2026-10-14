import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeGenerationHost} from '../../src/native/adapters/generation-host.js';
test('closed exact actions need no generic resolver; exposed or legacy intents still do',async()=>{
 const calls=[],host=new NativeGenerationHost({});host.execute=async(_,request)=>calls.push(request);
 const manifest={runtime:{game:{logic:'logic.json'},experienceContract:{authorityRuntime:{},taskRuntime:{turn:{policy:'authority-first',narratorTaskId:'narrator'}}}}};
 const opened=expose=>({manifest,sourceFiles:new Map([['logic.json',Buffer.from(JSON.stringify({transactions:[{intent:{expose}}]}))]])});
 assert.deepEqual(await host.preflightTurnRoutes('test',opened(false)),[]);assert.equal(calls.length,0);
 assert.equal((await host.preflightTurnRoutes('test',opened(true)))[0].role,'intent_resolver');assert.equal(calls.length,1);
 assert.equal((await host.preflightTurnRoutes('test',{manifest}))[0].role,'intent_resolver');
});
