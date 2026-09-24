// Compatibility names for reference-only World Info callers. Native owns evaluation.
import { STATE_CONDITION_RESULT as WORLD_INFO_CONDITION_RESULT } from './native/state-conditions.js';
export {
    STATE_CONDITION_RESULT as WORLD_INFO_CONDITION_RESULT,
    STATE_CONDITION_OPERATORS as WORLD_INFO_CONDITION_OPERATORS,
    evaluateStateCondition as evaluateWorldInfoStateCondition,
    evaluateStateConditions as evaluateWorldInfoStateConditions,
} from './native/state-conditions.js';

/**
 * Decide whether a successful state-condition evaluation is allowed to become
 * an activation source by itself. This is the W-03 scene-persistence boundary:
 * the provider remains the owner of scene state; World Info only observes the
 * committed snapshot and never creates a second scene state machine.
 *
 * @param {object} entry
 * @param {{status:string}|null} evaluation
 * @returns {boolean}
 */
export function shouldActivateWorldInfoFromStateConditions(entry, evaluation) {
    return entry?.stateActivation === true
        && Array.isArray(entry?.stateConditions)
        && entry.stateConditions.length > 0
        && evaluation?.status === WORLD_INFO_CONDITION_RESULT.TRUE;
}
