(function () {
    var isMobileUA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    var USER_FOCUS_GRACE_MS = 900;
    var lastSelect2SearchUserIntentTs = 0;
    var lastSendTextareaUserIntentTs = 0;

    if (!isMobileUA) {
        return;
    }

    function isSendTextarea(target) {
        return target instanceof HTMLTextAreaElement && target.id === 'send_textarea';
    }

    function isSelect2SearchField(target) {
        return target instanceof HTMLInputElement && target.classList.contains('select2-search__field')
            || target instanceof HTMLTextAreaElement && target.classList.contains('select2-search__field');
    }

    function markUserIntent(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        if (event.target.closest('.select2-container--open .select2-search__field')) {
            lastSelect2SearchUserIntentTs = Date.now();
        }

        if (event.target.closest('#send_textarea')) {
            lastSendTextareaUserIntentTs = Date.now();
        }
    }

    function installPrototypeGuard() {
        if (typeof HTMLElement === 'undefined' || HTMLElement.prototype.__atriaMobileFocusGuardInstalled) {
            return;
        }

        var nativeFocus = HTMLElement.prototype.focus;

        Object.defineProperty(HTMLElement.prototype, '__atriaMobileFocusGuardInstalled', {
            value: true,
            writable: false,
            configurable: true,
        });

        HTMLElement.prototype.focus = function () {
            var now = Date.now();

            if (isSelect2SearchField(this) && (now - lastSelect2SearchUserIntentTs) > USER_FOCUS_GRACE_MS) {
                return;
            }

            if (isSendTextarea(this) && (now - lastSendTextareaUserIntentTs) > USER_FOCUS_GRACE_MS) {
                return;
            }

            return nativeFocus.apply(this, arguments);
        };
    }

    function guardProgrammaticFocus(event) {
        var target = event.target;
        if (!isSelect2SearchField(target)) {
            return;
        }

        var elapsed = Date.now() - lastSelect2SearchUserIntentTs;
        if (elapsed <= USER_FOCUS_GRACE_MS) {
            target.readOnly = false;
            return;
        }

        target.readOnly = true;
        target.blur();
    }

    document.addEventListener('pointerdown', markUserIntent, true);
    document.addEventListener('touchstart', markUserIntent, true);
    document.addEventListener('mousedown', markUserIntent, true);
    installPrototypeGuard();
    document.addEventListener('focusin', guardProgrammaticFocus, true);
})();
