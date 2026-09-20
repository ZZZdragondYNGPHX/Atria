/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';
import { createImmersiveVisuals } from '../../public/scripts/immersive/visuals.js';
import { createImmersivePresentation } from '../../public/scripts/immersive/presentation.js';

describe('immersive visual adaptation', () => {
    test('portrait mode requires an explicit provider portrait', () => {
        document.body.innerHTML = `
            <div id="chat">
                <div class="mes last_mes" ch_name="Alice" is_user="false" is_system="false">
                    <div class="mesAvatarWrapper"><div class="avatar"><img src="characters/alice.png"></div></div>
                    <div class="mes_block"><div class="mes_text">Hello</div></div>
                </div>
            </div>
        `;
        const presentation = createImmersivePresentation({ document, window });
        presentation.setEnabled(true);
        expect(document.body.dataset.atriaImmersiveAdaptation).toBe('avatar');

        presentation.setProviderVisual({ background: 'scene.jpg' });
        expect(document.body.dataset.atriaImmersiveAdaptation).toBe('avatar');

        presentation.setProviderVisual({ portrait: 'portrait.png' });
        expect(document.body.dataset.atriaImmersiveAdaptation).toBe('portrait');
        presentation.dispose();
    });

    test('stage consumes scene and portrait only from explicit provider state', () => {
        document.body.innerHTML = '';
        const visuals = createImmersiveVisuals({ document, window });
        visuals.setEnabled(true);
        visuals.render({
            scene: { id: 'scene-1', background: 'scene.jpg' },
            visual: { portrait: 'portrait.png', accent: '#abcdef' },
        }, { visualMode: 'auto', reducedMotion: true });

        const stage = document.getElementById('atriaImmersiveStage');
        const portrait = stage.querySelector('.atria-immersive-portrait');
        expect(stage.dataset.hasScene).toBe('true');
        expect(stage.dataset.hasPortrait).toBe('true');
        expect(portrait.getAttribute('src')).toBe('portrait.png');
        expect(stage.classList.contains('atria-immersive-reduced-motion')).toBe(true);

        visuals.render({ scene: { background: 'another.jpg' }, visual: {} }, { visualMode: 'auto' });
        expect(stage.dataset.hasPortrait).toBe('false');
        visuals.dispose();
    });

    test('text-first setting suppresses provider portrait without discarding scene', () => {
        document.body.innerHTML = '';
        const visuals = createImmersiveVisuals({ document, window });
        visuals.setEnabled(true);
        visuals.render({
            scene: { background: 'scene.jpg' },
            visual: { portrait: 'portrait.png' },
        }, { visualMode: 'text' });
        const stage = document.getElementById('atriaImmersiveStage');
        expect(stage.dataset.hasScene).toBe('true');
        expect(stage.dataset.hasPortrait).toBe('false');
        visuals.dispose();
    });
});
