# Backup and transfer

Use Atria's **Backup & sync → Archives & restore** to move an account between Atria installations. On the source, select the data scope and create a ZIP backup. On the destination, choose the ZIP, review its preflight report and restore mode, and start the restore. Keep the original backup until you have checked the result.

Native backups include Works, Sessions, Library, Runtime, project sources and the asset blobs they require. Settings, secrets, assets and vector indexes have separate selections. Check the selection on both sides; API keys require the Secrets selection.

For repeated transfers of selected files between Atria devices, see [LAN Sync](/improvements/lan-sync). LAN Sync does not replace Native archives for Works, Sessions, Library, Runtime or projects.

Atria can import supported character-card files, but a complete SillyTavern data directory, configuration or extension is not guaranteed to migrate or round-trip unchanged. Keep an independent copy of the source and verify any imported content before relying on it.
