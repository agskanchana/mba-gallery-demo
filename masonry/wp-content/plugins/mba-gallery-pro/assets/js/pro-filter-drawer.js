/**
 * MBA Gallery Pro — Filter Drawer (frontend).
 *
 * The "Open on click" filter placement: relocates the server-rendered filter
 * sidebar into a click-to-open "Filters" drawer with an active-filter count
 * badge. Independent of the card layout (Classic grid or Masonry cards) — runs
 * on every gallery whose container carries `.mba-pro-filters-drawer`.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var ICON_FILTER =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>';

    /* ════════════════════════════════════════════════════════════════════
       FILTER DRAWER (open on click) + active-filter count
       ════════════════════════════════════════════════════════════════════ */
    var countUpdaters = [];
    var recomputeTimer = null;
    function recomputeCounts() {
        for (var i = 0; i < countUpdaters.length; i++) {
            try { countUpdaters[i](); } catch (e) {}
        }
    }
    // Recompute after any change/click INSIDE a gallery (the toolbar/drawer are
    // inserted into .medbeafgallery-container, so this covers them): manual
    // (un)checking, plus the free plugin's "Clear All" and filter-tag removal,
    // which uncheck programmatically without a change event. Deferred a tick so
    // it reads the checkboxes after the free plugin's own handlers ran, and
    // coalesced so one interaction never queues multiple recomputes.
    function scheduleRecompute(e) {
        var t = e && e.target;
        if (!t || !t.closest || !t.closest('.medbeafgallery-container')) return;
        if (recomputeTimer) return;
        recomputeTimer = setTimeout(function () {
            recomputeTimer = null;
            recomputeCounts();
        }, 0);
    }
    document.addEventListener('change', scheduleRecompute, true);
    document.addEventListener('click', scheduleRecompute, true);

    function initDrawer() {
        var containers = document.querySelectorAll('.medbeafgallery-container.mba-pro-filters-drawer');
        for (var i = 0; i < containers.length; i++) {
            setupDrawer(containers[i]);
        }
    }

    function setupDrawer(container) {
        var sidebar = container.querySelector('.medbeafgallery-filter-sidebar');
        var main    = container.querySelector('.medbeafgallery-main-content');
        if (!main || !sidebar) return;

        var toolbar = document.createElement('div');
        toolbar.className = 'mba-pro-mtoolbar';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mba-pro-filters-btn';
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = ICON_FILTER + '<span>Filters</span><span class="mba-pro-filters-count mba-pro-hidden">0</span>';
        toolbar.appendChild(btn);

        sidebar.classList.add('mba-pro-drawer');
        toolbar.appendChild(sidebar);
        main.insertBefore(toolbar, main.firstChild);

        function closeDrawer() { toolbar.classList.remove('mba-pro-drawer-open'); btn.setAttribute('aria-expanded', 'false'); }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = toolbar.classList.toggle('mba-pro-drawer-open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        sidebar.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', function (e) { if (!toolbar.contains(e.target)) closeDrawer(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.keyCode === 27) closeDrawer(); });

        var countEl = btn.querySelector('.mba-pro-filters-count');
        function updateCount() {
            // Count checked filter checkboxes inside the drawer. Use a class to
            // hide (not the [hidden] attr — our display:inline-flex overrides it).
            var n = sidebar.querySelectorAll('input[type="checkbox"]:checked').length;
            countEl.textContent = n;
            countEl.classList.toggle('mba-pro-hidden', n === 0);
            btn.classList.toggle('mba-pro-filters-active', n > 0);
        }
        countUpdaters.push(updateCount);
        updateCount();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDrawer);
    } else {
        initDrawer();
    }

})();
