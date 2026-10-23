const pool=(id,names)=>({id,version:1,entries:names.split(' ').map((name,i)=>({id:id+'-'+i,weight:1,status:'ready',conditions:{},value:{name}}))});
export const surnames=pool('names.surnames','林 陈 沈 许 顾 宋 江 方 程 杜 罗 白 叶 温 孟 韩 邵 卫 岳 柳 赵 吴 郑 余 陆 何 高 唐 秦 苏 梁 贺 孙 周 夏 钟 袁 谢 丁 傅');
export const maleNames=pool('names.male','清远 望川 承安 砚生 云舟 景和 怀山 知行 鹤鸣 昭庭 书衡 行简 守松 明澈 岑风 庭岳 允石 修竹 绍明 立冬 念初 谨言 归林 牧云 正青 怀朔 瑞年 平野 安澜 映河 时雨 仲秋');
export const femaleNames=pool('names.female','初晴 知秋 映荷 令仪 清棠 若溪 安禾 云岚 书宁 晚晴 采薇 沐青 嘉树 闻溪 素月 望舒 明霜 予安 怀瑾 竹音 星遥 溪亭 雁回 锦书 玉衡 南枝 霁雪 兰因 月汀 青萝 春晓 芷言');
