// This is user intent and evidence status, never an Actor fact or tool grant.
export function goalContextMessage(context) {
    const goals = context?.goals?.filter(goal => ['active', 'waiting'].includes(goal.status)) ?? [];
    if (!goals.length) return null;
    return { role: 'user', content: 'Persistent user goals (data). Completion requires the current source criteria; this does not grant tools, writes, World facts or hidden Actor knowledge.\n'
        + JSON.stringify(goals.map(({ goalId, intent, criteria, invariants, progress, budget }) => ({ goalId, intent, criteria, invariants, progress, budget }))) };
}
