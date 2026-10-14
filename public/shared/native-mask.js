import { visualObject, visualError, visualInteger } from './native-visual-contract.js';

export function maskGeometry(width, height) {
    visualInteger(width, 1, 32768); visualInteger(height, 1, 32768);
    if (width * height > 16777216) visualError('mask_limit');
    return { width, height };
}
export function assertMaskCommand(command, width, height) {
    visualObject(command, ['kind', 'points', 'radius', 'value', 'x', 'y', 'width', 'height']);
    visualInteger(command.value, 0, 255);
    if (command.kind === 'stroke') {
        visualInteger(command.radius, 1, 256);
        if (!Array.isArray(command.points) || !command.points.length || command.points.length > 2048) visualError('mask_command_invalid');
        for (const point of command.points) { visualObject(point, ['x', 'y']); visualInteger(point.x, 0, width - 1); visualInteger(point.y, 0, height - 1); }
    } else if (command.kind === 'rect') {
        visualInteger(command.x, 0, width - 1); visualInteger(command.y, 0, height - 1); visualInteger(command.width, 1, width - command.x); visualInteger(command.height, 1, height - command.y);
    } else if (command.kind !== 'fill') visualError('mask_command_invalid');
    return structuredClone(command);
}
export function replayMask(checkpoint, commands, cursor, width, height) {
    maskGeometry(width, height);
    if (!(checkpoint instanceof Uint8Array) || checkpoint.length !== width * height || !Array.isArray(commands) || commands.length > 100) visualError('mask_invalid');
    visualInteger(cursor, 0, commands.length);
    const out = new Uint8Array(checkpoint); let work = 0;
    const budget = count => { work += count; if (work > 64000000) visualError('mask_work_limit'); };
    for (const original of commands.slice(0, cursor)) {
        const command = assertMaskCommand(original, width, height);
        if (command.kind === 'fill') { budget(out.length); out.fill(command.value); } else if (command.kind === 'rect') {
            budget(command.width * command.height);
            for (let y = command.y; y < command.y + command.height; y++) out.fill(command.value, y * width + command.x, y * width + command.x + command.width);
        } else {
            const dot = (x, y) => {
                const r = command.radius, x0 = Math.max(0, x - r), x1 = Math.min(width - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(height - 1, y + r);
                budget((x1 - x0 + 1) * (y1 - y0 + 1));
                for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) out[yy * width + xx] = command.value;
            };
            command.points.forEach((point, index) => {
                const previous = command.points[index - 1];
                if (!previous) return dot(point.x, point.y);
                const distance = Math.hypot(point.x - previous.x, point.y - previous.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, command.radius / 2)));
                for (let step = 1; step <= steps; step++) dot(Math.round(previous.x + (point.x - previous.x) * step / steps), Math.round(previous.y + (point.y - previous.y) * step / steps));
            });
        }
    }
    return out;
}
export function maskPixelFromScreen(clientX, clientY, rect, { scale, offsetX, offsetY }, width, height) {
    if (!Number.isFinite(scale) || scale <= 0) visualError('mask_transform_invalid');
    return { x: Math.max(0, Math.min(width - 1, Math.floor((clientX - rect.left - offsetX) / scale))),
        y: Math.max(0, Math.min(height - 1, Math.floor((clientY - rect.top - offsetY) / scale))) };
}
