/**
 * MBA Gallery Pro – Dashboard Tabs JS
 *
 * Handles tab switching and persists the active tab in localStorage.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'mba_pro_active_tab';

    /**
     * (Re-)initialize wpColorPicker widgets inside a given tab panel.
     * Needed because Iris/wpColorPicker can miscalculate layout when
     * initialized on a hidden (display:none) element.
     */
    function initColorPickersInPanel(tabId) {
        if (typeof jQuery === 'undefined' || !jQuery.fn.wpColorPicker) {
            return;
        }
        var $ = jQuery;
        var panel = document.getElementById('mba-pro-panel-' + tabId);
        if (!panel) return;

        // Find color inputs that are NOT yet wrapped by wpColorPicker
        $(panel).find('input[type="text"].mba-wm-color-field').each(function () {
            var $input = $(this);
            if (!$input.closest('.wp-picker-container').length) {
                $input.wpColorPicker();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var wrapper = document.querySelector('.mba-pro-tabs-wrapper');
        if (!wrapper) return;

        var buttons = wrapper.querySelectorAll('.mba-pro-tab-btn');
        var panels  = wrapper.querySelectorAll('.mba-pro-tab-panel');
        if (!buttons.length || !panels.length) return;

        /**
         * Activate a specific tab by its data-tab value.
         */
        function activateTab(tabId, pushState) {
            buttons.forEach(function (btn) {
                var isTarget = btn.getAttribute('data-tab') === tabId;
                btn.classList.toggle('mba-pro-tab-active', isTarget);
                btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            });
            panels.forEach(function (panel) {
                var isTarget = panel.getAttribute('data-tab') === tabId;
                panel.classList.toggle('mba-pro-tab-panel-active', isTarget);
            });

            // Re-initialize any color pickers inside the newly-visible panel.
            // wpColorPicker / Iris can have layout issues when initialized on
            // hidden elements, so we (re-)init when the panel becomes visible.
            initColorPickersInPanel(tabId);

            // Persist choice
            try { localStorage.setItem(STORAGE_KEY, tabId); } catch (e) {}

            // Update URL hash (without scroll)
            if (pushState && window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#pro-' + tabId);
            }
        }

        // Bind click events
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                activateTab(btn.getAttribute('data-tab'), true);
            });
        });

        // Determine initial tab: URL hash > localStorage > first tab
        var initialTab = '';

        // Check URL hash
        var hash = window.location.hash;
        if (hash && hash.indexOf('#pro-') === 0) {
            initialTab = hash.replace('#pro-', '');
        }

        // Fallback to localStorage
        if (!initialTab) {
            try { initialTab = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}
        }

        // Validate the tab exists
        var validTabs = [];
        panels.forEach(function (p) { validTabs.push(p.getAttribute('data-tab')); });
        if (validTabs.indexOf(initialTab) === -1) {
            initialTab = validTabs[0] || '';
        }

        if (initialTab) {
            activateTab(initialTab, false);
        }

        // Keyboard navigation (arrow keys for accessible tab list)
        var tabList = wrapper.querySelector('[role="tablist"]');
        if (tabList) {
            tabList.addEventListener('keydown', function (e) {
                var idx = -1;
                buttons.forEach(function (b, i) { if (b === document.activeElement) idx = i; });
                if (idx === -1) return;

                var newIdx = -1;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    newIdx = (idx + 1) % buttons.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    newIdx = (idx - 1 + buttons.length) % buttons.length;
                } else if (e.key === 'Home') {
                    newIdx = 0;
                } else if (e.key === 'End') {
                    newIdx = buttons.length - 1;
                }

                if (newIdx !== -1) {
                    e.preventDefault();
                    buttons[newIdx].focus();
                    activateTab(buttons[newIdx].getAttribute('data-tab'), true);
                }
            });
        }
    });
})();
