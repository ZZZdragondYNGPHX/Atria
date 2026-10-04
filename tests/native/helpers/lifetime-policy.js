import { anniversary } from '../../../public/shared/native-lifetime-runtime.js';
export function lifetimePolicyFixture(protagonistId='hero',seed=17){
    const p=(id,age,institutionId='')=>({id,name:id,birthTick:anniversary(0,-age),tier:'A',institutionId,occupation:institutionId?'registrar':'citizen',sourceRecordId:''});
    return {schemaVersion:1,clockId:'world',chronologyDomain:'chronology',protagonistId,publicIdentityId:'identity.initial',seed,adultAge:18,retirementAge:65,mortalityAge:78,gestationTicks:403200,maxPeople:256,maxEvents:512,maxBytes:1048576,initialPopulation:10000,
        people:[p(protagonistId,28),p('partner',26),p('leader',56,'registry'),p('deputy',31,'registry')],
        offices:[{id:'registrar',institutionId:'registry',title:'Register keeper',holderId:'leader',rule:'nomination'}],
        routes:[{id:'covenant',label:'Witness lien',agingDivisor:8,returnTicks:525600,claimCost:3,exposureCost:2}]};
}
