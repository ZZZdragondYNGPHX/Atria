// Accept a complete JSON document, optionally enclosed in one JSON fence.
// Never extract a fragment from commentary or repair malformed model output.
export function parseEvaluationJson(value) {
    if (typeof value !== 'string') throw new TypeError('evaluation_json_text_required');
    const text = value.trim(), fenced = /^```(?:json)?\r?\n([\s\S]*)\r?\n```$/.exec(text);
    return JSON.parse(fenced ? fenced[1] : text);
}

// Apply bounded model edits against the declared original text. Unmentioned
// instructions survive byte-for-byte; ambiguous anchors never pick a match.
export function applyEvolutionProposal(parsed, base) {
    const keys = Object.keys(parsed || {}).sort().join(',');
    if (typeof base !== 'string') {
        if (keys !== 'rationale,value' || !Number.isSafeInteger(parsed.value)) throw new TypeError('evolution_integer_proposal_required');
        return parsed;
    }
    if (keys !== 'edits,rationale' || !Array.isArray(parsed.edits) || parsed.edits.length < 1 || parsed.edits.length > 4) throw new TypeError('evolution_text_edits_required');
    const edits = parsed.edits.map(edit => {
        if (Object.keys(edit || {}).sort().join(',') !== 'after,before' || typeof edit.before !== 'string' || typeof edit.after !== 'string'
            || edit.before.length > 8192 || edit.after.length > 4096 || edit.before === edit.after || edit.before === base && base !== '') throw new TypeError('evolution_edit_invalid');
        const start = edit.before === '' ? base.length : base.indexOf(edit.before);
        if (start < 0 || edit.before && base.indexOf(edit.before, start + 1) >= 0) throw new TypeError('evolution_edit_anchor_ambiguous');
        return { start, end: start + edit.before.length, after: edit.after };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < edits.length; i++) if (edits[i].start < edits[i - 1].end || edits[i].start === edits[i - 1].start) throw new TypeError('evolution_edits_overlap');
    let value = base;
    for (const edit of edits.toReversed()) value = value.slice(0, edit.start) + edit.after + value.slice(edit.end);
    return { value, rationale: parsed.rationale };
}
