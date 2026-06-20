/**
 * MBA Gallery Pro – Infinite Scroll
 *
 * Turns the manual "Load More" button into a Facebook-style feed: as the user
 * scrolls near the end of the gallery, the next page loads automatically.
 *
 * Strategy
 * ────────
 * Rather than re-implementing pagination, this watches a 1px sentinel placed
 * just after the gallery grid with an IntersectionObserver and programmatically
 * clicks the free plugin's existing "Load More" button when the sentinel nears
 * the viewport. All page-slicing, end-of-list detection and (for masonry)
 * re-packing is handled by the existing gallery.js / pro-masonry.js code —
 * pro-masonry wraps window.renderGalleryItems, so a single click works for both
 * the Classic and Masonry layouts.
 *
 * The button is only hidden once this script is active (the hiding CSS is
 * injected from JS), so it still works as a no-JS / unsupported-browser
 * fallback. getBoundingClientRect drives a refill loop so a short first page
 * still fills a tall viewport even though IntersectionObserver doesn't re-fire
 * while the sentinel stays in view.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    // Start loading this many px before the sentinel reaches the viewport bottom.
    var PRELOAD_MARGIN = 600;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        var grid = document.getElementById('medbeafgallery-gallery-grid');
        var btn  = document.getElementById('medbeafgallery-load-more');

        // Nothing to enhance (e.g. single-case / carousel embeds) or the browser
        // lacks IntersectionObserver → leave the manual button in place.
        if (!grid || !btn || !('IntersectionObserver' in window)) {
            return;
        }

        hideLoadMoreButton();

        // Sentinel sits right after the grid; as items append the grid grows and
        // pushes the sentinel down, so its position tracks "near the end".
        var sentinel = document.createElement('div');
        sentinel.className = 'mba-pro-infinite-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.style.cssText = 'width:100%;height:1px;';
        grid.insertAdjacentElement('afterend', sentinel);

        var ticking = false;

        var observer = new IntersectionObserver(function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) {
                scheduleLoad();
            }
        }, { root: null, rootMargin: '0px 0px ' + PRELOAD_MARGIN + 'px 0px', threshold: 0 });

        observer.observe(sentinel);

        // ── Helpers ──────────────────────────────────────────────────────────
        function scheduleLoad() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(runLoad);
        }

        function runLoad() {
            ticking = false;
            if (!hasMore() || !sentinelInPreloadZone()) return;
            btn.click();        // canonical load-more action (renders synchronously)
            scheduleLoad();     // keep filling until the zone clears or pages run out
        }

        function hasMore() {
            if (typeof galleryConfig !== 'undefined' && typeof galleryConfig.totalPages === 'number') {
                return galleryConfig.currentPage < galleryConfig.totalPages;
            }
            // Fallback: gallery.js hides the button when there's no next page.
            return btn.style.display !== 'none';
        }

        function sentinelInPreloadZone() {
            var vh = window.innerHeight || document.documentElement.clientHeight;
            return sentinel.getBoundingClientRect().top <= vh + PRELOAD_MARGIN;
        }
    }

    /**
     * Visually hide the Load More button without removing it from the DOM, so
     * gallery.js can keep toggling its inline display (which we read as a
     * fallback "has more pages" signal) and so it still works without JS.
     */
    function hideLoadMoreButton() {
        var style = document.createElement('style');
        style.textContent =
            '#medbeafgallery-load-more{position:absolute!important;width:1px;height:1px;' +
            'padding:0!important;margin:-1px!important;border:0!important;overflow:hidden;' +
            'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;pointer-events:none;}';
        document.head.appendChild(style);
    }
})();
