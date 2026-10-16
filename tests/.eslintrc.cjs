module.exports = {
    root: true,
    plugins: [
        'jest',
        'playwright',
    ],
    extends: [
        'eslint:recommended',
        'plugin:jest/recommended',
    ],
    env: {
        es6: true,
        node: true,
        browser: true,
        jquery: true,
        'jest/globals': true,
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    overrides: [
        {
            extends: ['plugin:playwright/recommended'],
            files: ['**/*.e2e.js', 'e2e/_lib/*.js'],
            env: {
                browser: true,
            },
        },
    ],
    ignorePatterns: [
        '*.min.js',
        'node_modules/**/*',
    ],
    globals: {
        globalThis: 'readonly',
        Atria: 'readonly',
        SillyTavern: 'readonly',
    },
    rules: {
        'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
        'no-control-regex': 'off',
        'no-constant-condition': ['error', { checkLoops: false }],
        'require-yield': 'off',
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'indent': ['error', 4, { SwitchCase: 1, FunctionDeclaration: { parameters: 'first' } }],
        'comma-dangle': ['error', 'always-multiline'],
        'eol-last': ['error', 'always'],
        'no-trailing-spaces': 'error',
        'object-curly-spacing': ['error', 'always'],
        'space-infix-ops': 'error',
        'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
        'no-cond-assign': 'error',
        'jest/no-standalone-expect': ['error', { additionalTestBlockFunctions: ['platformSpecific', 'posixTest'] }],

        // These rules should eventually be enabled.
        'no-async-promise-executor': 'off',
        'no-inner-declarations': 'off',
    },
    settings: {
        jest: {
            version: 29,
        },
    },
};
