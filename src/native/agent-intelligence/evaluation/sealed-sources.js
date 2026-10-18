import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readSealedSource(entry, directory) {
    return JSON.parse(readFileSync(join(directory, entry.sourceId + '.json'), 'utf8'));
}
