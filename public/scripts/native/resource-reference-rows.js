import { resourceReferenceForNode } from './studio-authoring.js';
import { el, action, disclosure } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function renderResourceReferenceRows({ document: doc, root, references, host, onOpen = null, onManage = null }) {
    if (!references?.length) { el(doc, 'p', '', tl('No references'), root); return; }
    for (const item of references) {
        const node = item.node || {}; const ref = resourceReferenceForNode(node); const scope = String(node.scope || '').split('/');
        const row = el(doc, 'article', 'atri-library-version', undefined, root); row.dataset.atriaReferenceRow = node.key || node.resourceId || '';
        el(doc, 'h4', '', node.displayName || tl('Unavailable resource'), row);
        el(doc, 'p', 'atri-library-meta', [item.owner, node.revision || node.metadata?.exactRef?.revision, item.edge?.kind].filter(Boolean).join(' · '), row);
        disclosure(doc, row, 'Exact reference', { ref, edge: item.edge, metadata: node.metadata });
        let open;
        if (item.edge?.kind === 'runtime-route-exact') open = () => host?.openRuntimeSection('routes', node.resourceId);
        else if (scope[0] === 'project') open = () => onOpen?.(node) === true || host?.openBuild(node.projectId || scope[1], item.owner);
        else if (scope[0] === 'package') open = () => host?.openLibraryWork(node.packageId || scope[1], item.owner);
        else if (node.resourceType === 'core.world') open = () => host?.openLibraryWorld(node.resourceId, node.displayName);
        else if (node.resourceType === 'core.knowledge') open = () => host?.openLibraryKnowledge(node.resourceId, node.displayName);
        else if (node.resourceType === 'core.knowledge-entry' || node.resourceType === 'core.knowledge-binding') open = node.metadata?.knowledgeBaseId ? () => host?.openLibraryKnowledge(node.metadata.knowledgeBaseId, node.displayName) : null;
        else if (node.resourceType === 'core.package') open = () => host?.openLibraryWork(node.resourceId, node.displayName);
        else if (['core.prompt-program', 'core.prompt-module', 'core.generation-profile'].includes(node.resourceType)) open = () => host?.openLibraryResource(ref, node.displayName);
        else if (onOpen) open = () => onOpen(node);
        if (open) action(doc, row, 'Open owner', open);
        if (onManage && ref && scope[0] === 'library' && ['core.world', 'core.knowledge', 'core.asset'].includes(node.resourceType)) action(doc, row, 'Review relationship', () => onManage(node, ref));
    }
}
