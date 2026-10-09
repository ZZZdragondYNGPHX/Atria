// The fixed evaluation worker alone opens independent promotion fixtures.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { validateCase, loadFixture } from './cases.js';
import { PROMOTION_SOURCE_PINS } from './pilot-sources.js';

export function readSealedSource(entry, directory) {
    validateCase(entry);
    const pin = PROMOTION_SOURCE_PINS.find(p => p.sourceId === entry.sourceId);
    if (entry.split !== 'promotion' || !pin || typeof directory !== 'string' || !isAbsolute(directory)
        || realpathSync(directory) !== resolve(directory)) throw new Error('sealed_source_unavailable');
    const file = join(directory, pin.sourceId + '.json');
    if (!lstatSync(file).isFile() || realpathSync(file) !== file) throw new Error('sealed_source_unavailable');
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== pin.fileSha256) throw new Error('sealed_source_changed');
    const source = JSON.parse(bytes.toString('utf8'));
    // Also checks canonical input/fixture hashes, domain, split, origin and
    // independent root/template/derivation pins; byte integrity alone is not enough.
    loadFixture(entry, { purpose: 'evaluation', sealedSource: source });
    return source;
}
