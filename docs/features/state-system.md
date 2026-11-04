# State system

Atria exposes character, chat and preset state to extensions. Each namespace holds its own data, so an extension can manage its state without editing the character card or chat messages directly.

Chat state belongs to a particular chat. Floor State builds on it to keep extension state aligned with the active message and swipe history. Use the storage APIs rather than assuming a particular on-disk layout; the configured storage engine owns persistence.

See [Chat and State API](/development/extension-api/chat-and-state) for the available operations and [Floor State](/development/extension-api/chat-and-state#floor-state) for rewind-aware state.
