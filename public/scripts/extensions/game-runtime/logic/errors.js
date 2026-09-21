function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export const GAME_LOGIC_ERROR_CODES = Object.freeze({
    COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',
    COMMAND_ARGUMENTS_INVALID: 'COMMAND_ARGUMENTS_INVALID',
    COMMAND_VALIDATOR_FAILED: 'COMMAND_VALIDATOR_FAILED',
    COMMAND_PRECONDITION_FAILED: 'COMMAND_PRECONDITION_FAILED',
    COMMAND_EXECUTION_FAILED: 'COMMAND_EXECUTION_FAILED',
    RULE_EVALUATION_FAILED: 'RULE_EVALUATION_FAILED',
    SIMULATION_FAILED: 'SIMULATION_FAILED',
    COMMIT_FAILED: 'COMMIT_FAILED',
});

export class GameLogicError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'GameLogicError';
        this.code = String(code || 'GAME_LOGIC_ERROR');
        this.stage = String(options.stage || 'runtime');
        this.commandId = options.commandId ? String(options.commandId) : null;
        this.transactionId = options.transactionId ? String(options.transactionId) : null;
        this.details = options.details === undefined ? null : clone(options.details);
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            stage: this.stage,
            message: this.message,
            commandId: this.commandId,
            transactionId: this.transactionId,
            details: clone(this.details),
        };
    }
}

export function wrapGameLogicError(error, descriptor) {
    if (error instanceof GameLogicError) return error;

    const baseMessage = String(descriptor?.message || 'Game Logic Runtime failed');
    const causeMessage = error?.message || String(error);
    return new GameLogicError(
        descriptor?.code || 'GAME_LOGIC_ERROR',
        baseMessage + ': ' + causeMessage,
        {
            cause: error,
            stage: descriptor?.stage,
            commandId: descriptor?.commandId,
            transactionId: descriptor?.transactionId,
            details: descriptor?.details,
        },
    );
}
