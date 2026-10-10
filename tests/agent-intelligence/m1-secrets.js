// Keep the injected port stable: GenerationService freezes its ports.
export function createM1SecretPort(primary, secondary) {
    let selected = primary;
    return { port: { resolveSecret: async ref => {
        if (ref.secretId !== 's06-test-key') throw new Error('unknown_secret_reference');
        return selected.apiKey;
    } }, select(model) {
        const next = [primary, secondary].filter(Boolean).find(c => c.config.model === model);
        if (!next) throw new Error('unknown_test_model');
        const previous = selected; selected = next;
        return () => { selected = previous; };
    } };
}
