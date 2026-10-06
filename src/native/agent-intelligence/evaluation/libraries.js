// Node libraries used by the trusted RP evaluator. Browser presentation ports
// deliberately fail if reached; no HTML rendering is part of evaluation.
export { default as lodash } from 'lodash';
export { default as Fuse } from 'fuse.js';
export { default as Handlebars } from 'handlebars';
export { default as DiffMatchPatch } from 'diff-match-patch';
export { default as yaml } from 'yaml';
export { default as seedrandom } from 'seedrandom';
export { default as droll } from 'droll';
export { default as chalk } from 'chalk';
export { sha256 } from 'js-sha256';
const unavailable = () => { throw new Error('evaluation_presentation_unavailable'); };
export const DOMPurify = { sanitize: unavailable };
export const localforage = { getItem: unavailable, setItem: unavailable };
export const showdown = { Converter: unavailable };
export const hljs = { highlight: unavailable };
export const moment = unavailable, morphdom = unavailable, slideToggle = unavailable, SVGInject = unavailable;
export default {};
