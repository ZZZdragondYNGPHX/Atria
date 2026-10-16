import { expect, test } from '@jest/globals';
import { readFieldsByPaths } from '../../public/scripts/iteration-library/read-fields-helper.js';

test('schema reads preserve full authored fields, arrays, false and missing paths', () => {
    const schema = [{ id: 'event', instructions: 'x'.repeat(6000), enabled: false, columns: ['title'] }];
    expect(readFieldsByPaths(schema, ['[0].instructions', '[0].enabled', '[0].columns', '[1].id'])).toEqual({
        '[0].instructions': schema[0].instructions,
        '[0].enabled': false,
        '[0].columns': ['title'],
        '[1].id': null,
        missing_paths: ['[1].id'],
    });
});

test('tool input requires path strings and reads only own JSON fields', () => {
    expect(() => readFieldsByPaths({}, ['id', null])).toThrow('invalid_args');
    expect(readFieldsByPaths({}, ['constructor.name', '__proto__'])).toEqual({
        'constructor.name': null, ['__proto__']: null, missing_paths: ['constructor.name', '__proto__'],
    });
});
