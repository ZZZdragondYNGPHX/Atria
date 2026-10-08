// Accept a complete JSON document, optionally enclosed in one JSON fence.
// Never extract a fragment from commentary or repair malformed model output.
export function parseEvaluationJson(value) {
    if (typeof value !== 'string') throw new TypeError('evaluation_json_text_required');
    const text = value.trim(), fenced = /^```(?:json)?\r?\n([\s\S]*)\r?\n```$/.exec(text);
    return JSON.parse(fenced ? fenced[1] : text);
}
