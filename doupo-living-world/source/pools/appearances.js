// Paired files are one identity. Never mix a bespoke portrait and generic chibi.
// Stable Native asset identities are authored once, never rehashed per visible NPC.
const refs={

 "yafei": [
  "asset_ca10236f3e3bfa5e6ced1b6017735e0e",
  "asset_7e3fe776d458c36796a0db213981d7c3"
 ],
 "xiaomei": [
  "asset_55d5b19fd8ac91298a8f527ca53a4a64",
  "asset_11e5671b34bca9aa06148d337dab5e54"
 ],
 "xiaoning": [
  "asset_e33589aa033b2b5450a1f39a44153a06",
  "asset_2dd367cc6c571375dc192044820ce389"
 ],
 "xiaoyixian": [
  "asset_24902bd60de3015cca2e7fa020ab6be2",
  "asset_13cecfc64c5195837f29f6e4abd46fd2"
 ],
 "frank": [
  "asset_5705bc833ba1852e4b30ac945883bd52",
  "asset_ca78344a1486c6fb03d310b602bfead4"
 ],
 "aotuo": [
  "asset_e2ed28bb719875089589e707a5bbaeb9",
  "asset_c0cffe6078302a8d7f78db74395bfd59"
 ],
 "linfei": [
  "asset_5a192921873ae693d69ab4576f676876",
  "asset_32a2f4ed1c8ae07bfe9e7ec9b38865bf"
 ],
 "xuemei": [
  "asset_58cd207bbc31f5ef65c4c7f65bd505e6",
  "asset_ab8980367dd137238daa441589ab037d"
 ],
 "xiaoding": [
  "asset_d7d4ae6afff75e4bd61aeeca36931b93",
  "asset_0aba6977a0ea6dd7d6d9df70d4df6fb4"
 ],
 "xiaoli": [
  "asset_4b51d3c9edf50494fe6becc6e6580e6b",
  "asset_a35775d92f6e163879024a0050e8b888"
 ]
,
 "xiaoyan": [
  "asset_cd65da53bc1529a25187bc52b24d2352",
  "asset_08567c58a96a47f389098030d0b696a9"
 ],
 "xiaozhan": [
  "asset_d586f4536d4cbaa4d5c57e2aa9d710ed",
  "asset_9d39c6025972734ec556c50e62d5e8d7"
 ],
 "xuner": [
  "asset_2ee75c5c074506d9a71a1d229c5b8684",
  "asset_b8ff80c64a459c4346cad615d1c955c2"
 ],
 "su": [
  "asset_a70b2ae651430c4766fcbbb0b2da7550",
  "asset_57d79ff9c01299bf7b444a05336d0844"
 ],
 "he": [
  "asset_748857455a324654fa313ee2d2430b9f",
  "asset_24312598260b8c9c76280009ab90336b"
 ],
 "lu": [
  "asset_4322db6898ac4f33f14d7068f8676d3c",
  "asset_815035bc608f10fd5dfe9c75e6f794ec"
 ],
 "ning": [
  "asset_aa925410a5760c90c830168e4cb6338d",
  "asset_bcf3eb57cebcd44c624d0dcff06422eb"
 ],
 "su-father": [
  "asset_dc72feeb8017f4e01dd45cbd6d8e8a16",
  "asset_8aea713183b46d5718fc7a74deaaf8b7"
 ],
 "npc-infant-male": [
  "asset_ed6735079aa80915f6299f7a426e89ff",
  "asset_917590d50fc1d62376cc4b6abdfd4b8c"
 ],
 "npc-child-male": [
  "asset_06fccc5581db660942daf106f077f170",
  "asset_8adacea7f4a2b43bf9b4d44eb9728670"
 ],
 "npc-adult-male-broad": [
  "asset_f7bcc396ebf1dbe30ee15206d1acd2db",
  "asset_df0a2ecc2709fa128034edcd91aa13cb"
 ],
 "npc-adult-male-lean": [
  "asset_febbabf8ef3701683e25e7f83a2c88f9",
  "asset_7cb35a2ecf033e5d48768882561d118d"
 ],
 "npc-middle-male-square": [
  "asset_d02cefafe6475dfac719c9f3e9d7a5ff",
  "asset_a6dc75e02ea48f3a3921e861a69c8297"
 ],
 "npc-elder-male-lean": [
  "asset_776f665ec8a3c2f876de216243ba5703",
  "asset_585bd0cac189d42c12da7f0fc4b33949"
 ],
 "npc-infant-female": [
  "asset_3216c7100327b356be536c896a94c694",
  "asset_97f3b349e5dd03b37d74ed0c7aa6bb52"
 ],
 "npc-child-female": [
  "asset_58f6cc204ca0394cb1b7ca5ad70b8043",
  "asset_5efbe786b25eff0f81b33bcadc377b6c"
 ],
 "npc-adult-female-angular": [
  "asset_d1e9aede73101448c6bb372f172939d0",
  "asset_126a376226aabe8e5c6aef4158e5caf0"
 ],
 "npc-adult-female-round": [
  "asset_8aa9289b498bf73fd2d85d8d3bfdb447",
  "asset_d789bed3e1645c7370ec4064ff925d29"
 ],
 "npc-middle-female-long": [
  "asset_ce92fb971218f5439d393674e71f2ff0",
  "asset_8d7eb8f01130782734c06b14f76d82d1"
 ],
 "npc-elder-female-round": [
  "asset_254f772dee9a933928b5470740682bdf",
  "asset_09acb10368c838c26551c678f6612e91"
 ]
};
const profile=(id,sex,min,max,key='')=>({id,weight:1,status:'ready',conditions:{sex:{in:[sex]},age:{min,max},key:{in:[key]}},value:{portraitAsset:refs[id][0],chibiAsset:refs[id][1],period:key?'opening':'ordinary',portrait:'media/pools/'+(key?'key-characters/':'ordinary/')+id+'-portrait.webp',chibi:'media/pools/'+(key?'key-characters/':'ordinary/')+id+'-chibi.webp'}});
export const appearances={id:'appearances',version:2,entries:[
 profile('yafei','female',18,39,'yafei'),profile('xiaomei','female',13,17,'xiaomei'),profile('xiaoning','male',13,17,'xiaoning'),
 profile('xiaoyixian','female',13,17,'xiaoyixian'),profile('frank','male',40,69,'frank'),profile('aotuo','male',40,69,'aotuo'),
 profile('linfei','female',13,17,'linfei'),profile('xuemei','female',13,17,'xuemei'),profile('xiaoding','male',18,39,'xiaoding'),profile('xiaoli','male',18,39,'xiaoli'),
 profile('xiaoyan','male',13,17,'xiaoyan'),profile('xiaozhan','male',35,59,'xiaozhan'),profile('xuner','female',13,17,'xuner'),
 profile('su','female',18,39,'su'),profile('he','male',18,39,'he'),profile('lu','male',18,39,'lu'),profile('ning','female',18,39,'ning'),profile('su-father','male',60,89,'su-father'),
 ...['male','female'].flatMap(sex=>[
 profile('npc-infant-'+sex,sex,0,4),profile('npc-child-'+sex,sex,5,17),
 profile('npc-adult-'+sex+'-'+(sex==='male'?'broad':'angular'),sex,18,39),profile('npc-adult-'+sex+'-'+(sex==='male'?'lean':'round'),sex,18,39),
 profile('npc-middle-'+sex+'-'+(sex==='male'?'square':'long'),sex,40,59),profile('npc-elder-'+sex+'-'+(sex==='male'?'lean':'round'),sex,60,10000)
 ])
]};
export const KEY_CHARACTERS=appearances.entries.flatMap(e=>e.conditions.key.in).filter(Boolean);
