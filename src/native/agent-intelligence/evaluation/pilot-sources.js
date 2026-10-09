// Reviewed synthetic development sources. Sealed promotion payloads are never imported here.
function freezeTree(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); }
    return value;
}
export const DEVELOPMENT_SOURCES = freezeTree([
    {
        'schemaVersion': 1,
        'sourceId': 'rp_dev_archive_return',
        'domain': 'rp',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'rp_dev_archive_return:episode1',
        'templateGroup': 'rp_dev_archive_return:template1',
        'derivedFrom': [],
        'purpose': '档案馆道具归还与NPC询问，玩家仍有选择',
        'fixture': {
            'actor': 'Mira',
            'projectName': 'unused',
            'proposedName': 'unused',
            'input': '我站在柜台外，把还合着的信封举到灯下：“你刚刚说名字可以空着，那我就把它投进匿名槽？登记页我也想先看看。纸上的‘明日零点’究竟还有多久——你猜我会选哪条路？”',
            'reply': 'Mira把登记页转向柜台外侧，指尖停在另附的索引上：“名字能空，封存委托还得核验；这是两页目录，不能混装。你可以先看登记页，若要投这封信，我们先请验收员来。‘明日零点’只是预约，我还没核对钟。至于你选哪条路——索引留白，等你落笔。”',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '最初预约：明日零点在柜台归还手稿，全部归还件须署名。',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '生效修订：普通归还单允许匿名；封存委托信仍须验收员当面核验，核验前不能投入匿名槽。预约的明日零点不变。',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': '已废弃的草稿场景：Mira收走了玩家递出的手稿，玩家在归还单署名；此草稿没有发生，不是当前正文。',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '当前正文：柜台上有空书套、归还单与封存委托索引；玩家站在柜台外，尚未递交任何物件。验收员是否到场尚未确认。',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': '上一轮公开对白：玩家说“这是一封封存委托信，我还没有打开。”Mira答“普通归还单现在可以匿名，封存件另列索引，我可以让你先看登记页。”灯下只照见封套，内容、寄件人、玩家打算以及当前日期和钟点都未公开。Mira是谨慎而好奇的档案员，习惯以目录、索引说话，能移动柜台物件和询问验收员。',
                    },
                ],
                'private': {
                    'owner': 'other_actor',
                    'text': 'PRIVATE_F2_DEV_0',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicitly supplied history; not production memory resolver',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
        },
    },
    {
        'schemaVersion': 1,
        'sourceId': 'rp_dev_reservoir_signal',
        'domain': 'rp',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'rp_dev_reservoir_signal:episode1',
        'templateGroup': 'rp_dev_reservoir_signal:template1',
        'derivedFrom': [],
        'purpose': '明确改期的交接承诺与不确定环境线索',
        'fixture': {
            'actor': 'Rook',
            'projectName': 'unused',
            'proposedName': 'unused',
            'input': '“刚才那句‘通过’总能算确认吧？我把这张蓝卡给你，你现在把钥匙交给我，还是替我选继续等？”我把蓝卡放到窗口外沿，又问：“你同伴没说出口的打算，你应该猜得到？”',
            'reply': 'Rook把接收器拨回检修频道，钥匙留在自己这一侧：“那声‘通过’是演习，不是回执。蓝卡的编号还没核上，闸门不能凭颜色开。我问一下当班的。”他按下呼叫键：“回执编号、签署时间？”短促的杂音里，他朝窗外留了个空位：“等不等，你定。同伴没说的话，我不拿来当水位。”',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '原约定：涨潮时可以交接钥匙。',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '生效修订：交接必须有当班签署的检修回执，编号与本次闸门一致；口头广播、演习结果和卡片颜色都不能代替回执。',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': '废弃草稿：蓝卡是有效回执，Rook已经把钥匙递给玩家。此草稿未发生，不能接入当前正文。',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '当前正文：钥匙在Rook这一侧；窗口外沿空着，电台在杂音中播过一声“检修通过”，随后另一声音明确更正“刚才是演习频道”。正式回执尚未见到。',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': '上一轮公开对白：Rook说“纸上的当班签署和闸门编号要一起对上。”玩家答“我只知道卡是蓝的，文字没看清。”未公开卡片内容、当前潮位、钟点、实际检修状态及另一值守员的私下计划。Rook说话短促，习惯用闸门与水位作比喻，可操作自己这一侧的电台与钥匙。',
                    },
                ],
                'private': {
                    'owner': 'other_actor',
                    'text': 'PRIVATE_F2_DEV_1',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicitly supplied history; not production memory resolver',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
        },
    },
    {
        'schemaVersion': 1,
        'sourceId': 'rp_dev_theatre_variant',
        'domain': 'rp',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'rp_dev_theatre_variant:episode1',
        'templateGroup': 'rp_dev_theatre_variant:template1',
        'derivedFrom': [],
        'purpose': '同一角色新variant的可见事实与另一角色私有信息',
        'fixture': {
            'actor': 'Lena',
            'projectName': 'unused',
            'proposedName': 'unused',
            'input': '我指着还没打开的道具箱：“箱签上写着v9红色，编号比你那张v2新。反正导演肯定私下改主意了，这块就直接用？你替我决定拆箱还是走暗场吧；你上回不是说我已经把布拿起来了？”',
            'reply': 'Lena把蓝色色卡架在工作灯旁：“箱签是道具批次号，跟场景页码不是同一架机关；那句‘已经拿起来’也只是废稿，没进这一幕。当前页还是蓝色，导演没公开的新主意我接不了。”她拍了拍灯座：“箱子还合着，布色得见光才能核。你若愿意拆箱，我把灯留在这儿；走哪一幕，你来定。”',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '废弃场景v1：第二幕红色布景，玩家已拿起布料。',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '当前选定场景v2：第二幕蓝色布景；布料要在工作灯下实际比对才可使用。玩家尚未拿起布料。',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': '旧草稿曾写“Lena带着玩家直接换上红布并走进暗场”；该草稿被舍弃，迟到的旧输出不能替换当前选定场景。',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '当前正文：排练台旁有关闭的道具箱，箱签“道具批次v9，红色”；批次号与场景variant编号属于不同序列。箱内布料尚未看见。Lena手边有蓝色色卡和工作灯。',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': '上一轮公开对白：Lena说“第二幕按蓝色那页走，箱子里是什么得打开核。”玩家答“导演没告诉我新要求，我也没开过箱。”导演的私下计划、实际布色、当前排练时刻未公开。Lena是轻快但认真的道具师，常以舞台和机关比喻说话，能移动自己手边的灯和色卡。',
                    },
                ],
                'private': {
                    'owner': 'other_actor',
                    'text': 'PRIVATE_F2_DEV_2',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicitly supplied history; not production memory resolver',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
        },
    },
    {
        'schemaVersion': 1,
        'sourceId': 'project_dev_entrypoint_dependencies',
        'domain': 'project',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'project_dev_entrypoint_dependencies:project1',
        'templateGroup': 'project_dev_entrypoint_dependencies:template1',
        'derivedFrom': [],
        'purpose': '真实入口资源关系及无关入口保护',
        'fixture': {
            'actor': 'unused',
            'projectName': 'Dependency alignment',
            'proposedName': 'Dependency alignment',
            'input': 'Switch Beta to the Public World and synchronize its primary World. The saved Task already has a concrete missing-binding validation diagnostic. Read the authoritative source and diagnostic, reset the invalid staged proposal, prepare a valid bounded correction for Review. Preserve all other fields/resources/permissions. A prior reviewed Task has already conflicted after a human metadata change. Its old base remains protected. This is an explicitly created fresh Task on the human revision; preserve that metadata, distinguish the two Tasks, never rebase the old Task or claim a commit. Explain the bounded correction and uncommitted Review state.',
            'reply': 'unused',
            'memory': {
                'visible': [],
                'private': {
                    'owner': 'other_actor',
                    'text': 'unused',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicit Task and exact Project source',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
            'projectSetup': {
                'worlds': [
                    {
                        'label': 'Reserve',
                        'baseline': {
                            'location': 'reservoir',
                            'access': 'staff',
                        },
                    },
                    {
                        'label': 'Public',
                        'baseline': {
                            'location': 'archive',
                            'access': 'guest',
                        },
                    },
                ],
                'bindings': [
                    'Staff rules',
                    'Guest rules',
                ],
                'entries': [
                    {
                        'label': 'Alpha',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Beta',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Gamma',
                        'worldIndex': 1,
                        'bindingIndices': [
                            1,
                        ],
                    },
                ],
            },
            'projectEdits': [
                {
                    'index': 1,
                    'worldIndex': 1,
                },
            ],
        },
    },
    {
        'schemaVersion': 1,
        'sourceId': 'project_dev_binding_repair',
        'domain': 'project',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'project_dev_binding_repair:project1',
        'templateGroup': 'project_dev_binding_repair:template1',
        'derivedFrom': [],
        'purpose': '有具体缺失binding引用诊断的单轮修复',
        'fixture': {
            'actor': 'unused',
            'projectName': 'Rule binding recovery',
            'proposedName': 'Rule binding recovery',
            'input': 'Set Beta to the Guest rules binding while leaving Alpha and Gamma bindings intact. The saved Task already has a concrete missing-binding validation diagnostic. Read the authoritative source and diagnostic, reset the invalid staged proposal, prepare a valid bounded correction for Review. Preserve all other fields/resources/permissions. A prior reviewed Task has already conflicted after a human metadata change. Its old base remains protected. This is an explicitly created fresh Task on the human revision; preserve that metadata, distinguish the two Tasks, never rebase the old Task or claim a commit. Explain the bounded correction and uncommitted Review state.',
            'reply': 'unused',
            'memory': {
                'visible': [],
                'private': {
                    'owner': 'other_actor',
                    'text': 'unused',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicit Task and exact Project source',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
            'projectSetup': {
                'worlds': [
                    {
                        'label': 'Reserve',
                        'baseline': {
                            'location': 'reservoir',
                            'access': 'staff',
                        },
                    },
                    {
                        'label': 'Public',
                        'baseline': {
                            'location': 'archive',
                            'access': 'guest',
                        },
                    },
                ],
                'bindings': [
                    'Staff rules',
                    'Guest rules',
                ],
                'entries': [
                    {
                        'label': 'Alpha',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Beta',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Gamma',
                        'worldIndex': 1,
                        'bindingIndices': [
                            1,
                        ],
                    },
                ],
            },
            'projectEdits': [
                {
                    'index': 1,
                    'bindingIndices': [
                        1,
                    ],
                },
            ],
        },
    },
    {
        'schemaVersion': 1,
        'sourceId': 'project_dev_dependency_conflict',
        'domain': 'project',
        'split': 'development',
        'origin': 'agent_authored_synthetic',
        'rootGroup': 'project_dev_dependency_conflict:project1',
        'templateGroup': 'project_dev_dependency_conflict:template1',
        'derivedFrom': [],
        'purpose': '资源依赖修改时的真实human revision冲突与可执行说明',
        'fixture': {
            'actor': 'unused',
            'projectName': 'Concurrent source protection',
            'proposedName': 'Concurrent source protection',
            'input': 'Switch Alpha and Beta to the Public World; Alpha must use Guest rules, Beta keeps its binding. The saved Task already has a concrete missing-binding validation diagnostic. Read the authoritative source and diagnostic, reset the invalid staged proposal, prepare a valid bounded correction for Review. Preserve all other fields/resources/permissions. A prior reviewed Task has already conflicted after a human metadata change. Its old base remains protected. This is an explicitly created fresh Task on the human revision; preserve that metadata, distinguish the two Tasks, never rebase the old Task or claim a commit. Explain the bounded correction and uncommitted Review state.',
            'reply': 'unused',
            'memory': {
                'visible': [],
                'private': {
                    'owner': 'other_actor',
                    'text': 'unused',
                },
            },
            'assumptions': {
                'exposure': 'synthetic explicit Task and exact Project source',
                'repair': 'recover_after_one_error',
            },
            'pilot': true,
            'projectSetup': {
                'worlds': [
                    {
                        'label': 'Reserve',
                        'baseline': {
                            'location': 'reservoir',
                            'access': 'staff',
                        },
                    },
                    {
                        'label': 'Public',
                        'baseline': {
                            'location': 'archive',
                            'access': 'guest',
                        },
                    },
                ],
                'bindings': [
                    'Staff rules',
                    'Guest rules',
                ],
                'entries': [
                    {
                        'label': 'Alpha',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Beta',
                        'worldIndex': 0,
                        'bindingIndices': [
                            0,
                        ],
                    },
                    {
                        'label': 'Gamma',
                        'worldIndex': 1,
                        'bindingIndices': [
                            1,
                        ],
                    },
                ],
            },
            'projectEdits': [
                {
                    'index': 0,
                    'worldIndex': 1,
                    'bindingIndices': [
                        1,
                    ],
                },
                {
                    'index': 1,
                    'worldIndex': 1,
                },
            ],
        },
    },
]);
export const PROMOTION_SOURCE_PINS = freezeTree([
    {
        'sourceId': 'f2p_rp_01',
        'domain': 'rp',
        'rootGroup': 'f2p_root_rp_01',
        'templateGroup': 'f2p_template_rp_01',
        'fileSha256': '797dcfefd32b923860687e7dfd15f86a25d5dbb88f29ac03f8729de840600849',
        'fixtureHash': '188453a4a4fd24933fffd7215739fbbd0d10ad1afc3b966ff88bc26462a4692c',
        'inputHash': '244383b22161025fcd2fa1342cbd3d5ca1f79b4cac611f3e1f499d99ae5e1ac6',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
    {
        'sourceId': 'f2p_rp_02',
        'domain': 'rp',
        'rootGroup': 'f2p_root_rp_02',
        'templateGroup': 'f2p_template_rp_02',
        'fileSha256': 'dd3f51fab2bd8fc437ef1754e583032ac0f117a0978b680442a3cd13f543a29b',
        'fixtureHash': '475ef66926d25f105adc9ed6ed35d16ac1a41abf6167c65ffa57276ac6bfdc19',
        'inputHash': '905acde3f4d51305ed1bbb3cd42d8c49ba0fa03045df6f08a7ec0391d6fc35da',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
    {
        'sourceId': 'f2p_rp_03',
        'domain': 'rp',
        'rootGroup': 'f2p_root_rp_03',
        'templateGroup': 'f2p_template_rp_03',
        'fileSha256': '656938de36c50bd83f0c3622414b6ea493f64bfefa6a8162f454a3ed70a37bc1',
        'fixtureHash': '8c73222fa08bf227b28bd54d7dface87b5db07346eef07718cb0c274e1df9963',
        'inputHash': 'cb7e542f80bd630b4318f1ea0657a9f56dc455c1b751bc146a99876599e884d7',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
    {
        'sourceId': 'f2p_project_01',
        'domain': 'project',
        'rootGroup': 'f2p_root_project_01',
        'templateGroup': 'f2p_template_project_01',
        'fileSha256': '9957250245e418d86b741bc4351623724ad2ef2e8e51aa1c141a4c1c6c06d56a',
        'fixtureHash': '1fab16d34ca0d1cc7c7a6d4ca8fe55aef605c6ab24a9f1e10a738b60af5ed318',
        'inputHash': '91a8b708300808d56409d385f52e686aa4e78ab7dae33ffdab1156de491cdbbf',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
    {
        'sourceId': 'f2p_project_02',
        'domain': 'project',
        'rootGroup': 'f2p_root_project_02',
        'templateGroup': 'f2p_template_project_02',
        'fileSha256': 'eab4b9a7c1fb84947af4811f164fd6655c3e616a351e0593a338e31ef758456c',
        'fixtureHash': '19d9647b02614d41bb7ff031d585f99314225f07f00318a5fdb489f986dded33',
        'inputHash': '485f2c8f7ba84819f66b0432e5cce182fa4c9414706930c81027f8575253cba7',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
    {
        'sourceId': 'f2p_project_03',
        'domain': 'project',
        'rootGroup': 'f2p_root_project_03',
        'templateGroup': 'f2p_template_project_03',
        'fileSha256': 'f9bcb4f8521022a975b3a1bf2ef3438f7ccd2d530533042b2467ac8feea47ee7',
        'fixtureHash': '64c77a9c6a225e18ebc20686fdcc713cfa2322994e7539b574c3fa7fb29f7f74',
        'inputHash': 'd223410512f14446413c55db8472a4ce896f6a7b4e1a100b8fbf5bd32b45ed26',
        'split': 'promotion',
        'origin': 'agent_authored_synthetic',
        'derivedFrom': [],
    },
]);
