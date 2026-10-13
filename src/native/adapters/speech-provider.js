import { createWindowsSapiProvider } from './windows-sapi-provider.js';
import { createEspeakProvider } from './espeak-provider.js';
export function createLocalSpeechProvider() {
    return process.platform === 'win32' ? createWindowsSapiProvider() : createEspeakProvider();
}
