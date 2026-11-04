# Storage management

Open the storage center from Atria's workspace. Switch between **Server account** and **Current browser** to inspect each scope separately.

- **Overview** groups resources by their current owner and shows usage, including installed Works and their package data. Unclassified data appears in **Other data** as read-only.
- **Cleanup suggestions** lists data that the relevant owner has verified can be cleaned.
- **Backups & recycle bin** shows recoverable items and supported recovery actions. Earlier recovery points are listed separately and can be restored when their original path is free.
- **Operation history** shows cleanup and recovery tasks.

Available actions depend on the resource and its references. Review a preview before applying a cleanup; resources in use or needed for recovery may be protected.

Browser storage is measured separately from the server. The browser's site estimate and the known subtotal use different methods and are not added together. Some databases and caches do not expose per-item sizes.

When Atria first opens after an update, it moves older browser data into Atria-named storage and removes an old database only after checking the copy. Close other tabs still using the older app at the same address so they do not write to the old database again. If the browser used the older local-storage fallback, Atria asks you to close those tabs first; canceling leaves the old data in place.

If old and new values conflict, Atria keeps both copies and pauses that migration. Back up and resolve the conflict before reloading. Older browsers using WebSQL cannot safely enumerate their old databases automatically; keep their browser data and do not clear storage.

For account archives and transfer, see [Backup and transfer](/guide/migration).
