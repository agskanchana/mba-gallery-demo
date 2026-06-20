/**
 * MBA Gallery Pro – Filter Builder (Dashboard)
 *
 * Renders the filter list from mbaProFiltersData, supports add / edit /
 * remove / reorder / reset-to-defaults, and saves via AJAX.
 *
 * @package MBA_Gallery_Pro
 */
(function ($) {
    'use strict';

    var filters = mbaProFiltersData.filters || [];
    var defaults = mbaProFiltersData.defaults || [];
    var i18n = mbaProFiltersData.i18n || {};
    var $list = $('#mba-pro-filters-list');

    /* ── Render ────────────────────────────────────────────────────────── */

    function render() {
        $list.empty();

        if (!filters.length) {
            $list.html('<p class="mba-pro-no-filters">' + (i18n.noFilters || 'No filters configured.') + '</p>');
            return;
        }

        filters.forEach(function (filter, idx) {
            $list.append(buildFilterCard(filter, idx));
        });

        // Make sortable
        $list.sortable({
            handle: '.mba-pro-filter-drag',
            axis: 'y',
            opacity: 0.7,
            placeholder: 'mba-pro-filter-placeholder',
            update: function () {
                reindexFromDOM();
            }
        });
    }

    function buildFilterCard(filter, idx) {
        var enabled = filter.enabled !== false;
        var card = $('<div class="mba-pro-filter-card' + (enabled ? '' : ' mba-pro-filter-disabled') + '" data-index="' + idx + '">');

        // Header
        var header = $('<div class="mba-pro-filter-card-header">');
        header.append('<span class="mba-pro-filter-drag dashicons dashicons-move" title="Drag to reorder"></span>');
        header.append('<input type="text" class="mba-pro-filter-label" value="' + escAttr(filter.label) + '" placeholder="Filter name" />');

        var controls = $('<span class="mba-pro-filter-controls">');
        var toggleLabel = enabled ? 'Enabled' : 'Disabled';
        controls.append(
            '<label class="mba-pro-toggle">' +
                '<input type="checkbox" class="mba-pro-filter-enabled"' + (enabled ? ' checked' : '') + ' />' +
                '<span class="mba-pro-toggle-slider"></span>' +
                '<span class="mba-pro-toggle-text">' + toggleLabel + '</span>' +
            '</label>'
        );
        controls.append('<button type="button" class="mba-pro-filter-delete" title="Delete"><span class="dashicons dashicons-trash"></span></button>');
        header.append(controls);
        card.append(header);

        // URL key (read-only info): the slug used in the filter checkbox name and
        // the shareable deep-link URL (e.g. ?county=…). Derived from the label.
        card.append('<div class="mba-pro-filter-meta-key">URL key: <code>' + escAttr(urlKey(filter)) + '</code></div>');

        // Options
        var optionsWrap = $('<div class="mba-pro-filter-options">');
        optionsWrap.append('<label class="mba-pro-options-label">Options:</label>');
        var optionsList = $('<div class="mba-pro-options-list">');

        (filter.options || []).forEach(function (opt, optIdx) {
            optionsList.append(buildOptionRow(opt, optIdx));
        });

        optionsWrap.append(optionsList);
        optionsWrap.append(
            '<button type="button" class="button button-small mba-pro-add-option">' +
                '<span class="dashicons dashicons-plus-alt2"></span> Add Option' +
            '</button>'
        );
        card.append(optionsWrap);

        return card;
    }

    function buildOptionRow(value, idx) {
        return $(
            '<div class="mba-pro-option-row" data-option-index="' + idx + '">' +
                '<span class="mba-pro-option-drag dashicons dashicons-menu"></span>' +
                '<input type="text" class="mba-pro-option-value" value="' + escAttr(value) + '" placeholder="' + (i18n.optionPlaceholder || 'Option value') + '" />' +
                '<button type="button" class="mba-pro-option-remove" title="Remove"><span class="dashicons dashicons-no-alt"></span></button>' +
            '</div>'
        );
    }

    /* ── Collect state from DOM ────────────────────────────────────────── */

    function collectFromDOM() {
        var updated = [];
        $list.find('.mba-pro-filter-card').each(function () {
            var $card = $(this);
            var idx = parseInt($card.data('index'), 10);
            var original = filters[idx] || {};

            var opts = [];
            $card.find('.mba-pro-option-value').each(function () {
                var v = $.trim($(this).val());
                if (v) opts.push(v);
            });

            updated.push({
                id:       original.id || generateId($card.find('.mba-pro-filter-label').val()),
                label:    $.trim($card.find('.mba-pro-filter-label').val()),
                meta_key: original.meta_key || '_medbeafgallery_case_' + generateId($card.find('.mba-pro-filter-label').val()),
                options:  opts,
                enabled:  $card.find('.mba-pro-filter-enabled').is(':checked')
            });
        });
        return updated;
    }

    function reindexFromDOM() {
        filters = collectFromDOM();
        render();
    }

    /* ── Events ────────────────────────────────────────────────────────── */

    // Toggle enable/disable
    $list.on('change', '.mba-pro-filter-enabled', function () {
        var $card = $(this).closest('.mba-pro-filter-card');
        $card.toggleClass('mba-pro-filter-disabled', !this.checked);
        $card.find('.mba-pro-toggle-text').text(this.checked ? 'Enabled' : 'Disabled');
    });

    // Delete filter
    $list.on('click', '.mba-pro-filter-delete', function () {
        if (!confirm(i18n.confirmDelete || 'Delete this filter?')) return;
        var $card = $(this).closest('.mba-pro-filter-card');
        var idx = parseInt($card.data('index'), 10);
        filters.splice(idx, 1);
        render();
    });

    // Add option
    $list.on('click', '.mba-pro-add-option', function () {
        var $optList = $(this).siblings('.mba-pro-options-list');
        var newIdx = $optList.find('.mba-pro-option-row').length;
        $optList.append(buildOptionRow('', newIdx));
        $optList.find('.mba-pro-option-value').last().focus();
    });

    // Remove option
    $list.on('click', '.mba-pro-option-remove', function () {
        $(this).closest('.mba-pro-option-row').remove();
    });

    // Add new filter
    $('#mba-pro-add-filter').on('click', function () {
        filters = collectFromDOM();
        var newId = 'custom_' + Date.now();
        filters.push({
            id:       newId,
            label:    i18n.newFilter || 'New Filter',
            meta_key: '_medbeafgallery_case_' + newId,
            options:  ['Option 1', 'Option 2'],
            enabled:  true
        });
        render();
        // Scroll to new filter and focus label
        var $last = $list.find('.mba-pro-filter-card').last();
        $('html, body').animate({ scrollTop: $last.offset().top - 50 }, 300);
        $last.find('.mba-pro-filter-label').select();
    });

    // Reset to defaults
    $('#mba-pro-reset-defaults').on('click', function () {
        if (!confirm(i18n.confirmReset || 'Reset all filters to defaults?')) return;
        filters = JSON.parse(JSON.stringify(defaults));
        render();
        showNotice('success', i18n.saved || 'Filters reset to defaults. Click Save to persist.');
    });

    // Save filters via AJAX
    $('#mba-pro-save-filters').on('click', function () {
        var $btn = $(this);
        $btn.prop('disabled', true).find('.dashicons').removeClass('dashicons-saved').addClass('dashicons-update spin');

        filters = collectFromDOM();

        $.post(mbaProFiltersData.ajaxUrl, {
            action:  'mba_pro_save_filters',
            nonce:   mbaProFiltersData.nonce,
            filters: filters
        }, function (response) {
            $btn.prop('disabled', false).find('.dashicons').removeClass('dashicons-update spin').addClass('dashicons-saved');
            if (response.success) {
                filters = response.data;
                render();
                showNotice('success', i18n.saved || 'Filters saved.');
            } else {
                showNotice('error', i18n.error || 'Error saving filters.');
            }
        }).fail(function () {
            $btn.prop('disabled', false).find('.dashicons').removeClass('dashicons-update spin').addClass('dashicons-saved');
            showNotice('error', i18n.error || 'Error saving filters.');
        });
    });

    // Live-preview the URL key as the label is typed.
    $list.on('input', '.mba-pro-filter-label', function () {
        var $card = $(this).closest('.mba-pro-filter-card');
        var idx = parseInt($card.data('index'), 10);
        var original = filters[idx] || {};
        $card.find('.mba-pro-filter-meta-key code')
            .text(urlKey({ meta_key: original.meta_key, label: $(this).val() }));
    });

    /* ── Helpers ───────────────────────────────────────────────────────── */

    function generateId(label) {
        return (label || 'filter')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 40);
    }

    // Fixed URL keys for the six built-in attributes (mirrors the PHP map).
    var STD_KEY_MAP = {
        '_medbeafgallery_case_gender': 'gender',
        '_medbeafgallery_case_age': 'age',
        '_medbeafgallery_case_recovery': 'recovery',
        '_medbeafgallery_case_duration': 'duration',
        '_medbeafgallery_case_results': 'results',
        '_medbeafgallery_case_procedure_type': 'procedure',
        '_medbeafgallery_case_procedure': 'procedure'
    };

    // Slug used on the frontend (checkbox name + URL param). Mirrors the PHP
    // mba_gallery_pro_get_filter_input_name(): built-ins keep their fixed name,
    // custom filters use a hyphenated slug of the label and never shadow a
    // built-in name. (De-duplication happens server-side.)
    function slugify(s) {
        return (s || '').toString().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    function urlKey(filter) {
        if (filter.meta_key && STD_KEY_MAP[filter.meta_key]) {
            return STD_KEY_MAP[filter.meta_key];
        }
        var base = slugify(filter.label);
        if (!base && filter.meta_key) {
            base = filter.meta_key.replace('_medbeafgallery_case_', '');
        }
        if (['gender', 'age', 'recovery', 'duration', 'results', 'procedure'].indexOf(base) !== -1) {
            base += '-filter';
        }
        return base;
    }

    function escAttr(str) {
        return $('<div>').text(str || '').html();
    }

    function showNotice(type, message) {
        var $notice = $('#mba-pro-filters-notice');
        $notice
            .removeClass('notice-success notice-error')
            .addClass(type === 'success' ? 'notice-success' : 'notice-error')
            .html('<p>' + message + '</p>')
            .fadeIn(200);

        setTimeout(function () {
            $notice.fadeOut(300);
        }, 3000);
    }

    /* ── Init ──────────────────────────────────────────────────────────── */
    render();

})(jQuery);
