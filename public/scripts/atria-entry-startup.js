/*
 * Startup cover: Folios (the reopened story unfolds as three paper sheets)
 * inside a soft Constellation sky. It runs before the module graph, reads
 * only the device-local snapshot written by atria-shell/startup-resume.js,
 * and must keep working if every module fails to load.
 */
(() => {
    const root = document.documentElement;
    const cover = document.getElementById('preloader');
    if (!cover) {
        root.removeAttribute('data-atria-starting');
        return;
    }

    const RESUME_KEY = 'atria.startup.resume';
    const APPEARANCE_KEY = 'atria.startup.appearance';
    const UNFOLDED_MS = 1500;
    const SEAL_HOLD_MS = 240;
    // How long a resumed cover may wait for the reopened conversation once
    // the app is ready; the cover never holds a ready app longer than this.
    const REOPEN_WAIT_MS = 600;
    // A deep link to another workspace is not a story resume.
    const DEEP_LINK = (() => {
        try {
            const route = new URLSearchParams(window.location.search).get('atriaRoute');
            return Boolean(route && route !== 'play');
        } catch { return false; }
    })();
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = Boolean(motionQuery?.matches);
    const started = performance.now();

    function read(key) {
        try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
    }
    function clip(value, max) {
        return typeof value === 'string' ? value.trim().slice(0, max) : '';
    }

    let locale = 'en';
    try { locale = String(window.localStorage.getItem('language') || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'; } catch { /* Browser storage may be unavailable. */ }
    const STRINGS = {
        en: {
            starting: 'Starting Atria',
            reopening: name => `Reopening ${name}`,
            preparing: 'Preparing your workspace…',
            resuming: 'Returning to your story…',
            stalled: 'Still preparing your workspace. You can reload if startup does not finish.',
            reload: 'Reload Atria',
            work: 'Work',
            cast: 'Cast',
            leftOff: 'Where you left off',
            place: 'Your place',
            turn: 'Turn',
            lastRead: 'Last read',
            persona: 'Playing as',
            empty: 'Your story starts here',
            tagline: 'A place to play, keep and create interactive stories.',
            memories: 'Memories',
            recalledHead: 'Recalled last turn',
            rememberedHead: 'Most remembered',
        },
        zh: {
            starting: '正在启动 Atria',
            reopening: name => `正在重新打开《${name}》`,
            preparing: '正在准备你的工作区…',
            resuming: '正在回到你的故事…',
            stalled: '工作区仍在准备中。如果启动迟迟没有完成，可以重新加载。',
            reload: '重新加载 Atria',
            work: '作品',
            cast: '登场',
            leftOff: '上次读到',
            place: '你的位置',
            turn: '回合',
            lastRead: '上次阅读',
            persona: '扮演',
            empty: '你的故事从这里开始',
            tagline: '游玩、收藏与创作互动故事的地方。',
            memories: '记忆',
            recalledHead: '上回合唤起',
            rememberedHead: '最深的记忆',
        },
    }[locale];

    // Theme: match the appearance the shell resolved last time so a dark
    // reader is not flashed with paper before themes restore.
    const appearance = read(APPEARANCE_KEY);
    if (appearance && typeof appearance === 'object') {
        cover.dataset.appearance = appearance.appearance === 'dark' ? 'dark' : 'light';
        const colors = appearance.colors && typeof appearance.colors === 'object' ? appearance.colors : {};
        for (const role of ['canvas', 'surface-1', 'surface-2', 'separator', 'text-primary', 'text-secondary', 'text-tertiary', 'accent', 'accent-text', 'info', 'committed', 'unknown']) {
            const value = clip(colors[role], 64);
            if (value && /^[#a-z0-9(),.%\s/-]+$/i.test(value)) cover.style.setProperty(`--atri-${role}`, value);
        }
        if (cover.style.getPropertyValue('--atri-canvas')) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cover.style.getPropertyValue('--atri-canvas'));
    } else {
        cover.dataset.appearance = 'light';
    }

    const resume = DEEP_LINK ? null : (() => {
        const value = read(RESUME_KEY);
        if (!value || value.v !== 1) return null;
        const work = clip(value.work, 120);
        const title = clip(value.title, 160) || work;
        if (!title) return null;
        const lines = Array.isArray(value.lines) ? value.lines.slice(-2).map(line => ({
            who: clip(line?.who, 60),
            role: line?.role === 'user' ? 'user' : 'assistant',
            text: clip(line?.text, 360),
        })).filter(line => line.text) : [];
        return {
            work,
            title,
            version: clip(value.version, 32),
            cast: Array.isArray(value.cast) ? value.cast.map(name => clip(name, 40)).filter(Boolean).slice(0, 4) : [],
            persona: clip(value.persona, 60),
            turn: Number.isFinite(value.turn) && value.turn > 0 ? Math.floor(value.turn) : 0,
            at: Number.isFinite(value.at) ? value.at : 0,
            lines,
            memory: readMemory(value.memory),
        };
    })();

    // The branch's memory map, as digested by startup-resume.js.
    function readMemory(value) {
        if (!value || typeof value !== 'object' || !Array.isArray(value.stars)) return null;
        const kinds = ['entity', 'fact', 'node', 'episode'];
        const stars = value.stars.slice(0, 96).map(star => ({
            kind: kinds.includes(star?.k) ? star.k : 'fact',
            weight: Number.isFinite(star?.w) ? Math.min(1, Math.max(0, star.w)) : .5,
            recalled: star?.r === 1,
            label: clip(star?.l, 24),
        }));
        const links = Array.isArray(value.links) ? value.links.slice(0, 160).filter(link => Array.isArray(link)
            && Number.isInteger(link[0]) && Number.isInteger(link[1]) && link[0] !== link[1] && stars[link[0]] && stars[link[1]]) : [];
        const count = key => (Number.isFinite(value.totals?.[key]) && value.totals[key] > 0 ? Math.floor(value.totals[key]) : 0);
        return {
            stars,
            links: links.map(link => ({ a: link[0], b: link[1], support: link[2] === 1 })),
            notable: Array.isArray(value.notable) ? value.notable.map(text => clip(text, 64)).filter(Boolean).slice(0, 3) : [],
            notableRecalled: value.notableRecalled === true,
            memories: count('memories'),
            recalled: count('recalled'),
            episodes: count('episodes'),
        };
    }

    const status = cover.querySelector('.atri-startup-status');
    const retry = cover.querySelector('.atri-startup-retry');
    cover.setAttribute('aria-label', resume ? STRINGS.reopening(resume.work || resume.title) : STRINGS.starting);
    status.textContent = resume ? STRINGS.resuming : STRINGS.preparing;
    retry.textContent = STRINGS.reload;
    retry.addEventListener('click', () => window.location.reload());

    // ── Folios ────────────────────────────────────────────────────────────
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function sheet(side, kicker) {
        const node = el('article', `atri-folio atri-folio--${side}`);
        const head = el('header', 'atri-folio__head');
        head.append(el('span', 'atri-folio__kicker', kicker));
        node.append(head);
        return node;
    }
    function relativeTime(at) {
        if (!at) return '';
        const seconds = Math.round((at - Date.now()) / 1000);
        const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
        try {
            const format = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' });
            for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
            return format.format(0, 'minute');
        } catch {
            return '';
        }
    }

    const desk = el('div', 'atri-startup-desk');
    desk.setAttribute('aria-hidden', 'true');
    const center = sheet('center', resume ? STRINGS.leftOff : 'Atria · 中庭');
    const seal = el('span', 'atri-startup-seal');
    seal.append(el('span', '', '中'), el('span', '', '庭'));

    if (resume) {
        const left = sheet('left', STRINGS.work);
        if (resume.version) left.querySelector('.atri-folio__head').append(el('span', 'atri-folio__chip', resume.version));
        left.append(el('h2', 'atri-folio__title', resume.work || resume.title));
        if (resume.cast.length) {
            // The cast as a small star chart: the sky's stars, printed on paper.
            const cast = el('div', 'atri-folio__cast');
            cast.append(el('span', 'atri-folio__label', STRINGS.cast));
            const svg = (tag, attributes) => {
                const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
                for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
                return node;
            };
            const chart = svg('svg', { class: 'atri-folio__chart', viewBox: '0 0 240 112', role: 'img' });
            chart.append(svg('rect', { class: 'atri-folio__chart-frame', x: .5, y: .5, width: 239, height: 111 }));
            const places = [[34, 34], [98, 80], [162, 38], [212, 84]];
            const stars = resume.cast.map((name, index) => {
                const seed = Array.from(name).reduce((sum, char) => sum + char.codePointAt(0), index * 7);
                return { name, x: places[index][0] + (seed % 13) - 6, y: places[index][1] + (seed % 9) - 4 };
            });
            stars.slice(1).forEach((star, index) => chart.append(svg('line', { class: 'atri-folio__chart-link', x1: stars[index].x, y1: stars[index].y, x2: star.x, y2: star.y })));
            stars.forEach((star, index) => {
                const group = svg('g', { class: `atri-folio__chart-star atri-folio__chart-star--${index}` });
                group.append(svg('circle', { class: 'atri-folio__chart-halo', cx: star.x, cy: star.y, r: 8 }), svg('circle', { cx: star.x, cy: star.y, r: 2.6 }));
                const label = svg('text', { x: star.x + (star.x > 170 ? -8 : 8), y: star.y + (star.y < 56 ? -10 : 19), 'text-anchor': star.x > 170 ? 'end' : 'start' });
                label.textContent = star.name;
                group.append(label);
                chart.append(group);
            });
            cast.append(chart);
            left.append(cast);
        }

        center.append(el('h1', 'atri-folio__title', resume.title));
        const passage = el('div', 'atri-folio__passage');
        if (!resume.lines.length) passage.append(el('p', 'atri-folio__empty', STRINGS.empty));
        for (const line of resume.lines) {
            const paragraph = el('p', line.role === 'user' ? 'atri-folio__line atri-folio__line--user' : 'atri-folio__line');
            if (line.role !== 'user' && line === resume.lines[resume.lines.length - 1]) {
                // The speaker sits above the prose so the drop cap opens the sentence.
                if (line.who) passage.append(el('span', 'atri-folio__speaker', line.who));
                const first = Array.from(line.text)[0];
                paragraph.append(el('span', 'atri-folio__dropcap', first), document.createTextNode(line.text.slice(first.length)));
            } else {
                if (line.who) paragraph.append(el('strong', '', line.who));
                paragraph.append(document.createTextNode(line.text));
            }
            passage.append(paragraph);
        }
        center.append(passage);

        const right = sheet('right', STRINGS.place);
        const ledger = el('dl', 'atri-folio__ledger');
        const row = (label, value) => {
            if (!value) return;
            const item = el('div');
            item.append(el('dt', '', label), el('dd', '', value));
            ledger.append(item);
        };
        row(STRINGS.turn, resume.turn ? String(resume.turn) : '');
        row(STRINGS.lastRead, relativeTime(resume.at));
        row(STRINGS.persona, resume.persona);
        row(STRINGS.memories, resume.memory?.memories ? resume.memory.memories.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en') : '');
        right.append(ledger);
        // Stitched binding: the memories the sky is made of, named on paper.
        if (resume.memory?.notable.length) {
            const thread = el('div', 'atri-folio__thread');
            thread.append(el('span', 'atri-folio__label', resume.memory.notableRecalled ? STRINGS.recalledHead : STRINGS.rememberedHead));
            const list = el('ol');
            for (const text of resume.memory.notable) list.append(el('li', '', text));
            thread.append(list);
            right.append(thread);
        }
        desk.append(left, center, right);
    } else {
        cover.dataset.mode = 'brand';
        center.append(el('h1', 'atri-folio__title atri-folio__title--brand', 'Atria'), el('p', 'atri-folio__tagline', STRINGS.tagline));
        desk.append(center);
    }
    center.append(seal);

    const sky = el('canvas', 'atri-startup-sky');
    sky.setAttribute('aria-hidden', 'true');
    cover.querySelector('.atri-startup')?.remove();
    cover.prepend(sky, desk);
    cover.dataset.stage = 'gather';
    if (reduced) cover.dataset.motion = 'reduced';

    // ── Constellation sky: the reopened branch's memory map ───────────────
    // Richness follows how much the branch remembers: more memories mean
    // more stars, links, recall motes and drift. A new branch is a quiet sky.
    const context = sky.getContext('2d');
    const dark = cover.dataset.appearance === 'dark';
    const memory = resume?.memory?.stars.length ? resume.memory : null;
    const richness = memory ? Math.min(1, Math.log2(1 + memory.memories) / Math.log2(241)) : 0;
    const IGNITE_FROM = 300;
    const IGNITE_SPAN = 520 + 980 * richness;
    const unfoldedMs = DEEP_LINK ? 0 : UNFOLDED_MS + 450 * richness;

    function rgb(name, fallback) {
        context.fillStyle = fallback;
        context.fillStyle = getComputedStyle(cover).getPropertyValue(name).trim() || fallback;
        const value = context.fillStyle;
        if (value.startsWith('#')) return [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
        return (value.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    }
    const palette = {
        lumen: rgb('--atri-accent', '#94672b'),
        lapis: rgb('--atri-info', '#3b62b6'),
        jade: rgb('--atri-committed', '#226f4e'),
        dai: rgb('--atri-unknown', '#6a5bb0'),
        ink: rgb('--atri-text-primary', '#1f1a14'),
    };
    const kindTone = { entity: palette.lumen, node: palette.lapis, fact: palette.jade, episode: palette.dai };
    const ambientTones = [palette.lumen, palette.lumen, palette.lapis, palette.jade, palette.dai];

    // One soft glow sprite per tone; stars are scaled copies, not gradients per frame.
    const sprites = new Map();
    function sprite(tone) {
        const key = tone.join();
        if (sprites.has(key)) return sprites.get(key);
        const size = 64, canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const paint = canvas.getContext('2d');
        const gradient = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, `rgba(${tone}, 1)`);
        gradient.addColorStop(.22, `rgba(${tone}, .55)`);
        gradient.addColorStop(.55, `rgba(${tone}, .16)`);
        gradient.addColorStop(1, `rgba(${tone}, 0)`);
        paint.fillStyle = gradient;
        paint.fillRect(0, 0, size, size);
        sprites.set(key, canvas);
        return canvas;
    }
    function glow(tone, x, y, radius, alpha) {
        if (alpha <= .003 || radius <= .2) return;
        context.globalAlpha = Math.min(1, alpha);
        context.drawImage(sprite(tone), x - radius, y - radius, radius * 2, radius * 2);
    }
    function dot(tone, x, y, radius, alpha) {
        if (alpha <= .003) return;
        context.globalAlpha = Math.min(1, alpha);
        context.fillStyle = `rgb(${tone})`;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
    }

    let random = 20261019;
    const rand = () => ((random = (random * 16807) % 2147483647) / 2147483647);
    let width = 0, height = 0, deskBox = null, pageBox = null, dust = [], bokeh = [], stars = [], links = [], labelFont = '';
    let neighbours = [], waves = [], nextWave = 0;

    // Spreading activation: a memory brightens and the pulse walks its links
    // hop by hop. Richer branches ripple more often and further.
    function activate(now, t) {
        if (reduced || sealedAt || !links.length || t < IGNITE_FROM + IGNITE_SPAN) return;
        if (now >= nextWave && waves.length < 1 + Math.round(2 * richness)) {
            const candidates = stars.filter((_, index) => neighbours[index].length);
            const total = candidates.reduce((sum, star) => sum + star.weight + (star.recalled ? .6 : 0), 0);
            let pick = Math.random() * total, origin = candidates[0];
            for (const star of candidates) { pick -= star.weight + (star.recalled ? .6 : 0); if (pick <= 0) { origin = star; break; } }
            const hops = new Map([[origin.index, 0]]), queue = [origin.index], reach = 1 + Math.round(2 * richness);
            while (queue.length) {
                const index = queue.shift();
                if (hops.get(index) >= reach) continue;
                for (const next of neighbours[index]) if (!hops.has(next)) { hops.set(next, hops.get(index) + 1); queue.push(next); }
            }
            waves.push({ at: now, hops });
            nextWave = now + 1300 - 800 * richness + Math.random() * 500;
        }
        waves = waves.filter(wave => now - wave.at < 2200);
    }
    function activation(index, now) {
        let level = 0;
        for (const wave of waves) {
            const hop = wave.hops.get(index);
            if (hop === undefined) continue;
            const age = (now - wave.at - hop * 210) / 700;
            if (age > 0 && age < 1) level = Math.max(level, Math.sin(age * Math.PI) * (1 - hop * .22));
        }
        return level;
    }

    // Graph-aware placement: connected memories share a bearing, heavier
    // memories sit nearer the page, recent ones inside older ones.
    function place() {
        const source = memory ? memory.stars : Array.from({ length: resume ? 6 : 5 }, () => ({ kind: 'entity', weight: .3, recalled: false, label: '' }));
        const count = source.length;
        const neighbours = source.map(() => []);
        for (const link of memory?.links || []) { neighbours[link.a].push(link.b); neighbours[link.b].push(link.a); }
        const primary = index => source[index].kind === 'entity' || source[index].kind === 'node';
        const order = [], seen = new Set();
        const byWeight = source.map((_, index) => index).sort((a, b) => source[b].weight - source[a].weight);
        for (const start of byWeight.filter(primary)) {
            if (seen.has(start)) continue;
            const queue = [start]; seen.add(start);
            while (queue.length) {
                const index = queue.shift(); order.push(index);
                for (const next of neighbours[index].filter(primary).sort((a, b) => source[b].weight - source[a].weight)) {
                    if (!seen.has(next)) { seen.add(next); queue.push(next); }
                }
            }
        }
        const placed = source.map((star, index) => ({ ...star, index, angle: 0, depth: 0 }));
        order.forEach((index, rank) => {
            placed[index].angle = -Math.PI / 2 + (rank / Math.max(1, order.length)) * Math.PI * 2 + (rand() - .5) * .35;
            placed[index].depth = .1 + (1 - source[index].weight) * .45 + rand() * .3;
        });
        let loose = 0;
        const looseTotal = placed.filter((_, index) => !primary(index)).length;
        for (const star of placed) {
            if (primary(star.index)) continue;
            const parent = neighbours[star.index].find(primary);
            if (parent !== undefined) {
                star.angle = placed[parent].angle + (rand() - .5) * (.5 + .4 / Math.sqrt(1 + neighbours[parent].length));
                star.depth = Math.min(1, placed[parent].depth + .1 + rand() * .22);
            } else {
                star.angle = rand() * Math.PI * 2;
                star.depth = .95 - .6 * (loose++ / Math.max(1, looseTotal)) + (rand() - .5) * .1;
            }
        }
        // Chronological ignition: the branch's history replays in order.
        return placed.map((star, index) => ({
            ...star,
            ignite: IGNITE_FROM + (index / Math.max(1, count)) * IGNITE_SPAN + rand() * 60,
            phase: rand() * 6.3,
            tone: memory ? kindTone[star.kind] : ambientTones[index % ambientTones.length],
            quiet: !memory,
        }));
    }

    function layout() {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth; height = window.innerHeight;
        sky.width = Math.round(width * ratio); sky.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        // Untransformed geometry: the sheets may still be mid-unfold.
        const box = desk.getBoundingClientRect();
        deskBox = { left: box.left, top: box.top, width: box.width, height: box.height, cx: box.left + box.width / 2, cy: box.top + box.height / 2 };
        pageBox = { left: box.left + center.offsetLeft, top: box.top + center.offsetTop, width: center.offsetWidth, height: center.offsetHeight };
        random = 20261019;
        const area = width * height;
        const density = .6 + .7 * richness + Math.min(.4, (resume?.memory?.episodes || 0) / 400);
        dust = Array.from({ length: Math.round(Math.min(170, Math.max(30, area / 13000) * density)) }, () => ({
            x: rand(), y: rand(), r: .5 + rand() * 1.1, a: .25 + rand() * .55, phase: rand() * 6.3, tone: ambientTones[Math.floor(rand() * ambientTones.length)],
        }));
        bokeh = Array.from({ length: Math.round(Math.min(32, Math.max(10, area / 70000) * (.75 + .9 * richness))) }, () => ({
            x: rand(), y: rand(), r: 14 + rand() * 40, a: .05 + rand() * (.1 + .05 * richness), drift: (rand() - .5) * 10, phase: rand() * 6.3, tone: ambientTones[Math.floor(rand() * ambientTones.length)],
        }));
        stars = place();
        links = (memory?.links || []).map(link => ({ ...link, phase: rand(), speed: .45 + rand() * .5 }));
        neighbours = stars.map(() => []);
        for (const link of links) { neighbours[link.a].push(link.b); neighbours[link.b].push(link.a); }
        waves = [];
        labelFont = `500 11.5px ${getComputedStyle(cover).getPropertyValue('--font-ui').trim() || 'sans-serif'}`;
    }

    // Ellipse annulus between the desk and the viewport edge. On a narrow
    // screen the desk spans the width, so the map fills the bands above and
    // below the page instead: bearing becomes x, depth becomes distance.
    function position(star, time, push) {
        const angle = star.angle + time * .018 * richness;
        const drift = star.quiet ? 0 : Math.sin(time * .5 + star.phase) * (3 + 4 * star.depth);
        if (deskBox.width > width - 120) {
            const turn = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const across = 16 + ((turn % Math.PI) / Math.PI) * (width - 32);
            const top = deskBox.top - 18, bottom = deskBox.top + deskBox.height + 18;
            const y = turn < Math.PI
                ? bottom + star.depth * Math.max(0, height - bottom - 64)
                : top - star.depth * Math.max(0, top - 16);
            return { x: deskBox.cx + (across - deskBox.cx) * push + drift, y: deskBox.cy + (y - deskBox.cy) * push - drift * .6 };
        }
        const innerX = deskBox.width / 2 + 26, innerY = deskBox.height / 2 + 26;
        const outerX = Math.max(innerX + 40, Math.max(deskBox.cx, width - deskBox.cx) - 18);
        const outerY = Math.max(innerY + 40, Math.max(deskBox.cy, height - deskBox.cy) - 18);
        const x = deskBox.cx + Math.cos(angle) * (innerX + star.depth * (outerX - innerX)) * push + drift;
        const y = deskBox.cy + Math.sin(angle) * (innerY + star.depth * (outerY - innerY)) * push - drift * .6;
        return { x: Math.min(width - 10, Math.max(10, x)), y: Math.min(height - 10, Math.max(10, y)) };
    }
    function towardPage(x, y) {
        return {
            x: Math.min(Math.max(x, pageBox.left + 18), pageBox.left + pageBox.width - 18),
            y: Math.min(Math.max(y, pageBox.top + 18), pageBox.top + pageBox.height - 18),
        };
    }
    const ease = value => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);
    const easeIn = value => Math.pow(Math.min(1, Math.max(0, value)), 2.2);

    let sealedAt = 0, leavingAt = 0, frame = 0;
    function draw(now) {
        const t = reduced ? 1e6 : now - started;
        const intro = reduced ? 1 : ease(t / 900);
        const leave = leavingAt ? ease((now - leavingAt) / 760) : 0;
        const fade = intro * (1 - leave);
        const time = reduced ? 0 : t / 1000;
        const sinceSeal = sealedAt && !reduced ? now - sealedAt : 0;
        const push = 1 + leave * .35 + (sinceSeal ? Math.exp(-sinceSeal / 300) * Math.min(1, sinceSeal / 110) * .06 : 0);
        const settle = sealedAt ? .55 : 1;
        const cx = deskBox.cx, cy = deskBox.cy;
        context.globalAlpha = 1;
        context.clearRect(0, 0, width, height);

        // Lamp light behind the page: the one place the story is lit.
        const lamp = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * .55);
        lamp.addColorStop(0, `rgba(${palette.lumen}, ${(dark ? .14 + .06 * richness : .07 + .03 * richness) * fade})`);
        lamp.addColorStop(1, `rgba(${palette.lumen}, 0)`);
        context.fillStyle = lamp;
        context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
        const lightBoost = dark ? 1 : 1.3;

        for (const star of bokeh) {
            const x = cx + ((star.x * width + Math.sin(time * .2 + star.phase) * star.drift) - cx) * push;
            const y = cy + ((star.y * height + Math.cos(time * .17 + star.phase) * star.drift) - cy) * push;
            glow(star.tone, x, y, star.r, star.a * fade * lightBoost * (.8 + .2 * Math.sin(time * .6 + star.phase)));
        }
        for (const star of dust) {
            const x = cx + (star.x * width - cx) * push, y = cy + (star.y * height - cy) * push;
            dot(star.tone, x, y, star.r, star.a * fade * (dark ? 1 : .7) * (.55 + .45 * Math.sin(time * 1.6 + star.phase)));
        }

        activate(now, t);
        const points = stars.map((star, index) => {
            const life = reduced ? 1 : ease((t - star.ignite) / 480);
            return { star, life, lit: waves.length ? activation(index, now) : 0, ...position(star, time, push) };
        });

        // Links draw themselves from the older memory to the newer one.
        context.lineWidth = 1;
        for (const link of links) {
            const a = points[link.a], b = points[link.b];
            const start = Math.max(a.star.ignite, b.star.ignite) + 120;
            const grow = reduced ? 1 : ease((t - start) / 420);
            if (grow <= 0) continue;
            const [from, to] = a.star.ignite <= b.star.ignite ? [a, b] : [b, a];
            const ex = from.x + (to.x - from.x) * grow, ey = from.y + (to.y - from.y) * grow;
            context.globalAlpha = 1;
            const charge = Math.min(a.lit, b.lit);
            context.strokeStyle = `rgba(${from.star.tone}, ${fade * settle * ((link.support ? .1 : .2) + charge * .45) * (dark ? 1.2 : 1)})`;
            context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(ex, ey); context.stroke();
            // Recall travels the map: motes run along links, more on rich branches.
            if (!reduced && grow >= 1 && !link.support && link.phase < .25 + .75 * richness) {
                const travel = (time * link.speed + link.phase) % 1;
                dot(to.star.tone, from.x + (to.x - from.x) * travel, from.y + (to.y - from.y) * travel, 1.3, fade * settle * .75 * Math.sin(travel * Math.PI));
            }
        }

        // Ambient stars without memory keep a faint thread to the page.
        for (const point of points) {
            if (point.life <= 0) continue;
            const { star } = point;
            if (star.quiet) {
                const target = towardPage(point.x, point.y);
                const thread = context.createLinearGradient(point.x, point.y, target.x, target.y);
                thread.addColorStop(0, `rgba(${star.tone}, ${point.life * fade * .14 * settle})`);
                thread.addColorStop(1, `rgba(${star.tone}, 0)`);
                context.globalAlpha = 1;
                context.strokeStyle = thread;
                context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(target.x, target.y); context.stroke();
            }
            // Depth of field: far memories are wide soft bokeh, near ones crisp.
            const near = 1 - star.depth;
            const weight = star.quiet ? .3 : star.weight;
            const primary = star.kind === 'entity' || star.kind === 'node';
            const pulse = reduced ? 1 : .86 + .14 * Math.sin(time * 2.1 + star.phase);
            const haloRadius = (primary ? 9 + 16 * weight : 5 + 8 * weight) * (1 + star.depth * .8) * pulse * (star.recalled ? 1.5 : 1);
            const flare = !reduced && star.recalled ? Math.max(0, 1 - Math.abs(t - (IGNITE_FROM + IGNITE_SPAN + 200)) / 600) : 0;
            glow(star.tone, point.x, point.y, haloRadius * (1 + flare + point.lit * .7), point.life * fade * (star.quiet ? .28 : .38 + .3 * near + .3 * flare + .45 * point.lit) * lightBoost);
            dot(star.tone, point.x, point.y, (primary ? 1.4 + 1.6 * weight : .9 + 1 * weight) * (.7 + .5 * near), point.life * fade * (star.quiet ? .5 : .55 + .4 * near) * (dark ? 1 : .85));
            if (star.recalled) {
                // The memory the last turn used: a ring, and motes into the page.
                context.globalAlpha = point.life * fade * (.35 + .4 * flare);
                context.strokeStyle = `rgb(${star.tone})`;
                context.beginPath(); context.arc(point.x, point.y, 6 + 3 * weight + 10 * flare, 0, Math.PI * 2); context.stroke();
                if (!reduced && !sealedAt && t > IGNITE_FROM + IGNITE_SPAN) {
                    const target = towardPage(point.x, point.y);
                    const travel = ((t - IGNITE_FROM - IGNITE_SPAN) / 950 + star.phase) % 1;
                    dot(star.tone, point.x + (target.x - point.x) * ease(travel), point.y + (target.y - point.y) * ease(travel), 1.7, fade * .8 * Math.sin(travel * Math.PI));
                }
            }
            // The seal draws every lit memory into the page at once.
            if (sinceSeal && sinceSeal < 760 && !star.quiet) {
                const target = towardPage(point.x, point.y);
                const travel = easeIn(sinceSeal / (560 + star.depth * 200));
                if (travel < 1) dot(star.tone, point.x + (target.x - point.x) * travel, point.y + (target.y - point.y) * travel, 1.2 + weight, fade * (1 - travel * .6) * .9);
            }
        }

        // A few names, set like captions on a star chart.
        if (labelFont) {
            context.font = labelFont;
            context.textBaseline = 'middle';
            const taken = [];
            for (const point of points) {
                const { star } = point;
                if (!star.label || point.life <= 0) continue;
                const alpha = point.life * fade * (sealedAt ? Math.max(0, 1 - sinceSeal / 300) : 1) * .62;
                if (alpha <= .01) continue;
                const left = point.x > deskBox.cx;
                const textWidth = context.measureText(star.label).width;
                const lx = left ? point.x + 10 : point.x - 10 - textWidth;
                if (lx < 8 || lx + textWidth > width - 8) continue;
                if (lx + textWidth > deskBox.left - 6 && lx < deskBox.left + deskBox.width + 6 && point.y > deskBox.top - 10 && point.y < deskBox.top + deskBox.height + 10) continue;
                if (taken.some(box => lx < box.right + 8 && lx + textWidth > box.left - 8 && Math.abs(point.y - box.y) < 16)) continue;
                taken.push({ left: lx, right: lx + textWidth, y: point.y });
                context.globalCompositeOperation = 'source-over';
                context.globalAlpha = alpha;
                context.fillStyle = `rgb(${dark ? star.tone : palette.ink})`;
                context.fillText(star.label, lx, point.y);
                context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
            }
        }
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
    }

    function loop(now) {
        if (!cover.isConnected) return;
        draw(now);
        step(now);
        frame = reduced && !leavingAt ? 0 : requestAnimationFrame(loop);
    }

    // ── Choreography ──────────────────────────────────────────────────────
    let readyAt = 0, fast = false;
    function step(now) {
        const t = now - started;
        if (!readyAt) return;
        if (document.querySelector('dialog[open]')) fast = true;
        const reopened = !resume || Boolean(handoffTarget()) || now - readyAt >= REOPEN_WAIT_MS;
        if (!sealedAt && (fast || reduced || (t >= unfoldedMs && reopened))) {
            sealedAt = now;
            cover.dataset.stage = 'sealed';
        }
        if (sealedAt && !leavingAt && (fast || reduced || now - sealedAt >= SEAL_HOLD_MS)) leaveCover(now);
    }

    function handoffTarget() {
        const target = document.getElementById('atria-play-conversation');
        const rect = target && !target.closest('[hidden]') ? target.getBoundingClientRect() : null;
        if (!rect || rect.width < 40 || rect.height < 40) return null;
        const measure = Math.min(rect.width, 720);
        return { left: rect.left + (rect.width - measure) / 2, top: rect.top + 24, width: measure, height: Math.min(rect.height - 24, 520) };
    }

    function leaveCover(now) {
        leavingAt = now;
        cover.dataset.stage = 'leaving';
        status.textContent = '';
        const finish = () => {
            cancelAnimationFrame(frame);
            cover.remove();
            root.removeAttribute('data-atria-starting');
        };
        if (fast || reduced || !center.animate) {
            const fadeOut = cover.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 160 : 220, easing: 'ease-out', fill: 'forwards' });
            if (fadeOut) fadeOut.finished.then(finish, finish); else finish();
            if (reduced && !frame) frame = requestAnimationFrame(loop);
            return;
        }
        // The center sheet becomes the reading column underneath; the side
        // sheets fold back and the sky drifts outward.
        const from = center.getBoundingClientRect();
        const to = handoffTarget();
        const transform = to
            ? `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${Math.max(.6, Math.min(1.6, to.width / from.width))})`
            : 'translateY(-6px) scale(1.04)';
        center.animate([{ transform: 'none', opacity: 1 }, { transform, opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' });
        cover.animate([{ opacity: 1 }, { opacity: 1, offset: .25 }, { opacity: 0 }], { duration: 780, easing: 'ease-in-out', fill: 'forwards' }).finished.then(finish, finish);
    }

    function dismiss() {
        if (readyAt) return;
        readyAt = performance.now();
        // A deep link has no story to hand off to: fade straight to the target.
        if (DEEP_LINK) fast = true;
        clearTimeout(stallTimer);
        // Startup is done for everything else: release the #preloader
        // contract immediately and let the cover finish on its own.
        cover.removeAttribute('id');
        cover.removeAttribute('role');
        cover.style.pointerEvents = 'none';
        const skip = () => { fast = true; };
        window.addEventListener('pointerdown', skip, { capture: true, once: true });
        window.addEventListener('keydown', skip, { capture: true, once: true });
        if (reduced && !frame) frame = requestAnimationFrame(loop);
    }

    const stallTimer = window.setTimeout(() => {
        if (readyAt || !cover.isConnected) return;
        status.textContent = STRINGS.stalled;
        retry.hidden = false;
    }, 20000);

    // Legacy paths may still remove the element directly.
    new MutationObserver((_, observer) => {
        if (cover.isConnected) return;
        clearTimeout(stallTimer);
        cancelAnimationFrame(frame);
        root.removeAttribute('data-atria-starting');
        observer.disconnect();
    }).observe(cover.parentNode, { childList: true });

    window.AtriaStartup = Object.freeze({ dismiss });
    window.addEventListener('resize', () => { layout(); if (reduced) draw(performance.now()); });
    layout();
    requestAnimationFrame(() => {
        cover.dataset.stage = 'unfold';
        frame = requestAnimationFrame(loop);
    });
})();
