# 素材与来源

人物、场景、物件与结局图使用 OpenAI 内置 `image_gen` 在制作期生成。人物为成年二次元动漫形象；没有采用前端参考中的摄影人物或照片。透明立绘由生成接口直接提供 alpha，WEBP 仅作编码转换。制作记录与文件哈希见 `media/image-sources.json`。

采用的外部声音均标示为 CC0，原始素材与加工脚本随源码保存：

| 来源 | 作者 | 用途与处理 |
| --- | --- | --- |
| [Beach Ocean Waves](https://opengameart.org/content/beach-ocean-waves) | jasinski；qubodup 提交 | 海风远浪；单声道、22.05 kHz、循环衔接与电平归一 |
| [Fire Crackling](https://opengameart.org/content/fire-crackling/) | AntumDeluge | 炉火；裁剪、循环衔接与电平归一 |
| [rain and thunders](https://opengameart.org/node/22231) | kindland | 室内雨声与较强风雨；低通/轻压缩、循环衔接与电平归一 |

[CC0 1.0 说明](https://creativecommons.org/publicdomain/zero/1.0/)。原始录音位于 `media/audio/sources/`；逐项来源、许可、加工、使用位置、时长、电平和 SHA-256 见 `media/audio/sources.json`。

发电机、报务台底噪和 13 项短音由本作 `tools/prepare-audio.py` 确定性合成，按 CC0 1.0 提供。旧呼号采用短暂底噪与信号质感，不含演员配音；完整话语始终有正文。未采用 Kenney 候选音频。

字体使用玩家设备已有的中文黑体/宋体及系统回退字体，本包不分发字体文件。
