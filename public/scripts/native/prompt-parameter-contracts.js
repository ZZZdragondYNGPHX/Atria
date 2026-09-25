import { formatShellText } from '../atria-shell/localization.js';
import { validatePromptParameters as validate } from '../../shared/prompt-parameters.js';
export { validatePromptSelection } from '../../shared/prompt-parameters.js';

export function validatePromptParameters(definitions) {
    try { return validate(definitions, formatShellText); } catch (error) {
        const messages = {
            prompt_parameter_choice_required: 'An exclusive choice needs an authored default or Required parameter enabled.',
            prompt_parameter_options: 'Use distinct option values matching the parameter type, and give every option a label.',
            prompt_parameter_option: 'The default must match one of the declared options.',
            prompt_parameter_metadata: 'Control labels and descriptions must contain 1 to 512 characters.',
        };
        if (messages[error.message]) throw new TypeError(formatShellText(messages[error.message]));
        throw error;
    }
}
