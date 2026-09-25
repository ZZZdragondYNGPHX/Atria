import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L08 high-value incident wiring', () => {
    test('dispatch final failure creates a correlated generation incident', () => {
        const source = readFileSync(new URL('../../src/atria-dispatch/runner.js', import.meta.url), 'utf8');
        expect(source).toContain("type: 'generation_failure'");
        expect(source).toContain("stage: 'dispatch.execute'");
        expect(source).toContain('captureBackendIncident({');
    });

    test('extension install/update carry operation id and staged incidents', () => {
        const source = readFileSync(new URL('../../src/endpoints/capability-host.js', import.meta.url), 'utf8');
        expect(source).toContain("response.setHeader('x-atria-operation-id'");
        expect(source).toContain("diagnosticStage = 'clone'");
        expect(source).toContain("diagnosticStage = 'manifest'");
        expect(source).toContain("type: 'extension_install_failure'");
        expect(source).toContain("type: 'extension_update_failure'");
        expect(source).toContain("response.setHeader('x-atria-failure-stage'");
    });

    test('server plugin import/init/runtime boundaries create plugin incidents', () => {
        const source = readFileSync(new URL('../../src/plugin-loader.js', import.meta.url), 'utf8');
        expect(source).toContain("stage: 'load.import'");
        expect(source).toContain("stage: 'activate.init'");
        expect(source).toContain("stage: 'route.runtime'");
        expect(source).toContain("probableOwner: 'server-plugin'");
    });

    test('frontend global error adapter creates ownership-aware extension incidents', () => {
        const source = readFileSync(new URL('../../public/scripts/logging/error-adapter.js', import.meta.url), 'utf8');
        expect(source).toContain('attributeFrontendOwnership');
        expect(source).toContain("'extension_runtime_failure'");
        expect(source).toContain('captureFrontendIncident');
    });
});
