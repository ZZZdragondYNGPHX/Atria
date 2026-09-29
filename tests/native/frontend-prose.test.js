/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { compileSafeProse, assertSafeProse, renderSafeProse, safeProseLink } from '../../public/shared/native-safe-prose.js';
import { createHeadlessConversation } from '../../public/scripts/native/frontend/conversation.js';
import { runNativePlayGeneration } from '../../public/scripts/native/play-generation.js';

test('Safe Prose covers baseline semantic nodes and exact canonical mapping', () => {
    const content = '# Heading\n**Strong** *em* `code` ==mark== [safe](https://example.com/)\n> quote\n- item\n1. ordered\n\n```\nconst x = 1;\n```';
    const ast = compileSafeProse(content), root = document.createElement('div');
    renderSafeProse(root, content, { ast });
    for (const tag of ['h1', 'p', 'strong', 'em', 'code', 'mark', 'a', 'blockquote', 'ul', 'ol', 'br', 'pre']) expect(root.querySelector(tag)).not.toBeNull();
    expect(() => assertSafeProse(ast, content + '!')).toThrow();
    const forged = JSON.parse(JSON.stringify(ast)); forged.children[0].type = 'script'; expect(() => renderSafeProse(root, content, { ast: forged })).toThrow();
    expect(() => compileSafeProse('x'.repeat(65537))).toThrow();
});
test('HTML remains literal text and links are Host-only with no browser navigation sink', () => {
    const root = document.createElement('div'), openExternal = jest.fn();
    renderSafeProse(root, '<img src=x onerror=alert(1)><script>evil</script>\n[safe](https://example.com/) [bad](javascript:alert)', { openExternal });
    expect(root.querySelector('img,script,iframe,style')).toBeNull(); expect(root.textContent).toContain('<script>evil</script>');
    const link = root.querySelector('a'); expect(link.getAttribute('href')).toBeNull(); link.click(); expect(openExternal).toHaveBeenCalledWith('https://example.com/');
    expect(root.querySelectorAll('a')).toHaveLength(1);
    for (const value of ['javascript:x', 'data:text/html,x', '//example.com', 'https://user:pass@example.com', 'https://example.com/\n']) expect(safeProseLink(value)).toBeNull();
});
test('Headless Composer and Session guard reads/writes and deny unconfigured restart policy', async () => {
    let text = '';
    const runtime = { active: true, snapshot: { session: { sessionId: 's' }, revision: { revisionId: 'r', branchId: 'b' }, timeline: [] }, reload: jest.fn() };
    const composer = { getDraft: () => text, setDraft: next => text = next, appendDraft: next => text += next, clearDraft: () => text = '', focus: jest.fn(), submit: jest.fn() };
    const host = createHeadlessConversation({ runtime, composer });
    const call = (service, method, input = {}, revision = 'r') => host.invoke({ service: 'host.' + service, method }, input, revision);
    await call('composer', 'set', { text: 'A' }); await call('composer', 'append', { text: 'B' }); expect((await call('composer', 'get')).text).toBe('AB');
    await call('composer', 'submit'); expect(composer.submit).toHaveBeenCalledWith({ revision: 'r' });
    await expect(call('composer', 'submit', {}, 'old')).rejects.toMatchObject({ code: 'bridge_revision_stale' });
    runtime.history = true; await expect(call('composer', 'submit')).rejects.toMatchObject({ code: 'bridge_session_readonly' });
    await expect(call('session', 'restart')).rejects.toMatchObject({ code: 'bridge_policy_denied' });
    expect((await call('session', 'diagnostics')).historical).toBe(true); await call('session', 'recover'); expect(runtime.reload).toHaveBeenCalledTimes(1);
});
test('GenerationProjection remains ephemeral through stream/finalize, failure and cancellation', async () => {
    let lateChunk;
    const phases = [], runtime = { snapshot: { session: {}, revision: {}, timeline: [] }, prepareGeneration: jest.fn(async () => 'normal'), persist: jest.fn(), finalizeStoppedGeneration: jest.fn() };
    const host = { started: () => phases.push(runtime.generationProjection.state), onChunk: () => phases.push(runtime.generationProjection.state), commitAssistant: async () => phases.push(runtime.generationProjection.state) };
    await runNativePlayGeneration({ runtime, type: 'normal', host, execute: async ({ onChunk }) => { lateChunk = onChunk; onChunk({ text: 'partial' }); expect(runtime.snapshot.timeline).toEqual([]); return { assistantText: 'final' }; } });
    expect(phases).toEqual(['preparing', 'streaming', 'finalizing']); expect(runtime.generationProjection.state).toBe('idle');
    lateChunk({ text: 'late uncommitted' }); expect(runtime.generationProjection.state).toBe('idle');
    await expect(runNativePlayGeneration({ runtime, type: 'normal', host, execute: async () => { throw new Error('private provider error'); } })).rejects.toThrow();
    expect(runtime.generationProjection).toEqual({ state: 'failed', text: '', error: 'generation_failed' });
    const controller = new AbortController();
    await expect(runNativePlayGeneration({ runtime, type: 'normal', signal: controller.signal, host, execute: async () => { controller.abort(); expect(runtime.generationProjection.state).toBe('cancelling'); return { assistantText: 'late' }; } })).rejects.toThrow();
    expect(runtime.generationProjection.state).toBe('idle');
});
