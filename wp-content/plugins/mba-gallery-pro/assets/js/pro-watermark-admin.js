/**
 * MBA Gallery Pro — Watermark Admin JS
 *
 * Handles: type toggle, WP media frame, position grid, opacity slider,
 * AJAX save, bulk operations with progress bar.
 *
 * @package MBA_Gallery_Pro
 */

(function ($) {
    'use strict';

    if (typeof mba_wm_data === 'undefined') {
        return;
    }

    var nonce = mba_wm_data.nonce;
    var ajaxurl = mba_wm_data.ajaxurl;

    /* ── Type Toggle ──────────────────────────────────────────── */

    $('input[name="mba_wm_type"]').on('change', function () {
        var type = $(this).val();
        if (type === 'text') {
            $('#mba-wm-text-options').show();
            $('#mba-wm-image-options').hide();
        } else {
            $('#mba-wm-text-options').hide();
            $('#mba-wm-image-options').show();
        }
    });

    /* ── Opacity Slider ───────────────────────────────────────── */

    $('#mba_wm_opacity').on('input', function () {
        $('#mba-wm-opacity-val').text($(this).val() + '%');
    });

    /* ── Position Grid ────────────────────────────────────────── */

    $(document).on('click', '.mba-wm-pos-cell', function () {
        $('.mba-wm-pos-cell').removeClass('active');
        $(this).addClass('active');
        $('#mba_wm_position').val($(this).data('position'));
    });

    /* ── WP Color Picker ──────────────────────────────────────── */

    if ($.fn.wpColorPicker) {
        $('.mba-wm-color-field').wpColorPicker();
    }

    /* ── WP Media Frame — Select Image ────────────────────────── */

    var wmMediaFrame;

    $('#mba-wm-select-image').on('click', function (e) {
        e.preventDefault();

        if (wmMediaFrame) {
            wmMediaFrame.open();
            return;
        }

        wmMediaFrame = wp.media({
            title: mba_wm_data.i18n_select_image || 'Select Watermark Image',
            button: { text: mba_wm_data.i18n_use_image || 'Use This Image' },
            multiple: false,
            library: { type: 'image' }
        });

        wmMediaFrame.on('select', function () {
            var attachment = wmMediaFrame.state().get('selection').first().toJSON();
            var url = attachment.sizes && attachment.sizes.medium ? attachment.sizes.medium.url : attachment.url;

            $('#mba_wm_image_id').val(attachment.id);
            $('#mba-wm-image-preview').html('<img src="' + url + '" style="max-width:200px;max-height:100px;">').show();
            $('#mba-wm-remove-image').show();
        });

        wmMediaFrame.open();
    });

    $('#mba-wm-remove-image').on('click', function () {
        $('#mba_wm_image_id').val('');
        $('#mba-wm-image-preview').hide().empty();
        $(this).hide();
    });

    /* ── Save Settings ────────────────────────────────────────── */

    $('#mba-wm-save-settings').on('click', function () {
        var $btn    = $(this);
        var $status = $('#mba-wm-save-status');

        $btn.prop('disabled', true);
        $status.show().text(mba_wm_data.i18n_saving || 'Saving…');

        var colorVal = $('#mba_wm_color').val();
        // wpColorPicker stores value in a hidden input
        if ($('.mba-wm-color-field').length && $.fn.wpColorPicker) {
            colorVal = $('.mba-wm-color-field').wpColorPicker('color') || colorVal;
        }

        $.post(ajaxurl, {
            action: 'mba_pro_save_watermark_settings',
            nonce: nonce,
            watermark_enabled:  $('#mba_wm_enabled').is(':checked') ? 1 : 0,
            watermark_type:     $('input[name="mba_wm_type"]:checked').val(),
            watermark_text:     $('#mba_wm_text').val(),
            watermark_image:    $('#mba_wm_image_id').val(),
            watermark_position: $('#mba_wm_position').val(),
            watermark_opacity:  $('#mba_wm_opacity').val(),
            watermark_size:     $('#mba_wm_font_size').val(),
            watermark_color:    colorVal,
            watermark_padding:  $('#mba_wm_padding').val()
        }, function (res) {
            $btn.prop('disabled', false);
            if (res.success) {
                $status.text(mba_wm_data.i18n_saved || 'Saved!').css('color', '#46b450');
            } else {
                $status.text(res.data && res.data.message ? res.data.message : 'Error').css('color', '#dc3232');
            }
            setTimeout(function () { $status.fadeOut(); }, 3000);
        }).fail(function () {
            $btn.prop('disabled', false);
            $status.text('Request failed.').css('color', '#dc3232');
            setTimeout(function () { $status.fadeOut(); }, 3000);
        });
    });

    /* ── Bulk helpers ─────────────────────────────────────────── */

    function showProgress(text) {
        $('#mba-wm-progress-wrap').show();
        $('#mba-wm-progress-text').text(text);
        $('.mba-wm-progress-bar-fill').css('width', '0%');
    }

    function updateProgress(pct, text) {
        $('.mba-wm-progress-bar-fill').css('width', pct + '%');
        if (text) {
            $('#mba-wm-progress-text').text(text);
        }
    }

    function hideProgress(delay) {
        setTimeout(function () {
            $('#mba-wm-progress-wrap').fadeOut();
        }, delay || 4000);
    }

    function bulkRequest(action, $btn, confirmMsg) {
        if (confirmMsg && !confirm(confirmMsg)) {
            return;
        }

        var origText = $btn.text();
        $btn.prop('disabled', true).text('Processing…');
        showProgress('Starting…');
        updateProgress(30, 'Processing images…');

        $.post(ajaxurl, {
            action: action,
            nonce: nonce
        }, function (res) {
            $btn.prop('disabled', false).text(origText);
            if (res.success) {
                var d = res.data;
                var msg = 'Done! ';
                if (d.success !== undefined) msg += 'Success: ' + d.success + ' ';
                if (d.skipped !== undefined) msg += 'Skipped: ' + d.skipped + ' ';
                if (d.failed !== undefined && d.failed > 0) msg += 'Failed: ' + d.failed;
                updateProgress(100, msg);
            } else {
                updateProgress(100, 'Error: ' + (res.data && res.data.message ? res.data.message : 'Unknown error'));
            }
            hideProgress(6000);
        }).fail(function () {
            $btn.prop('disabled', false).text(origText);
            updateProgress(100, 'Request failed.');
            hideProgress(5000);
        });
    }

    /* ── Bulk Tool Buttons ────────────────────────────────────── */

    $('#mba-wm-test').on('click', function () {
        var $btn = $(this);
        var $result = $('#mba-wm-test-result');
        $btn.prop('disabled', true);
        $result.show().html('<em>Testing…</em>');

        $.post(ajaxurl, {
            action: 'mba_pro_test_watermark',
            nonce: nonce
        }, function (res) {
            $btn.prop('disabled', false);
            if (res.success) {
                var d = res.data;
                var html = '<ul style="margin:0;list-style:disc inside;">' +
                    '<li>Library: <strong>' + d.library + '</strong></li>' +
                    '<li>Available: ' + (d.is_available ? '✓' : '✗') + '</li>' +
                    '<li>Enabled: ' + (d.is_enabled ? '✓' : '✗') + '</li>' +
                    '<li>Configured: ' + (d.is_configured ? '✓' : '✗') + '</li>' +
                    '<li>Type: ' + d.type + '</li>' +
                    '<li>Total gallery images: ' + d.total_images + '</li>' +
                    '</ul>';
                $result.html(html);
            } else {
                $result.html('<span style="color:#dc3232;">' + (res.data && res.data.message ? res.data.message : 'Error') + '</span>');
            }
        }).fail(function () {
            $btn.prop('disabled', false);
            $result.html('<span style="color:#dc3232;">Request failed.</span>');
        });
    });

    $('#mba-wm-bulk-apply').on('click', function () {
        bulkRequest('mba_pro_bulk_watermark', $(this));
    });

    $('#mba-wm-clear-reapply').on('click', function () {
        bulkRequest('mba_pro_clear_reapply', $(this), 'This will remove existing watermarks and reapply with current settings. Continue?');
    });

    $('#mba-wm-remove-all').on('click', function () {
        bulkRequest('mba_pro_remove_watermarks', $(this), 'Remove ALL watermarks? Original images are safe. Continue?');
    });

})(jQuery);
