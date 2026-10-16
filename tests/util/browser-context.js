import yaml from 'yaml';

// Small explicit host for tests of browser modules. Missing services stay
// undefined so a new production dependency must be supplied by its test.
export const browserContext = {
    constants: {
        unset: '__@@UNSET@@__',
        promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
        promptTypes: { NONE: 0, IN_PROMPT: 1, IN_CHAT: 2 },
        wiPosition: { before: 0, after: 1, ANTop: 2, ANBottom: 3, EMTop: 4, EMBottom: 5, atDepth: 6 },
    },
    capabilitySettings: {},
    lib: { yaml },
    translate: text => text,
    addLocaleData() {},
    registerCapabilityApi() {},
    getCapabilityApi: () => null,
    skills: { list: async () => [], invocationSettings: async () => ({}) },
    Popup: class {},
    POPUP_TYPE: { DISPLAY: 0 },
};
globalThis.Atria = { getContext: () => browserContext };
