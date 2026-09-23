import { describe, expect, test } from '@jest/globals';

import {
    createAuthoringOperation,
    createHumanOrigin,
    createStudioWorkspace,
    flattenComponentTree,
    patchProjectSource,
    projectSaveOperation,
    sourceWriteOperation,
    updateComponentNode,
} from '../../public/scripts/native/studio-authoring.js';

function ids() {
    let value = 0;
    return () => '00000000-0000-4000-8000-' + String(++value).padStart(12, '0');
}

describe('A7 Studio authoring helpers', () => {
    test('creates explicit human Authoring Operations inside one revision-pinned Workspace', () => {
        const idFactory = ids();
        const origin = createHumanOrigin('atria.studio');
        const first = createAuthoringOperation({
            operationType: 'source.write',
            target: { path: 'ui/main.json' },
            input: { content: '{}', encoding: 'utf8' },
            origin,
            idFactory,
        });
        const second = projectSaveOperation('project_11111111111111111111111111111111', {
            format: 'atria-project-source',
        }, { origin, idFactory });

        const workspace = createStudioWorkspace({
            projectId: 'project_11111111111111111111111111111111',
            baseRevision: 'rev_base',
            origin,
            operations: [first, second],
            idFactory,
        });

        expect(workspace.baseRevision).toBe('rev_base');
        expect(workspace.origin).toEqual({ kind: 'human', id: 'atria.studio' });
        expect(workspace.operations).toHaveLength(2);
        expect(workspace.operations.every(operation => (
            operation.origin.kind === 'human' && operation.origin.id === 'atria.studio'
        ))).toBe(true);
        expect(workspace.operations.map(operation => operation.operationType))
            .toEqual(['source.write', 'project.save']);
    });

    test('source helper never writes ProjectStore directly and emits the A1 source operation shape', () => {
        const operation = sourceWriteOperation('ui/main.json', '{"id":"root"}', { idFactory: ids() });
        expect(operation).toEqual(expect.objectContaining({
            operationType: 'source.write',
            target: { path: 'ui/main.json' },
            input: { content: '{"id":"root"}', encoding: 'utf8' },
        }));
    });

    test('structured project patches and component edits are immutable round trips', () => {
        const source = { package: { name: 'Before' } };
        const patched = patchProjectSource(source, next => {
            next.package.name = 'After';
        });
        expect(source.package.name).toBe('Before');
        expect(patched.package.name).toBe('After');

        const model = {
            id: 'root',
            type: 'container',
            children: [{ id: 'label', type: 'text', props: { text: 'Before' } }],
        };
        const next = updateComponentNode(model, 'label', node => ({
            ...node,
            props: { ...node.props, text: 'After' },
        }));
        expect(model.children[0].props.text).toBe('Before');
        expect(next.children[0].props.text).toBe('After');
        expect(flattenComponentTree(next).map(item => item.id)).toEqual(['root', 'label']);
    });
});
