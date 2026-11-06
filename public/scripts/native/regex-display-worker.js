import { applyNativeRegexValue } from '../../shared/native-regex.js';

self.onmessage = ({ data }) => {
    self.postMessage({ result: applyNativeRegexValue(data.value, data.scripts, data.options, ruleId => self.postMessage({ ruleId })) });
};
