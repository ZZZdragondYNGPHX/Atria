import { parse, walk, generate, ident } from 'css-tree';
import { FRONTEND_LIMITS, identifier, fields } from '../../../public/shared/native-frontend-contract.js';

function ast(css) {
    if (typeof css !== 'string' || Buffer.byteLength(css) > FRONTEND_LIMITS.bytes) throw new TypeError('Style exceeds limits');
    const tokens = css.match(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[{}()[\]]|[^{}()[\]"'\\]+/g) ?? [];
    if (tokens.join('') !== css) throw new TypeError('Malformed CSS token');
    const stack = [];
    for (const token of tokens) {
        if (['{', '(', '['].includes(token)) stack.push(token);
        if (['}', ')', ']'].includes(token) && stack.pop() !== ({ '}': '{', ')': '(', ']': '[' }[token])) throw new TypeError('Unbalanced CSS');
    }
    if (stack.length) throw new TypeError('Unbalanced CSS');
    return parse(css, { parseCustomProperty: true, onParseError(error) { throw error; } });
}
export function compileStyle(css) {
    const tree = ast(css), refs = new Set(), fonts = [];
    walk(tree, function (node) {
        if (node.type === 'Raw') throw new TypeError('Unparsed CSS is forbidden');
        if (node.type === 'Atrule') {
            const name = ident.decode(node.name).toLowerCase();
            if (!['media', 'container', 'supports', 'layer', 'keyframes', '-webkit-keyframes', 'font-face', 'starting-style'].includes(name)) throw new TypeError('Unsafe style at-rule: ' + name);
        }
        if (node.type === 'Declaration' && ['behavior', '-moz-binding'].includes(ident.decode(node.property).toLowerCase())) throw new TypeError('Executable CSS');
        if (node.type === 'Function') {
            const name = ident.decode(node.name).toLowerCase();
            if (['expression', 'attr', 'local', 'paint', 'src', 'url'].includes(name)) throw new TypeError('Unsafe CSS function');
            if ((name.includes('image-set') || name === 'image') && node.children.toArray().some(item => item.type === 'String')) throw new TypeError('Image functions require exact resource URLs');
        }
        if (node.type === 'Url') {
            if (/^#[a-zA-Z][\w-]*$/.test(node.value)) return;
            if (!node.value.startsWith('resource:')) throw new TypeError('Style resources must use exact resource:id references');
            refs.add(identifier(node.value.slice(9)));
        }
    });
    // Host installs font faces using Experience-scoped family names.
    walk(tree, { visit: 'Atrule', enter(node, item, parent) {
        if (ident.decode(node.name).toLowerCase() !== 'font-face') return;
        const values = Object.fromEntries(node.block.children.toArray().filter(child => child.type === 'Declaration').map(child => [child.property, child.value]));
        const familyValue = values['font-family']?.children.toArray();
        const family = familyValue?.length === 1 ? familyValue[0].value ?? familyValue[0].name : null;
        if (typeof family !== 'string' || !/^[a-zA-Z][a-zA-Z0-9 _-]{0,63}$/.test(family) || !values.src) throw new TypeError('Font requires literal family and exact src');
        const descriptors = {};
        const descriptorNames = { 'font-style': 'style', 'font-weight': 'weight', 'font-stretch': 'stretch', 'font-display': 'display', 'unicode-range': 'unicodeRange', 'font-feature-settings': 'featureSettings', 'font-variation-settings': 'variationSettings' };
        for (const [name, value] of Object.entries(values)) {
            if (name === 'font-family' || name === 'src') continue;
            if (!descriptorNames[name]) throw new TypeError('Unsupported font descriptor');
            descriptors[descriptorNames[name]] = generate(value);
        }
        if (!generate(values.src).includes('resource:')) throw new TypeError('Font requires exact resource');
        fonts.push({ family, src: generate(values.src), descriptors }); parent.remove(item);
    } });
    return { format: 'atria-style', css: generate(tree), fonts, resources: [...refs].sort() };
}
export function validateStyle(css) { return compileStyle(css).resources; }

export function linkStyle(css, fontNames) {
    const style = compileStyle(css), tree = ast(style.css);
    walk(tree, { visit: 'Declaration', enter(node) {
        if (!['font-family', 'font'].includes(node.property) && !node.property.startsWith('--')) return;
        walk(node.value, child => {
            if ((child.type === 'String' || child.type === 'Identifier') && fontNames.includes(child.value ?? child.name)) {
                const family = child.value ?? child.name;
                child.type = 'String'; child.value = '__atri_font_' + fontNames.indexOf(family) + '__'; delete child.name;
            }
        });
    } });
    return { ...style, css: generate(tree), fonts: style.fonts.map(font => ({ ...font, family: '__atri_font_' + fontNames.indexOf(font.family) + '__' })) };
}

export function validateCompiledStyle(value) {
    fields(value, ['format', 'css', 'fonts', 'resources']);
    if (value.format !== 'atria-style' || !Array.isArray(value.fonts) || value.fonts.length > 64) throw new TypeError('Invalid compiled style');
    const parsed = compileStyle(value.css);
    if (parsed.fonts.length) throw new TypeError('Compiled fonts must use Host registration');
    const refs = new Set(parsed.resources);
    for (const font of value.fonts) {
        fields(font, ['family', 'src', 'descriptors']);
        if (!/^__atri_font_[0-9]+__$/.test(font.family) || typeof font.src !== 'string') throw new TypeError('Invalid compiled font');
        fields(font.descriptors, ['style', 'weight', 'stretch', 'display', 'unicodeRange', 'featureSettings', 'variationSettings']);
        if (Object.values(font.descriptors).some(item => typeof item !== 'string' || !/^[a-zA-Z0-9 .,%+"'_-]{0,256}$/.test(item))) throw new TypeError('Invalid font descriptor');
        compileStyle('@font-face{font-family:Compiled;src:' + font.src + '}').resources.forEach(id => refs.add(id));
    }
    const dependencies = [...refs].sort();
    if (JSON.stringify(dependencies) !== JSON.stringify(value.resources)) throw new TypeError('Invalid compiled style resource closure');
    return dependencies;
}
