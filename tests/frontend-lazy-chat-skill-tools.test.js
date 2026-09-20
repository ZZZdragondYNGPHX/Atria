import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('lazy chat and skill tools', () => {
    test('keeps chat export, merge/split and skill lifecycle modules out of static imports', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const modules = [
            './scripts/atria-download.js',
            './scripts/chat-merge-split.js',
            './scripts/skills/embed-lifecycle.js',
        ];

        for (const modulePath of modules) {
            expect(source).not.toContain(`from '${modulePath}'`);
            expect(source).toContain(`import('${modulePath}')`);
        }
    });

    test('loads the chat downloader only inside the export click path', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const handler = source.indexOf("'.exportChatButton, .exportRawChatButton'");
        const importAt = source.indexOf("import('./scripts/atria-download.js')", handler);
        expect(handler).toBeGreaterThanOrEqual(0);
        expect(importAt).toBeGreaterThan(handler);
    });

    test('loads merge/split UI on first matching click and replays that click', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        expect(source).toContain("const lazyChatMergeSplitSelector = '#merge_chats_button, .mes_split_chat'");
        expect(source).toContain("click.atriaLazyChatMergeSplit");
        expect(source).toContain("import('./scripts/chat-merge-split.js')");
        expect(source).toContain("wireEntryPoints();");
        expect(source).toContain("$(target).trigger('click');");
        expect(source).toContain("installLazyChatMergeSplitEntryPoint();");
    });

    test('loads skill embed lifecycle only from post-visible batch 3', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const batch3 = source.indexOf('startup tasks batch 3 start');
        const importAt = source.indexOf("import('./scripts/skills/embed-lifecycle.js')", batch3);
        expect(batch3).toBeGreaterThanOrEqual(0);
        expect(importAt).toBeGreaterThan(batch3);
        expect(source).toContain('registerSkillEmbedLifecycle({ context: getContext() })');
    });
});
