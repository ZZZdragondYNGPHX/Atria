/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import { createImmersiveComposer } from '../../public/scripts/immersive/composer.js';
import { createImmersiveMessageActions } from '../../public/scripts/immersive/message-actions.js';
import { createImmersivePresentation } from '../../public/scripts/immersive/presentation.js';

describe('immersive composer and narrative integration', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="chat">
                <div class="mes" mesid="0" ch_name="User" is_user="true" is_system="false">
                    <div class="mesAvatarWrapper"><div class="avatar"><img src="img/user-default.png"></div></div>
                    <div class="mes_block"><div class="name_text">User</div><div class="mes_text">hello</div><div class="mes_buttons"><button class="mes_copy"></button><button class="mes_edit"></button></div><div class="swipes-counter">1 / 1</div></div>
                </div>
                <div class="mes last_mes" mesid="1" ch_name="Alice" is_user="false" is_system="false">
                    <div class="mesAvatarWrapper"><div class="avatar"><img src="characters/alice.png"></div></div>
                    <div class="mes_block"><div class="name_text">Alice</div><div class="mes_text">reply</div><div class="mes_buttons"><button class="mes_copy"></button><button class="mes_edit"></button></div><div class="swipes-counter">2 / 4</div></div>
                </div>
            </div>
            <div id="send_form">
                <div id="nonQRFormItems"><textarea id="send_textarea"></textarea></div>
            </div>
        `;
    });

    afterEach(() => {
        document.body.className = '';
        delete document.body.dataset.atriaImmersiveAdaptation;
        delete document.body.dataset.atriaImmersiveProfile;
    });

    test('narrative focus marks current response without hiding history from accessibility', () => {
        const presentation = createImmersivePresentation({ document, window, isMobile: () => false });
        presentation.setEnabled(true);
        presentation.refreshNarrative();

        const messages = [...document.querySelectorAll('.mes')];
        expect(messages[1].classList.contains('atria-immersive-current-response')).toBe(true);
        expect(messages[0].classList.contains('atria-immersive-previous-turn')).toBe(true);
        expect(document.body.dataset.atriaImmersiveAdaptation).toBe('avatar');
        expect(document.querySelector('[aria-hidden="true"].mes')).toBeNull();
        presentation.dispose();
    });

    test('composer reuses native host actions and exposes interrupted response choices', () => {
        const actions = {
            openTools: jest.fn(),
            send: jest.fn(),
            stop: jest.fn(),
            continue: jest.fn(),
            rewrite: jest.fn(),
            keep: jest.fn(),
        };
        const composer = createImmersiveComposer({ document, actions });
        composer.setEnabled(true);

        const extensionButton = document.getElementById('atriaImmersiveExtensions');
        expect(extensionButton).not.toBeNull();
        expect(extensionButton.hidden).toBe(true);
        expect(extensionButton.querySelector('.fa-magic-wand-sparkles')).not.toBeNull();

        document.getElementById('atriaImmersiveSend').click();
        expect(actions.send).toHaveBeenCalledTimes(1);

        composer.generationStarted('normal');
        expect(composer.getState()).toBe('generating');
        expect(document.getElementById('atriaImmersiveStop').hidden).toBe(false);
        document.getElementById('atriaImmersiveStop').click();
        expect(actions.stop).toHaveBeenCalledTimes(1);

        composer.generationStopped();
        expect(document.getElementById('atriaImmersiveInterruptBar').hidden).toBe(false);
        document.getElementById('atriaImmersiveContinue').click();
        expect(actions.continue).toHaveBeenCalledTimes(1);
        expect(document.getElementById('atriaImmersiveInterruptBar').hidden).toBe(true);
        composer.dispose();
    });

    test('message toolbar proxies original copy/edit controls and native regenerate', () => {
        const last = document.querySelector('.last_mes');
        const copy = last.querySelector('.mes_copy');
        const edit = last.querySelector('.mes_edit');
        const onCopy = jest.fn();
        const onEdit = jest.fn();
        const rewrite = jest.fn();
        copy.addEventListener('click', onCopy);
        edit.addEventListener('click', onEdit);

        const actions = createImmersiveMessageActions({ document, window, rewrite });
        actions.setEnabled(true);

        last.querySelector('.mes_text').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(actions.hasOpen()).toBe(true);
        document.querySelector('[data-action="copy"]').click();
        expect(onCopy).toHaveBeenCalledTimes(1);

        last.querySelector('.mes_text').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.querySelector('[data-action="edit"]').click();
        expect(onEdit).toHaveBeenCalledTimes(1);

        last.querySelector('.mes_text').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.querySelector('[data-action="rewrite"]').click();
        expect(rewrite).toHaveBeenCalledTimes(1);
        actions.dispose();
    });
});
