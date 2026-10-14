import {test} from 'node:test';
import assert from 'node:assert/strict';
import {template as validate} from '../../public/scripts/native/experience/logic/bound-expressions.js';
import {template as materialize} from '../../src/native/authority-transaction.js';
const row={type:'object',properties:{id:{type:'string',maxLength:16}},required:['id'],additionalProperties:false};
const rows={type:'array',items:row,maxItems:8};
const context={computed:{type:'object',properties:{rows},required:['rows'],additionalProperties:false}};
test('exact typed computed JSON copies arrays and isolates mutation',()=>{
 validate({computed:'rows'},rows,context);
 const input={computed:{rows:[{id:'one'}]}},value=materialize({computed:'rows'},input);assert.deepEqual(value,input.computed.rows);value[0].id='changed';assert.equal(input.computed.rows[0].id,'one');
});
test('computed reference remains exact, closed and computation-only',()=>{
 for(const value of [{computed:'missing'},{computed:'__proto__'},{computed:'rows',formula:'reads.secret'},{computed:1}])assert.throws(()=>validate(value,rows,context));
 assert.throws(()=>validate({computed:'rows'},{...rows,maxItems:9},context));
 assert.throws(()=>validate({computed:'rows'},rows,{}));
 assert.throws(()=>validate({formula:'computed.rows'},rows,context));
});
