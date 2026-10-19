export function selectNativeTaskContext(items, task) {
    const context = task.context;
    return items.filter(item => {
        if (item.kind === 'context.player-persona') return context.includes('player_persona');
        if (item.id.startsWith('projection:')) return context.includes('projection');
        if (item.id.startsWith('memory:')) return true;
        return item.kind === 'context.history' ? context.includes('history')
            : item.id.startsWith('knowledge:') ? context.includes('knowledge')
                : item.id === 'state:atri_world_state' && context.includes('world');
    });
}
