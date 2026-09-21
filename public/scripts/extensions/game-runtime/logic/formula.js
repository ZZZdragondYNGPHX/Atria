const REFERENCE_ROOTS = new Set(['world', 'args', 'selectors']);
const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const BINARY_PRECEDENCE = Object.freeze({
    '||': 1,
    '&&': 2,
    '==': 3,
    '!=': 3,
    '<': 4,
    '<=': 4,
    '>': 4,
    '>=': 4,
    '+': 5,
    '-': 5,
    '*': 6,
    '/': 6,
    '%': 6,
});

function isDigit(char) {
    return char >= '0' && char <= '9';
}

function isIdentifierStart(char) {
    return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
    return /[A-Za-z0-9_]/.test(char);
}

function tokenize(source) {
    const input = String(source ?? '');
    const tokens = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        if (isDigit(char) || (char === '.' && isDigit(input[index + 1]))) {
            const start = index;
            let seenDot = false;
            while (index < input.length) {
                const current = input[index];
                if (current === '.') {
                    if (seenDot) break;
                    seenDot = true;
                    index += 1;
                    continue;
                }
                if (!isDigit(current)) break;
                index += 1;
            }
            const raw = input.slice(start, index);
            const value = Number(raw);
            if (!Number.isFinite(value)) {
                throw new Error('Formula contains an invalid number at offset ' + start);
            }
            tokens.push({ type: 'number', value, offset: start });
            continue;
        }

        if (isIdentifierStart(char)) {
            const start = index;
            index += 1;
            while (index < input.length && isIdentifierPart(input[index])) index += 1;
            tokens.push({ type: 'identifier', value: input.slice(start, index), offset: start });
            continue;
        }

        const pair = input.slice(index, index + 2);
        if (['&&', '||', '==', '!=', '<=', '>='].includes(pair)) {
            tokens.push({ type: 'operator', value: pair, offset: index });
            index += 2;
            continue;
        }

        if ('+-*/%<>!(),.'.includes(char)) {
            const type = '+-*/%<>!'.includes(char) ? 'operator' : 'punctuation';
            tokens.push({ type, value: char, offset: index });
            index += 1;
            continue;
        }

        throw new Error('Formula contains unsupported token at offset ' + index);
    }

    tokens.push({ type: 'eof', value: '', offset: input.length });
    return tokens;
}

function freezeAst(node) {
    if (!node || typeof node !== 'object') return node;
    for (const child of Object.values(node)) {
        if (Array.isArray(child)) {
            child.forEach(freezeAst);
            Object.freeze(child);
        } else {
            freezeAst(child);
        }
    }
    return Object.freeze(node);
}

function parserFor(source) {
    const tokens = tokenize(source);
    let cursor = 0;

    function peek() {
        return tokens[cursor];
    }

    function consume(value = null) {
        const token = tokens[cursor];
        if (value !== null && token.value !== value) {
            throw new Error(`Formula expected '${value}' at offset ${token.offset}`);
        }
        cursor += 1;
        return token;
    }

    function parseReferenceOrCall() {
        const parts = [consume().value];
        while (peek().value === '.') {
            consume('.');
            const next = peek();
            if (next.type !== 'identifier') {
                throw new Error('Formula expected identifier after dot at offset ' + next.offset);
            }
            parts.push(consume().value);
        }

        if (peek().value === '(') {
            consume('(');
            const args = [];
            if (peek().value !== ')') {
                while (true) {
                    args.push(parseExpression(0));
                    if (peek().value !== ',') break;
                    consume(',');
                }
            }
            consume(')');
            return {
                type: 'call',
                callee: parts.join('.'),
                arguments: args,
            };
        }

        const literal = parts.length === 1 ? parts[0] : null;
        if (literal === 'true') return { type: 'literal', value: true };
        if (literal === 'false') return { type: 'literal', value: false };
        if (literal === 'null') return { type: 'literal', value: null };

        if (!REFERENCE_ROOTS.has(parts[0])) {
            throw new Error(`Formula reference root '${parts[0]}' is not allowed`);
        }
        if (parts.some(part => BLOCKED_PATH_SEGMENTS.has(part))) {
            throw new Error('Formula reference contains a blocked path segment');
        }

        return {
            type: 'reference',
            path: parts,
        };
    }

    function parsePrimary() {
        const token = peek();
        if (token.type === 'number') {
            consume();
            return { type: 'literal', value: token.value };
        }
        if (token.type === 'identifier') {
            return parseReferenceOrCall();
        }
        if (token.value === '(') {
            consume('(');
            const expression = parseExpression(0);
            consume(')');
            return expression;
        }
        if (token.type === 'operator' && ['!', '-', '+'].includes(token.value)) {
            const operator = consume().value;
            return {
                type: 'unary',
                operator,
                argument: parsePrimary(),
            };
        }
        throw new Error('Formula expected expression at offset ' + token.offset);
    }

    function parseExpression(minPrecedence) {
        let left = parsePrimary();

        while (true) {
            const token = peek();
            const precedence = BINARY_PRECEDENCE[token.value];
            if (!precedence || precedence < minPrecedence) break;
            const operator = consume().value;
            const right = parseExpression(precedence + 1);
            left = {
                type: 'binary',
                operator,
                left,
                right,
            };
        }

        return left;
    }

    const ast = parseExpression(0);
    if (peek().type !== 'eof') {
        throw new Error('Formula has unexpected token at offset ' + peek().offset);
    }
    return freezeAst(ast);
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(label + ' requires a finite number');
    }
    return value;
}

function requireBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new Error(label + ' requires a boolean');
    }
    return value;
}

function requireValues(values, label) {
    if (values.length === 0) {
        throw new Error(label + ' requires at least one argument');
    }
    return values.map(value => requireFiniteNumber(value, label));
}

function safeReference(context, path) {
    let value = context?.[path[0]];
    for (let index = 1; index < path.length; index += 1) {
        if (!value || typeof value !== 'object') return undefined;
        const segment = path[index];
        if (BLOCKED_PATH_SEGMENTS.has(segment) || !Object.hasOwn(value, segment)) return undefined;
        value = value[segment];
    }
    return value;
}

const BUILTIN_FUNCTIONS = Object.freeze({
    min: (...values) => Math.min(...requireValues(values, 'min')),
    max: (...values) => Math.max(...requireValues(values, 'max')),
    clamp: (value, minimum, maximum) => {
        const current = requireFiniteNumber(value, 'clamp');
        const min = requireFiniteNumber(minimum, 'clamp');
        const max = requireFiniteNumber(maximum, 'clamp');
        if (max < min) throw new Error('clamp maximum must be >= minimum');
        return Math.min(max, Math.max(min, current));
    },
    round: value => Math.round(requireFiniteNumber(value, 'round')),
    floor: value => Math.floor(requireFiniteNumber(value, 'floor')),
    ceil: value => Math.ceil(requireFiniteNumber(value, 'ceil')),
    abs: value => Math.abs(requireFiniteNumber(value, 'abs')),
});

function evaluateBinary(operator, leftNode, rightNode, context, functions) {
    if (operator === '&&') {
        const left = requireBoolean(evaluateNode(leftNode, context, functions), '&&');
        return left ? requireBoolean(evaluateNode(rightNode, context, functions), '&&') : false;
    }
    if (operator === '||') {
        const left = requireBoolean(evaluateNode(leftNode, context, functions), '||');
        return left ? true : requireBoolean(evaluateNode(rightNode, context, functions), '||');
    }

    const left = evaluateNode(leftNode, context, functions);
    const right = evaluateNode(rightNode, context, functions);

    if (operator === '==') return Object.is(left, right);
    if (operator === '!=') return !Object.is(left, right);

    if (['<', '<=', '>', '>='].includes(operator)) {
        const a = requireFiniteNumber(left, operator);
        const b = requireFiniteNumber(right, operator);
        if (operator === '<') return a < b;
        if (operator === '<=') return a <= b;
        if (operator === '>') return a > b;
        return a >= b;
    }

    const a = requireFiniteNumber(left, operator);
    const b = requireFiniteNumber(right, operator);
    let result;
    if (operator === '+') result = a + b;
    else if (operator === '-') result = a - b;
    else if (operator === '*') result = a * b;
    else if (operator === '/') {
        if (b === 0) throw new Error('Formula division by zero');
        result = a / b;
    } else if (operator === '%') {
        if (b === 0) throw new Error('Formula modulo by zero');
        result = a % b;
    } else {
        throw new Error(`Unsupported formula operator '${operator}'`);
    }
    return requireFiniteNumber(result, operator);
}

function evaluateNode(node, context, functions) {
    if (!node || typeof node !== 'object') {
        throw new Error('Formula AST node must be an object');
    }

    if (node.type === 'literal') return node.value;
    if (node.type === 'reference') return safeReference(context, node.path);

    if (node.type === 'unary') {
        const value = evaluateNode(node.argument, context, functions);
        if (node.operator === '!') return !requireBoolean(value, '!');
        if (node.operator === '-') return -requireFiniteNumber(value, 'unary -');
        if (node.operator === '+') return requireFiniteNumber(value, 'unary +');
        throw new Error(`Unsupported formula unary operator '${node.operator}'`);
    }

    if (node.type === 'binary') {
        return evaluateBinary(node.operator, node.left, node.right, context, functions);
    }

    if (node.type === 'call') {
        const fn = functions[node.callee];
        if (typeof fn !== 'function') {
            throw new Error(`Formula function '${node.callee}' is not allowed`);
        }
        const args = node.arguments.map(argument => evaluateNode(argument, context, functions));
        return fn(...args);
    }

    throw new Error(`Unsupported Formula AST node type '${String(node.type)}'`);
}

export function compileFormula(source) {
    const text = String(source ?? '').trim();
    if (!text) throw new Error('Formula source must be non-empty');
    if (text.length > 4096) throw new Error('Formula source exceeds 4096 characters');
    return parserFor(text);
}

export function evaluateFormulaAst(ast, context = {}, options = {}) {
    const functions = {
        ...BUILTIN_FUNCTIONS,
        ...(options.functions || {}),
    };
    return evaluateNode(ast, context, functions);
}

export function evaluateFormula(sourceOrAst, context = {}, options = {}) {
    const ast = typeof sourceOrAst === 'string'
        ? compileFormula(sourceOrAst)
        : sourceOrAst;
    return evaluateFormulaAst(ast, context, options);
}
