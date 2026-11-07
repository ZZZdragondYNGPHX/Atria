// Memory work runs as the Memory job. Its model is the one chosen for that job
// in Model roles; there is no second, memory-only model setting.
export function memoryRouteOptions() {
    return { nativeRole: 'memory' };
}
