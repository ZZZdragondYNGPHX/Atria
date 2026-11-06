import { parentPort, workerData } from 'node:worker_threads';
import { applyNativeRegexValue } from '../../public/shared/native-regex.js';
const { text, scripts, options } = workerData;
const result = applyNativeRegexValue(text, scripts, options, ruleId => parentPort.postMessage({ ruleId }));
parentPort.postMessage({ result: { text: result.value, diagnostics: result.diagnostics } });
