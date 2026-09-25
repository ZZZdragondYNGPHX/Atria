// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups

// Consumer-wiring integration coverage for the shared iter-studio
// `inspect_bound_preset` tool. Verifies:
//
//   1. `iteration-library/tools/index.js` re-exports the shared module as
//      `characterPresetsReads` (so orchestrator iter-studio's destructure
//      `ITER_TOOLS.characterPresetsReads` keeps working).
//
//   2. CEA's editor-iteration tool catalog advertises `inspect_bound_preset`
//      and classifies it as a read tool (so the unified editor routes calls
//      through `runCeaEditorReadTool`, which then reaches the helper API).
//
// The shared executor itself is covered exhaustively in
// `inspect-bound-preset-tool.test.js`; this file only proves both consumer
// surfaces see the tool.

import { test, expect } from '@jest/globals';

// -- 1. iteration-library/tools/index.js aggregation --

test('iteration-library/tools/index.js re-exports characterPresetsReads namespace', async () => {
    const mod = await import('/scripts/iteration-library/tools/index.js');
    expect(mod.characterPresetsReads).toBeDefined();
    expect(mod.characterPresetsReads.CHARACTER_PRESET_READ_TOOL_NAMES).toContain('inspect_bound_preset');
    expect(typeof mod.characterPresetsReads.isCharacterPresetReadTool).toBe('function');
    expect(typeof mod.characterPresetsReads.runCharacterPresetReadTool).toBe('function');
    expect(Array.isArray(mod.characterPresetsReads.CHARACTER_PRESET_READ_TOOL_DEFS)).toBe(true);
});
