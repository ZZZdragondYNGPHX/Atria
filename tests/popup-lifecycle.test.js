import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const popupPath = path.resolve(here, '../public/scripts/popup.js');

describe('Popup lifecycle regression', () => {
    test('never reopens a detached dialog from the prevented-close listener', async () => {
        const source = await fs.readFile(popupPath, 'utf8');
        const closeListener = source.match(/const closeListener = async \(evt\) => \{[\s\S]*?this\.dlg\.addEventListener\('close'/)?.[0] || '';

        expect(closeListener).toContain('if (!this.dlg.isConnected || this.dlg.open) return;');
        expect(closeListener.indexOf('isConnected')).toBeLessThan(closeListener.indexOf('this.dlg.showModal()'));
    });
});
