/**
 * Pro Category Carousel — Splide.js integration.
 *
 * Initialises each [mba_category_carousel] instance on the page,
 * wires click handlers to the free plugin's openModal(id).
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    /**
     * Per-carousel case-ID lists.
     * Key = carousel DOM id, value = array of case IDs in slide order.
     */
    var carouselCaseMap = {};

    /**
     * Initialise all carousel instances on the page.
     */
    function initCarousels() {
        var carousels = document.querySelectorAll('.mba-pro-carousel');
        if (!carousels.length) return;

        carousels.forEach(function (el) {
            var configAttr = el.getAttribute('data-carousel-config');
            if (!configAttr) return;

            var config;
            try {
                config = JSON.parse(configAttr);
            } catch (e) {
                console.error('[MBA Carousel] Invalid config', e);
                return;
            }

            // Collect the case IDs for this carousel in slide order
            var cards = el.querySelectorAll('.mba-carousel-card[data-case-id]');
            var ids = [];
            cards.forEach(function (card) {
                var cid = parseInt(card.getAttribute('data-case-id'), 10);
                if (cid && ids.indexOf(cid) === -1) ids.push(cid);
            });
            carouselCaseMap[el.id] = ids;

            initSingleCarousel(el, config);
        });
    }

    /**
     * Initialise a single Splide carousel.
     *
     * @param {HTMLElement} el     The .splide root element.
     * @param {Object}      config Carousel options from PHP.
     */
    function initSingleCarousel(el, config) {
        var perPage = config.perPage || 3;
        var wantArrows = config.arrows !== false;
        var wantDots = config.pagination !== false;
        var head = el.querySelector('.mba-carousel-head');
        var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        // No autoplay with reduced motion (below), so no play/pause button either.
        var toggle = el.querySelector('.splide__toggle');
        if (reduceMotion && toggle && toggle.parentNode) {
            toggle.parentNode.removeChild(toggle);
        }
        var hasControls = !!(head && head.querySelector('.splide__arrow, .splide__toggle'));

        var splideOptions = {
            type        : config.loop ? 'loop' : 'slide',
            perPage     : perPage,
            perMove     : 1,
            gap         : config.gap || '20px',
            arrows      : wantArrows,
            pagination  : wantDots,
            // No autoplay at all for visitors who asked for less motion
            // (Splide's own reducedMotion option only pauses it).
            autoplay    : !!config.autoplay && !reduceMotion,
            interval    : config.autoplaySpeed || 3000,
            pauseOnHover: true,
            pauseOnFocus: true,
            speed       : 500,
            easing      : 'cubic-bezier(0.25, 1, 0.5, 1)',
            drag        : true,
            keyboard    : 'focused',
            lazyLoad    : false,
            reducedMotion: { speed: 0, rewindSpeed: 0, autoplay: 'pause' },
            breakpoints : {
                991 : { perPage: Math.min(perPage, 2), gap: '16px', padding: { left: 0, right: '9%' } },
                // One card and a "peek" of the next, so the row reads as scrollable.
                600 : { perPage: 1, gap: '12px', padding: { left: 0, right: '17%' } },
            },
        };
        if (config.i18n && typeof config.i18n === 'object') {
            splideOptions.i18n = config.i18n;
        }

        var splide = new Splide(el, splideOptions);

        // Arrows, dots, autoplay button, drag and loop clones only when the cards
        // overflow the row (a category with two cases shows two still cards).
        // Splide fires this on its first layout and whenever the answer changes.
        splide.on('overflow', function (isOverflow) {
            el.classList.toggle('mba-carousel-fits', !isOverflow);
            if (head) head.hidden = !(isOverflow && hasControls);
            if (!isOverflow) splide.go(0);
            splide.options = {
                arrows    : wantArrows && isOverflow,
                pagination: wantDots && isOverflow,
                drag      : isOverflow,
                clones    : isOverflow ? undefined : 0,
            };
        });

        // Past ~15 pages a row of dots says nothing: hide it (arrows, swipe and
        // the next-card peek remain).
        splide.on('pagination:mounted', function (data) {
            var many = !!(data && data.items && data.items.length > 15);
            el.classList.toggle('mba-carousel-many', many);
        });

        splide.mount();

        // ── Wire card click → openModal ────────────────────────────────────
        el.addEventListener('click', function (e) {
            var card = e.target.closest('.mba-carousel-card');
            if (!card) return;

            var caseId = parseInt(card.getAttribute('data-case-id'), 10);
            if (!caseId) return;

            e.preventDefault();
            e.stopPropagation();

            // Determine which carousel this card belongs to
            var carouselEl = card.closest('.mba-pro-carousel');
            var carouselId = carouselEl ? carouselEl.id : null;

            // Ensure gallery data includes this case, then scope modal navigation
            ensureCaseLoaded(caseId, function () {
                scopeModalToCarousel(carouselId);
                if (typeof openModal === 'function') {
                    openModal(caseId);
                }
                restoreScopeOnClose();
            });
        });
    }

    /**
     * Make sure the case exists in the global galleryData array.
     * If gallery.js hasn't fetched data yet (e.g. carousel-only page),
     * we fetch it via the REST API and append.
     */
    function ensureCaseLoaded(caseId, callback) {
        // Check if galleryData exists and already has this case
        if (typeof galleryData !== 'undefined' && galleryData.length) {
            var found = galleryData.find(function (item) { return item.id === caseId; });
            if (found) {
                callback();
                return;
            }
        }

        // Gallery data not loaded yet — fetch it from REST API
        var config = window.medbeafgalleryGalleryConfig;
        if (!config || !config.restUrl) {
            console.error('[MBA Carousel] Missing gallery config');
            return;
        }

        var url = config.restUrl + config.galleryEndpoint + '?per_page=-1';

        fetch(url, {
            headers: { 'X-WP-Nonce': config.nonce }
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data && data.cases) {
                // Populate the global gallery data
                if (typeof galleryData !== 'undefined') {
                    // Merge without duplicates
                    data.cases.forEach(function (item) {
                        var exists = galleryData.find(function (g) { return g.id === item.id; });
                        if (!exists) {
                            galleryData.push(item);
                        }
                    });
                } else {
                    window.galleryData = data.cases;
                }
            }
            callback();
        })
        .catch(function (err) {
            console.error('[MBA Carousel] Failed to fetch cases', err);
        });
    }

    /**
     * Override galleryConfig.filteredItems so modal prev/next only cycles
     * through cases that belong to this carousel, not the entire gallery.
     *
     * That list is the main gallery's too. Left overridden, a [medbeafgallery]
     * on the same page kept the carousel's cases after the modal closed: its
     * own modal counted "1 / 4", case navigation went dead for cards outside
     * the carousel, and Load More stopped adding cases. So the gallery's list is
     * put back as soon as the carousel-opened modal closes.
     */
    var scope = { saved: null, scoped: null, observer: null };

    function anyModalOpen() {
        var free = document.getElementById('medbeafgallery-modal');
        var pro  = document.querySelector('.mba-pro-mmodal');
        return !!((free && free.classList.contains('active')) ||
                  (pro && pro.classList.contains('mba-pro-mmodal-open')));
    }

    function restoreGalleryScope() {
        if (scope.observer) { scope.observer.disconnect(); scope.observer = null; }
        // Only if nothing re-filtered in the meantime; a newer list wins.
        if (scope.scoped && typeof galleryConfig !== 'undefined' && galleryConfig.filteredItems === scope.scoped) {
            galleryConfig.filteredItems = scope.saved;
        }
        scope.saved = scope.scoped = null;
    }

    // Called after openModal(): the masonry modal builds its root on first open.
    function restoreScopeOnClose() {
        if (!scope.scoped) return;
        // Both modals open synchronously, so nothing open now means the case
        // could not be shown — there is no modal session to scope.
        if (!anyModalOpen()) { restoreGalleryScope(); return; }
        if (scope.observer || typeof MutationObserver === 'undefined') return;
        var targets = [document.getElementById('medbeafgallery-modal'), document.querySelector('.mba-pro-mmodal')]
            .filter(Boolean);
        if (!targets.length) return;
        scope.observer = new MutationObserver(function () {
            if (!anyModalOpen()) restoreGalleryScope();
        });
        targets.forEach(function (t) {
            scope.observer.observe(t, { attributes: true, attributeFilter: ['class'] });
        });
    }

    function scopeModalToCarousel(carouselId) {
        if (!carouselId || typeof galleryConfig === 'undefined') return;

        var ids = carouselCaseMap[carouselId];
        if (!ids || !ids.length) return;

        // Build a filtered list in slide order from galleryData
        var scoped = [];
        ids.forEach(function (id) {
            var item = galleryData.find(function (g) { return g.id === id; });
            if (item) scoped.push(item);
        });

        if (scoped.length) {
            // Keep the gallery's own list from before the FIRST scoping, even
            // when a second carousel card is opened before the modal closes.
            if (!scope.scoped) scope.saved = galleryConfig.filteredItems;
            scope.scoped = scoped;
            galleryConfig.filteredItems = scoped;
        }
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCarousels);
    } else {
        initCarousels();
    }

})();
