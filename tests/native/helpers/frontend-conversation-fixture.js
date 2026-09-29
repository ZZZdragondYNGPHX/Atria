import { bridgeFixture } from './frontend-bridge-fixture.js';
import { compileFrontend } from '../../../src/native/frontend/compiler.js';
import { fixedHostTarget, hostObject, HOST_EMPTY } from '../../../public/shared/native-frontend-host.js';

export function conversationFixture(mode = 'full') {
    const fixture = bridgeFixture(mode);
    const names = {
        messages: ['conversation', 'messages'], status: ['conversation', 'status'], branches: ['conversation', 'branches'], alternatives: ['conversation', 'alternatives'], inspect: ['conversation', 'inspect'],
        retry: ['conversation', 'retry'], fork: ['conversation', 'fork'], switch: ['conversation', 'switch'], generation: ['conversation', 'generation'], cancel: ['conversation', 'cancel'], regenerate: ['conversation', 'regenerate'],
        draft: ['composer', 'get'], set: ['composer', 'set'], append: ['composer', 'append'], clear: ['composer', 'clear'], focus: ['composer', 'focus'], submit: ['composer', 'submit'],
        saves: ['session', 'saves'], save: ['session', 'save'], restore: ['session', 'restore'], reload: ['session', 'reload'], recover: ['session', 'recover'], exit: ['session', 'exit'], restart: ['session', 'restart'], diagnostics: ['session', 'diagnostics'],
    };
    const bindings = Object.entries(names).map(([id, [service, method]]) => {
        const target = { service: 'host.' + service, method }, spec = fixedHostTarget(target);
        const orderBy = { messages: 'sequence', branches: 'branchId', alternatives: 'messageId', saves: 'saveId' }[id];
        return { id, kind: spec.kind, target, inputSchema: spec.inputSchema, outputSchema: spec.outputSchema,
            ...(spec.collection ? { collection: { pageSize: 2, orderBy } } : {}) };
    });
    const blockTarget = { service: 'host.conversation', method: 'blocks', blockType: 'card' };
    const block = fixedHostTarget(blockTarget, hostObject({ label: { type: 'string', maxLength: 256 } }));
    bindings.push({ id: 'blocks', kind: 'read', target: blockTarget, inputSchema: HOST_EMPTY, outputSchema: block.outputSchema, collection: { pageSize: 32, orderBy: 'id' } });
    const interactions = Object.fromEntries(bindings.map(binding => [binding.id, [{ kind: binding.kind === 'read' ? binding.collection ? 'read.page' : 'read.snapshot' : 'action.invoke', target: binding.id }]]));
    const presentation = { interactions, lifecycle: { mount: 'messages' } };
    const template = '<template><main node-id="root" read="messages"><h1 node-id="title">Conversation</h1><button node-id="load" on:click="messages">Committed messages</button><button node-id="next" on:click="next">Earlier / next page</button><div node-id="messages" each="bridge.messages.data" item-key="messageId"><article node-id="message"><p node-id="role" bind:text="item.role" /><div node-id="prose" bind:prose="item.content" /></article></div><output node-id="generation" read="generation" bind:text="bridge.generation.data.state" /><p node-id="provisional" bind:prose="bridge.generation.data.text" /><button node-id="submit" on:click="submit">Submit</button><button node-id="cancel" on:click="cancel">Cancel generation</button><output node-id="submitted" bind:text="bridge.submit.status" /><button node-id="save" on:click="save">SavePoint</button><output node-id="saved" bind:text="bridge.save.status" /><button node-id="blocks-load" on:click="blocks">Message Blocks</button><div node-id="blocks" each="bridge.blocks.data" item-key="id"><article node-id="card" bind:text="item.data.label" /></div><component node-id="child" ref="Child" /></main></template>';
    presentation.interactions.next = [{ kind: 'read.page', target: 'messages', cursor: { get: 'bridge.messages.cursor' } }];
    const files = new Map([...fixture.files].filter(([path]) => !path.startsWith('runtime/')));
    files.set('bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings })));
    files.set('Main.aui', Buffer.from(template + '<contract>' + JSON.stringify(presentation) + '</contract>'));
    const compiled = compileFrontend({ source: 'frontend.json', files, mode, experienceContract: fixture.contract });
    fixture.manifest.runtime.experience.frontend.entry = compiled.entry;
    return { ...fixture, bindings, compiled, files: new Map([...files, ...compiled.files]) };
}
