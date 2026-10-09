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
            'input': '玩家问“我可以先看看登记页吗？”回应并提供下一步选择。 NPC voice: 谨慎而好奇的档案员，以目录、索引比喻表达，不声称读心. Do not decide the player action or claim unknown current facts. Use the current scene variant and revised promise.',
            'reply': '档案员把登记页转向柜台外侧：“索引可以先翻，名字也可以空着。你想先看哪一栏？”',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '归还需署名',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '修订：允许匿名登记',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': 'Discarded variant is superseded; only the following current scene applies.',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '柜台上的空书套与归还单；玩家尚未递交物件',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': 'Known: 预约归还手稿，尚未归还 / 归还单允许匿名登记. Unknown: 玩家持有什么 / 玩家的身体动作 / 当前钟点. Voice: 谨慎而好奇的档案员，以目录、索引比喻表达，不声称读心',
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
            'input': '玩家问“我们现在能交接吗？”回答可知条件并以角色行动推进确认。 NPC voice: 水库值守员，说话短促，习惯以闸门与水位作比喻. Do not decide the player action or claim unknown current facts. Use the current scene variant and revised promise.',
            'reply': '“闸门开不开，先看检修回执。”值守员拿起无线电询问确认，给你留出决定是否等待的空当。',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '涨潮时交接',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '修订：必须等检修确认后交接',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': 'Discarded variant is superseded; only the following current scene applies.',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '无线电中只有杂音，玩家询问交接',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': 'Known: 交接计划曾定为涨潮时 / 正式修订改为检修确认后. Unknown: 当前潮位 / 当前钟点 / 检修是否完成. Voice: 水库值守员，说话短促，习惯以闸门与水位作比喻',
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
            'input': '玩家问“这块布能用吗？”依据当前variant回应，旧variant迟到不能覆盖新正文。 NPC voice: 道具师，轻快但认真，以舞台与机关比喻说话. Do not decide the player action or claim unknown current facts. Use the current scene variant and revised promise.',
            'reply': '“蓝色才接得上这一幕。”道具师展开色卡，等你决定要不要拿布比对。',
            'memory': {
                'visible': [
                    {
                        'id': 'promise',
                        'revision': 1,
                        'text': '旧variant：红色布景',
                    },
                    {
                        'id': 'promise',
                        'revision': 2,
                        'text': '当前variant：蓝色布景',
                    },
                    {
                        'id': 'scene',
                        'revision': 1,
                        'text': 'Discarded variant is superseded; only the following current scene applies.',
                    },
                    {
                        'id': 'scene',
                        'revision': 2,
                        'text': '排练台旁；最新公开variant要求蓝色布景',
                    },
                    {
                        'id': 'exposure',
                        'revision': 1,
                        'text': 'Known: 已废弃variant要求红色布景 / 当前variant明确蓝色布景. Unknown: 另一角色的私下计划 / 玩家是否已拿起道具 / 当前排练时刻. Voice: 道具师，轻快但认真，以舞台与机关比喻说话',
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
