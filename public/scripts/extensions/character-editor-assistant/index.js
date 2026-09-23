import { registerOp } from '../../lib/edits/index.js';
import {
    createLorebookEntryAddOp,
    createLorebookEntryUpdateOp,
    createLorebookEntryRemoveOp,
} from './lorebook-ops.js';

// Register lorebook-entry ops so commitLorebookOperations → applyEdits can
// dispatch 'lorebook_entry_add' / '_update' / '_remove' emitted by the
// unified editor's normalizeToolCallToEdit. Without these the engine throws
// `applyEdits: unknown op: lorebook_entry_add` on every lorebook Apply.
registerOp('lorebook_entry_add',    createLorebookEntryAddOp());
registerOp('lorebook_entry_update', createLorebookEntryUpdateOp());
registerOp('lorebook_entry_remove', createLorebookEntryRemoveOp());

import './main.js';
