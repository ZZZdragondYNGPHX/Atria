(function($) {
    var isMobileUA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    var Defaults = $.fn.select2.amd.require('select2/defaults');

    $.extend(Defaults.defaults, {
        searchInputPlaceholder: '',
        searchInputCssClass: '',
    });

    var SearchDropdown = $.fn.select2.amd.require('select2/dropdown/search');

    var _renderSearchDropdown = SearchDropdown.prototype.render;

    SearchDropdown.prototype.render = function(decorated) {
        // invoke parent method
        var $rendered = _renderSearchDropdown.apply(this, Array.prototype.slice.apply(arguments));

        this.$search.attr('placeholder', this.options.get('searchInputPlaceholder'));
        this.$search.addClass(this.options.get('searchInputCssClass'));

        return $rendered;
    };

    // Mobile: Select2 tries to focus its search field immediately on open.
    // The eager mobile-focus-guard.js handles explicit user focus separately;
    // keep the auto-open field readOnly/blurred here so the keyboard does not
    // pop until the user actually taps the search box.
    $(document).on('select2:open', function () {
        if (!isMobileUA) return;
        var searchField = document.querySelector('.select2-container--open .select2-search__field');
        if (!(searchField instanceof HTMLInputElement || searchField instanceof HTMLTextAreaElement)) return;

        searchField.readOnly = true;

        if (document.activeElement === searchField) {
            searchField.blur();
        }
    });

    window.__atriaSelect2SearchPatchLoaded = true;
})(window.jQuery);
