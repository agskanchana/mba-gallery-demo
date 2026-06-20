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

        var splideOptions = {
            type        : config.loop ? 'loop' : 'slide',
            perPage     : perPage,
            perMove     : 1,
            gap         : config.gap || '20px',
            arrows      : config.arrows !== false,
            pagination  : config.pagination !== false,
            autoplay    : !!config.autoplay,
            interval    : config.autoplaySpeed || 3000,
            pauseOnHover: true,
            pauseOnFocus: true,
            speed       : 500,
            easing      : 'cubic-bezier(0.25, 1, 0.5, 1)',
            drag        : true,
            lazyLoad    : 'nearby',
            breakpoints : {
                991 : { perPage: Math.min(perPage, 2), gap: '15px' },
                600 : { perPage: 1, gap: '10px' },
            },
        };

        var splide = new Splide(el, splideOptions);
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
     */
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
