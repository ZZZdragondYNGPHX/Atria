import { withRuntimeWrite } from '../../native/model-prompt-runtime/runtime-write.js';
import { withNativeResourceWrite } from '../../native/repositories/common.js';

// Chat names, character directories and group membership can all change.
// The original owner-scoped resource lock covers their complete write domain,
// including enumeration and cascade, without introducing another lock table.
export function withChatWrite(handle, operation) {
    return withRuntimeWrite(handle, () => withNativeResourceWrite(handle, 'rp-chat-domain', operation));
}
