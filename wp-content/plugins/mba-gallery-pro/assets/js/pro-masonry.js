/**
 * MBA Gallery Pro — Masonry Layout
 *
 * An alternate gallery design selected via Appearance → Gallery Layout. It:
 *   1. Overrides the free plugin's card renderer (window.createGalleryItem) with
 *      a richer card: a per-pair viewer (arrows to move between image pairs, a
 *      small corner flip button + click-the-image to reveal the after, a pair
 *      label, a BEFORE/AFTER badge and dot pagination), plus category, title,
 *      snippet, meta pills, a numbered index and a "View Details" button.
 *   2. Lays the cards out in a CSS-columns masonry grid (pro-masonry.css).
 *   3. Replaces the free plugin's modal (window.openModal) with a custom modal:
 *      a large image you click (or use the footer flip button) to reveal the
 *      after, prev/next pair arrows + pair-nav dots, a side panel with a
 *      treatment-overview grid and the case description (shown as tabs on the
 *      stacked mobile layout), and a footer with case navigation (with a
 *      "1 / N" counter), the flip toggle and the CTA button.
 *
 * The filter placement (sidebar vs. click-to-open drawer) is a separate concern
 * handled by pro-filter-drawer.js / pro-filter-drawer.css, driven by the Filter
 * Display setting — independent of this card layout.
 *
 * Note: the free plugin declares its globals with let/const (galleryData,
 * galleryConfig) — they live in the global lexical scope, NOT on window, so they
 * are referenced bare (guarded by typeof). Its functions (createGalleryItem,
 * openModal, renderGalleryItems) ARE window properties, so they can be overridden.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var config = window.medbeafgalleryGalleryConfig || {};
    if (config.galleryLayout !== 'masonry') {
        return;
    }

    // Honour the gallery's custom Before/After labels (Comparison & Discovery).
    var BEFORE_LABEL = config.beforeLabel || 'Before';
    var AFTER_LABEL  = config.afterLabel  || 'After';

    // Default View Mode (Comparison & Discovery): for masonry this is "show
    // before first" (default), "show after first", or "both" (side by side in
    // the modal). Maps onto the initial reveal state of every card and the modal.
    var DEFAULT_AFTER = (config.defaultViewMode === 'after');
    // "Both" applies to the MODAL only (cards keep the single-image toggle).
    var DEFAULT_BOTH  = (config.defaultViewMode === 'both');

    // Custom filter definitions ({ name, label, standard }). The non-standard
    // ones are shown — with their labels — on cards and in the modal so the
    // viewer can tell which attribute each value belongs to.
    var PRO_FILTER_DEFS = Array.isArray(config.proFilterDefs) ? config.proFilterDefs : [];
    var CUSTOM_FILTER_DEFS = PRO_FILTER_DEFS.filter(function (d) { return d && !d.standard && d.name; });

    // Which built-in case attributes the admin left enabled (as filters). Cards
    // and the modal must not surface gender/age/recovery/duration/results/
    // procedure once their filter has been removed. When the list is absent
    // (older free plugin) fall back to showing everything, preserving behaviour.
    var ENABLED_DETAILS = Array.isArray(config.enabledDetails) ? config.enabledDetails : null;
    function detailEnabled(key) {
        return !ENABLED_DETAILS || ENABLED_DETAILS.indexOf(key) !== -1;
    }

    /* ── Icons ──────────────────────────────────────────────────────────── */
    var ICON_PREV =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    var ICON_NEXT =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    var ICON_ARROW =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    var ICON_CLOSE =
        '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    var ICON_CLOCK =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    var ICON_PULSE =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>';
    var ICON_STAR =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    var ICON_LAYERS =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
    var ICON_SHIELD =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
    var ICON_USER =
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

    /* Maps a Treatment Overview tile label to its icon. */
    var TILE_ICONS = {
        'Duration':    ICON_CLOCK,
        'Image Pairs': ICON_LAYERS,
        'Recovery':    ICON_PULSE,
        'Results':     ICON_STAR,
        'Procedure':   ICON_SHIELD,
        'Age':         ICON_USER,
        'Gender':      ICON_USER
    };

    /* ── Helpers ────────────────────────────────────────────────────────── */
    // innerHTML serialisation escapes & < > but NOT quotes; esc() output is
    // interpolated into attribute values (src/href/data-id), so escape those too.
    function esc(str) {
        var d = document.createElement('div');
        d.textContent = (str === null || str === undefined) ? '' : String(str);
        return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    // For href values from settings: allow anything except script-ish schemes.
    function safeUrl(url) {
        url = (url === null || url === undefined) ? '' : String(url).trim();
        return /^(javascript|data|vbscript):/i.test(url) ? '' : url;
    }
    // Decode HTML entities so they aren't shown literally. WordPress encodes "&"
    // in titles as "&#038;" (the_title → convert_chars), and reading that back via
    // textContent would print the raw entity. A <textarea> decodes without
    // executing markup; the result is re-escaped (esc/textContent) before display.
    function dec(str) {
        if (str === null || str === undefined) return '';
        var t = document.createElement('textarea');
        t.innerHTML = String(str);
        return t.value;
    }
    function stripTags(html) {
        if (!html) return '';
        var d = document.createElement('div');
        d.innerHTML = html;
        return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
    }
    function snippet(html, max) {
        var t = stripTags(html);
        return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function cap(s) {
        s = (s === null || s === undefined) ? '' : String(s);
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }
    function filteredList() {
        if (typeof galleryConfig !== 'undefined' && galleryConfig && Array.isArray(galleryConfig.filteredItems)) {
            return galleryConfig.filteredItems;
        }
        return null;
    }
    // id → 1-based position map, cached per filteredItems array. The free plugin
    // always REPLACES galleryConfig.filteredItems with a new array (never mutates
    // in place), so the reference check is a safe invalidation key — and card
    // rendering stays O(n) instead of a findIndex per card.
    var numIndex = { list: null, map: null };
    function itemNumber(item) {
        var list = filteredList();
        if (!list) return 0;
        if (numIndex.list !== list) {
            numIndex.list = list;
            numIndex.map = {};
            for (var i = 0; i < list.length; i++) {
                numIndex.map[list[i].id] = i + 1;
            }
        }
        return numIndex.map[item.id] || 0;
    }
    function pill(icon, text) {
        return '<span class="mba-pro-mcard-pill">' + icon + '<span>' + esc(text) + '</span></span>';
    }
    // Custom-filter pill: prefixes the value with its filter label so it's clear
    // which attribute the value belongs to (e.g. "Skin type: Oily").
    function pillLabeled(label, text) {
        return '<span class="mba-pro-mcard-pill mba-pro-mcard-pill-custom">' +
               '<span class="mba-pro-mcard-pill-l">' + esc(label) + ':</span> ' +
               '<span>' + esc(text) + '</span></span>';
    }
    // Resolve a filter value for an item: standard fields come from the item's
    // own properties, custom ones from the injected proFilters map.
    function customFilterValue(item, def) {
        if (item.proFilters && item.proFilters[def.name] !== undefined) {
            return item.proFilters[def.name];
        }
        return '';
    }
    function buildPairs(item) {
        var pairs = [];
        if (item.beforeImg || item.afterImg) {
            pairs.push({
                before: item.beforeImg, after: item.afterImg,
                beforeAlt: item.beforeAlt || 'Before', afterAlt: item.afterAlt || 'After',
                label: item.main_description || ''
            });
        }
        if (item.imagePairs && item.imagePairs.length) {
            item.imagePairs.forEach(function (p) {
                pairs.push({
                    before: p.beforeImg, after: p.afterImg,
                    beforeAlt: p.beforeAlt || 'Before', afterAlt: p.afterAlt || 'After',
                    label: p.description || ''
                });
            });
        }
        if (!pairs.length) {
            pairs.push({ before: item.beforeImg, after: item.afterImg, beforeAlt: 'Before', afterAlt: 'After', label: '' });
        }
        return pairs;
    }
    // All category names for an item (a case can belong to several categories).
    // Falls back to the single primary name / slug.
    function catNames(item) {
        if (Array.isArray(item.categoryNames) && item.categoryNames.length) return item.categoryNames;
        if (Array.isArray(item.category_names) && item.category_names.length) return item.category_names;
        var one = item.categoryName || item.category;
        return one ? [one] : [];
    }
    function findItem(id) {
        if (typeof galleryData === 'undefined' || !Array.isArray(galleryData)) return null;
        return galleryData.find(function (it) { return it.id === id; }) || null;
    }

    /* ════════════════════════════════════════════════════════════════════
       CARD RENDERER (overrides the free plugin's createGalleryItem)

       The card deliberately does NOT use the free `medbeafgallery-gallery-item`
       / `medbeafgallery-gallery-view-btn` classes: the free plugin has a
       document-level delegated click handler that opens the modal for those, so
       keeping them would open the modal on any card/image click. Only our own
       "View Details" handler opens the modal here.
       ════════════════════════════════════════════════════════════════════ */
    function buildMasonryCard(item) {
        if (!item) return null;

        var pairs = buildPairs(item);
        var multi = pairs.length > 1;

        var card = document.createElement('div');
        card.className = 'mba-pro-mcard';
        card.dataset.id = item.id;
        card.dataset.category = item.category;

        var num = itemNumber(item);
        var numHtml = num ? '<span class="mba-pro-mcard-num">' + pad2(num) + '</span>' : '';

        var navHtml = multi
            ? '<button type="button" class="mba-pro-mcard-arrow mba-pro-mcard-prev" aria-label="Previous image pair">' + ICON_PREV + '</button>' +
              '<button type="button" class="mba-pro-mcard-arrow mba-pro-mcard-next" aria-label="Next image pair">' + ICON_NEXT + '</button>'
            : '';

        var countHtml = multi ? '<span class="mba-pro-mcard-count"></span>' : '';

        var toggleHtml =
            '<div class="mba-pro-mcard-toggle" role="group" aria-label="Toggle before and after">' +
                '<button type="button" class="mba-pro-mcard-seg is-active" data-mode="before" aria-pressed="true"><span class="mba-pro-mcard-seg-dot"></span>' + esc(BEFORE_LABEL) + '</button>' +
                '<button type="button" class="mba-pro-mcard-seg" data-mode="after" aria-pressed="false"><span class="mba-pro-mcard-seg-dot"></span>' + esc(AFTER_LABEL) + '</button>' +
            '</div>';

        var angles = pairs.length;
        var pills = '';
        if (item.duration && detailEnabled('duration')) pills += pill(ICON_CLOCK, item.duration);
        if (item.recovery && detailEnabled('recovery')) pills += pill(ICON_PULSE, item.recovery);
        if (item.results  && detailEnabled('results'))  pills += pill(ICON_STAR, item.results);
        if (angles > 1)    pills += pill(ICON_LAYERS, angles + ' angles');
        // Custom filters — labelled so the attribute is identifiable.
        CUSTOM_FILTER_DEFS.forEach(function (def) {
            var v = customFilterValue(item, def);
            if (v) pills += pillLabeled(def.label, v);
        });
        var pillsHtml = pills ? '<div class="mba-pro-mcard-meta">' + pills + '</div>' : '';

        var desc = snippet(item.description || item.content || '', 120);
        var descHtml = desc ? '<p class="mba-pro-mcard-desc">' + esc(desc) + '</p>' : '';

        var cats = catNames(item);
        var catHtml = cats.length
            ? '<span class="mba-pro-mcard-cats">' + cats.map(function (c) {
                  return '<span class="medbeafgallery-gallery-category mba-pro-mcard-cat">' + esc(dec(c)) + '</span>';
              }).join('') + '</span>'
            : '';

        card.innerHTML =
            '<div class="mba-pro-mcard-media">' +
                '<span class="mba-pro-mcard-plabel"></span>' +
                countHtml +
                navHtml +
                '<img class="mba-pro-mcard-img mba-pro-mcard-before" loading="lazy">' +
                '<img class="mba-pro-mcard-img mba-pro-mcard-after" loading="lazy" aria-hidden="true">' +
                toggleHtml +
            '</div>' +
            '<div class="medbeafgallery-gallery-item-info mba-pro-mcard-body">' +
                numHtml +
                catHtml +
                '<h3 class="mba-pro-mcard-title">' + esc(dec(item.title)) + '</h3>' +
                descHtml +
                pillsHtml +
                '<div class="mba-pro-mcard-foot">' +
                    '<button type="button" class="mba-pro-mcard-view" data-id="' + esc(item.id) + '">View Details ' + ICON_ARROW + '</button>' +
                '</div>' +
            '</div>';

        var media   = card.querySelector('.mba-pro-mcard-media');
        var beforeI = card.querySelector('.mba-pro-mcard-before');
        var afterI  = card.querySelector('.mba-pro-mcard-after');
        var labelEl = card.querySelector('.mba-pro-mcard-plabel');
        var countEl = card.querySelector('.mba-pro-mcard-count');
        var segB    = card.querySelector('.mba-pro-mcard-seg[data-mode="before"]');
        var segA    = card.querySelector('.mba-pro-mcard-seg[data-mode="after"]');

        var state = { idx: 0, after: DEFAULT_AFTER };

        function paint() {
            var p = pairs[state.idx];
            beforeI.src = p.before || '';
            beforeI.alt = p.beforeAlt;
            afterI.src = p.after || '';
            afterI.alt = p.afterAlt;
            card.classList.toggle('mba-pro-show-after', state.after);
            // Keep the hidden side of the cross-fade out of the a11y tree.
            beforeI.setAttribute('aria-hidden', String(state.after));
            afterI.setAttribute('aria-hidden', String(!state.after));
            if (segB) { segB.classList.toggle('is-active', !state.after); segB.setAttribute('aria-pressed', String(!state.after)); }
            if (segA) { segA.classList.toggle('is-active', state.after); segA.setAttribute('aria-pressed', String(state.after)); }
            if (labelEl) {
                labelEl.textContent = p.label || '';
                labelEl.style.display = p.label ? '' : 'none';
            }
            if (countEl) { countEl.textContent = (state.idx + 1) + ' / ' + pairs.length; }
        }
        function flip() { state.after = !state.after; paint(); }
        function goPair(delta) {
            state.idx = (state.idx + delta + pairs.length) % pairs.length;
            state.after = DEFAULT_AFTER;
            paint();
        }

        // Clicking the image reveals after/before; the segmented control sets it explicitly.
        media.addEventListener('click', flip);
        if (segB) segB.addEventListener('click', function (e) { e.stopPropagation(); state.after = false; paint(); });
        if (segA) segA.addEventListener('click', function (e) { e.stopPropagation(); state.after = true; paint(); });

        var prevBtn = card.querySelector('.mba-pro-mcard-prev');
        var nextBtn = card.querySelector('.mba-pro-mcard-next');
        if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); goPair(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); goPair(1); });

        // ONLY "View Details" opens the modal.
        var viewBtn = card.querySelector('.mba-pro-mcard-view');
        if (viewBtn) {
            viewBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof openModal === 'function') openModal(item.id);
            });
        }

        paint();
        return card;
    }

    /* ════════════════════════════════════════════════════════════════════
       CUSTOM MODAL (overrides the free plugin's openModal)
       ════════════════════════════════════════════════════════════════════ */
    var modalApi = null;

    function ensureModal() {
        if (modalApi) return modalApi;

        var root = document.createElement('div');
        root.className = 'mba-pro-mmodal';
        root.id = 'mba-pro-mmodal';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'mba-pro-mmodal-title');
        // Honour the "Show labels" setting for the side-by-side captions.
        if (config.showLabels === false) root.classList.add('mba-pro-no-caps');
        // With "Both" as the default there is nothing to toggle — hide the
        // Before/After segmented control so only the side-by-side view shows.
        if (DEFAULT_BOTH) root.classList.add('mba-pro-both-default');
        root.innerHTML =
            '<div class="mba-pro-mmodal-overlay" data-close></div>' +
            '<div class="mba-pro-mmodal-dialog" tabindex="-1">' +
                '<header class="mba-pro-mmodal-header">' +
                    '<div class="mba-pro-mmodal-heading">' +
                        '<span class="mba-pro-mmodal-eyebrow"></span>' +
                        '<h2 class="mba-pro-mmodal-title" id="mba-pro-mmodal-title"></h2>' +
                    '</div>' +
                    '<button type="button" class="mba-pro-mmodal-close" data-close aria-label="Close">' + ICON_CLOSE + '</button>' +
                '</header>' +
                '<div class="mba-pro-mmodal-body">' +
                    '<div class="mba-pro-mmodal-main">' +
                        '<div class="mba-pro-mmodal-stage">' +
                            '<button type="button" class="mba-pro-mmodal-arrow mba-pro-mmodal-prev" aria-label="Previous image pair">' + ICON_PREV + '</button>' +
                            '<div class="mba-pro-mmodal-imgwrap">' +
                                '<span class="mba-pro-mmodal-plabel"></span>' +
                                '<span class="mba-pro-mmodal-paircount"></span>' +
                                '<img class="mba-pro-mmodal-img mba-pro-mmodal-before" alt="">' +
                                '<img class="mba-pro-mmodal-img mba-pro-mmodal-after" alt="" aria-hidden="true">' +
                                '<div class="mba-pro-mmodal-sbs" aria-hidden="true">' +
                                    '<figure class="mba-pro-mmodal-sbs-cell">' +
                                        '<img class="mba-pro-mmodal-sbs-img mba-pro-mmodal-sbs-before" alt="">' +
                                        '<figcaption class="mba-pro-mmodal-sbs-cap">' + esc(BEFORE_LABEL) + '</figcaption>' +
                                    '</figure>' +
                                    '<figure class="mba-pro-mmodal-sbs-cell">' +
                                        '<img class="mba-pro-mmodal-sbs-img mba-pro-mmodal-sbs-after" alt="">' +
                                        '<figcaption class="mba-pro-mmodal-sbs-cap">' + esc(AFTER_LABEL) + '</figcaption>' +
                                    '</figure>' +
                                '</div>' +
                            '</div>' +
                            '<button type="button" class="mba-pro-mmodal-arrow mba-pro-mmodal-next" aria-label="Next image pair">' + ICON_NEXT + '</button>' +
                            '<div class="mba-pro-mmodal-toggle" role="group" aria-label="Toggle before and after">' +
                                '<button type="button" class="mba-pro-mmodal-seg is-active" data-mode="before" aria-pressed="true"><span class="mba-pro-mmodal-seg-dot"></span>' + esc(BEFORE_LABEL) + '</button>' +
                                '<button type="button" class="mba-pro-mmodal-seg" data-mode="after" aria-pressed="false"><span class="mba-pro-mmodal-seg-dot"></span>' + esc(AFTER_LABEL) + '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<aside class="mba-pro-mmodal-side">' +
                        '<div class="mba-pro-mmodal-tabs" role="tablist">' +
                            '<button type="button" class="mba-pro-mmodal-tab is-active" data-tab="overview" role="tab" aria-selected="true">Treatment Overview</button>' +
                            '<button type="button" class="mba-pro-mmodal-tab" data-tab="about" role="tab" aria-selected="false">About This Case</button>' +
                        '</div>' +
                        '<div class="mba-pro-mmodal-overview mba-pro-tab-active">' +
                            '<h3 class="mba-pro-mmodal-h">Treatment Overview</h3>' +
                            '<div class="mba-pro-mmodal-tiles"></div>' +
                        '</div>' +
                        '<div class="mba-pro-mmodal-about">' +
                            '<h3 class="mba-pro-mmodal-h">About This Case</h3>' +
                            '<div class="mba-pro-mmodal-about-body"></div>' +
                        '</div>' +
                    '</aside>' +
                '</div>' +
                '<footer class="mba-pro-mmodal-footer">' +
                    '<div class="mba-pro-mmodal-foot-nav">' +
                        '<button type="button" class="mba-pro-mmodal-casenav mba-pro-mmodal-caseprev" aria-label="Previous case">' + ICON_PREV + '</button>' +
                        '<span class="mba-pro-mmodal-counter"></span>' +
                        '<button type="button" class="mba-pro-mmodal-casenav mba-pro-mmodal-casenext" aria-label="Next case">' + ICON_NEXT + '</button>' +
                    '</div>' +
                    '<div class="mba-pro-mmodal-cta mba-pro-hidden"></div>' +
                '</footer>' +
            '</div>';
        document.body.appendChild(root);

        var els = {
            root:     root,
            dialog:   root.querySelector('.mba-pro-mmodal-dialog'),
            body:     root.querySelector('.mba-pro-mmodal-body'),
            stage:    root.querySelector('.mba-pro-mmodal-stage'),
            sbs:      root.querySelector('.mba-pro-mmodal-sbs'),
            eyebrow:  root.querySelector('.mba-pro-mmodal-eyebrow'),
            title:    root.querySelector('.mba-pro-mmodal-title'),
            before:   root.querySelector('.mba-pro-mmodal-before'),
            after:    root.querySelector('.mba-pro-mmodal-after'),
            sbsBefore: root.querySelector('.mba-pro-mmodal-sbs-before'),
            sbsAfter:  root.querySelector('.mba-pro-mmodal-sbs-after'),
            paircount: root.querySelector('.mba-pro-mmodal-paircount'),
            plabel:   root.querySelector('.mba-pro-mmodal-plabel'),
            imgwrap:  root.querySelector('.mba-pro-mmodal-imgwrap'),
            prev:     root.querySelector('.mba-pro-mmodal-prev'),
            next:     root.querySelector('.mba-pro-mmodal-next'),
            tiles:    root.querySelector('.mba-pro-mmodal-tiles'),
            overview: root.querySelector('.mba-pro-mmodal-overview'),
            about:    root.querySelector('.mba-pro-mmodal-about'),
            aboutBody: root.querySelector('.mba-pro-mmodal-about-body'),
            side:     root.querySelector('.mba-pro-mmodal-side'),
            tabs:     root.querySelector('.mba-pro-mmodal-tabs'),
            tabBtns:  root.querySelectorAll('.mba-pro-mmodal-tab'),
            footNav:  root.querySelector('.mba-pro-mmodal-foot-nav'),
            caseprev: root.querySelector('.mba-pro-mmodal-caseprev'),
            casenext: root.querySelector('.mba-pro-mmodal-casenext'),
            counter:  root.querySelector('.mba-pro-mmodal-counter'),
            segBefore: root.querySelector('.mba-pro-mmodal-seg[data-mode="before"]'),
            segAfter:  root.querySelector('.mba-pro-mmodal-seg[data-mode="after"]'),
            cta:      root.querySelector('.mba-pro-mmodal-cta')
        };

        var state = { pairs: [], idx: 0, after: false, both: false, itemId: null };

        function paint() {
            var p = state.pairs[state.idx];
            if (!p) return;
            els.before.src = p.before || '';
            els.before.alt = p.beforeAlt;
            els.after.src = p.after || '';
            els.after.alt = p.afterAlt;
            if (els.sbsBefore) { els.sbsBefore.src = p.before || ''; els.sbsBefore.alt = p.beforeAlt; }
            if (els.sbsAfter)  { els.sbsAfter.src  = p.after  || ''; els.sbsAfter.alt  = p.afterAlt; }
            // "Both" shows the two images side by side; otherwise cross-fade.
            els.imgwrap.classList.toggle('mba-pro-show-both', state.both);
            els.imgwrap.classList.toggle('mba-pro-show-after', !state.both && state.after);
            // Expose only the visible image(s) to assistive tech.
            els.before.setAttribute('aria-hidden', String(state.both || state.after));
            els.after.setAttribute('aria-hidden', String(state.both || !state.after));
            if (els.sbs) els.sbs.setAttribute('aria-hidden', String(!state.both));
            if (els.segBefore) {
                els.segBefore.classList.toggle('is-active', !state.both && !state.after);
                els.segBefore.setAttribute('aria-pressed', String(!state.both && !state.after));
            }
            if (els.segAfter) {
                els.segAfter.classList.toggle('is-active', !state.both && state.after);
                els.segAfter.setAttribute('aria-pressed', String(!state.both && state.after));
            }
            if (els.plabel) {
                els.plabel.textContent = p.label || '';
                els.plabel.style.display = p.label ? '' : 'none';
            }
            if (els.paircount) {
                els.paircount.textContent = state.pairs.length > 1
                    ? ((state.idx + 1) + ' / ' + state.pairs.length)
                    : '';
            }

            // Annotation hotspots for the current pair / shown side.
            if (window.mbaProAnno) {
                window.mbaProAnno.clearAll(els.imgwrap);
                var anno = state.annotations ? state.annotations[state.idx] : null;
                if (anno) {
                    if (state.both) {
                        window.mbaProAnno.mount(els.sbsBefore, anno.before || []);
                        window.mbaProAnno.mount(els.sbsAfter, anno.after || []);
                    } else if (state.after) {
                        window.mbaProAnno.mount(els.after, anno.after || []);
                    } else {
                        window.mbaProAnno.mount(els.before, anno.before || []);
                    }
                }
            }
        }
        // Warm the browser cache for the pairs adjacent to the current one so
        // arrow / swipe navigation doesn't flash while the next image loads.
        function preloadNeighbors() {
            if (state.pairs.length < 2) return;
            [state.idx + 1, state.idx - 1].forEach(function (n) {
                var p = state.pairs[(n + state.pairs.length) % state.pairs.length];
                if (p.before) { (new Image()).src = p.before; }
                if (p.after)  { (new Image()).src = p.after; }
            });
        }

        // Clicking the image flips before/after — but not in side-by-side mode,
        // where both are already shown, and not right after a swipe (some
        // browsers still fire a click at the end of a touch drag).
        function flip() {
            if (state.both) return;
            if (Date.now() - swipe.lastAt < 400) return;
            state.after = !state.after;
            paint();
        }
        function goPair(delta) {
            if (state.pairs.length < 2) return;
            state.idx = (state.idx + delta + state.pairs.length) % state.pairs.length;
            state.after = DEFAULT_AFTER;
            state.both  = DEFAULT_BOTH;
            paint();
            preloadNeighbors();
        }
        function gotoCase(delta) {
            var list = filteredList();
            if (!list) return;
            var i = list.findIndex(function (it) { return it.id === state.itemId; });
            if (i < 0) return;
            open(list[(i + delta + list.length) % list.length]);
        }

        els.caseprev.addEventListener('click', function (e) { e.stopPropagation(); gotoCase(-1); });
        els.casenext.addEventListener('click', function (e) { e.stopPropagation(); gotoCase(1); });
        // The Before/After segments switch to a single image, leaving "both" mode.
        els.segBefore.addEventListener('click', function (e) { e.stopPropagation(); state.both = false; state.after = false; paint(); });
        els.segAfter.addEventListener('click', function (e) { e.stopPropagation(); state.both = false; state.after = true; paint(); });
        els.imgwrap.addEventListener('click', function () { flip(); });
        els.prev.addEventListener('click', function (e) { e.stopPropagation(); goPair(-1); });
        els.next.addEventListener('click', function (e) { e.stopPropagation(); goPair(1); });

        // Side-panel tabs (Treatment Overview / About This Case). The tab bar is
        // only visible on the stacked mobile layout (CSS); on desktop both panels
        // show together and these clicks never fire. setSideTab is a no-op when
        // one of the panels is hidden (a single section needs no tabbing).
        function setSideTab(name) {
            for (var i = 0; i < els.tabBtns.length; i++) {
                var on = els.tabBtns[i].getAttribute('data-tab') === name;
                els.tabBtns[i].classList.toggle('is-active', on);
                els.tabBtns[i].setAttribute('aria-selected', String(on));
            }
            els.overview.classList.toggle('mba-pro-tab-active', name === 'overview');
            els.about.classList.toggle('mba-pro-tab-active', name === 'about');
        }
        for (var ti = 0; ti < els.tabBtns.length; ti++) {
            els.tabBtns[ti].addEventListener('click', (function (btn) {
                return function (e) { e.stopPropagation(); setSideTab(btn.getAttribute('data-tab')); };
            })(els.tabBtns[ti]));
        }

        // Horizontal swipe on the stage moves between pairs (touch devices).
        // Passive listeners keep native vertical scrolling intact; a swipe only
        // counts when it's fast and clearly more horizontal than vertical.
        var swipe = { x: 0, y: 0, t: 0, lastAt: 0 };
        els.stage.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) { swipe.t = 0; return; }
            swipe.x = e.touches[0].clientX;
            swipe.y = e.touches[0].clientY;
            swipe.t = Date.now();
        }, { passive: true });
        els.stage.addEventListener('touchend', function (e) {
            if (!swipe.t || e.changedTouches.length !== 1) return;
            var dx = e.changedTouches[0].clientX - swipe.x;
            var dy = e.changedTouches[0].clientY - swipe.y;
            var dt = Date.now() - swipe.t;
            swipe.t = 0;
            if (dt < 700 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                swipe.lastAt = Date.now();
                goPair(dx < 0 ? 1 : -1);
            }
        }, { passive: true });

        // Body scroll lock that holds on iOS Safari too (where a plain
        // overflow:hidden on <body> is ignored): pin the body at the current
        // scroll offset while open, restore the offset on close.
        var lockedScrollY = 0;
        function lockScroll() {
            lockedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
            document.body.style.top = -lockedScrollY + 'px';
            document.body.classList.add('mba-pro-mmodal-lock');
        }
        function unlockScroll() {
            document.body.classList.remove('mba-pro-mmodal-lock');
            document.body.style.top = '';
            // Restore instantly even when the theme sets scroll-behavior:smooth.
            var html = document.documentElement;
            var prevBehavior = html.style.scrollBehavior;
            html.style.scrollBehavior = 'auto';
            window.scrollTo(0, lockedScrollY);
            html.style.scrollBehavior = prevBehavior;
        }

        // A history entry is pushed when the modal opens, so the mobile back
        // button (or browser back) closes the modal instead of leaving the page.
        var pushedHistory = false;
        function pushHistory() {
            try {
                history.pushState({ mbaProMmodal: true }, '');
                pushedHistory = true;
            } catch (err) {
                pushedHistory = false;
            }
        }
        window.addEventListener('popstate', function () {
            if (root.classList.contains('mba-pro-mmodal-open')) {
                pushedHistory = false; // our entry was just consumed by this pop
                close(true);
            }
        });

        // Focus handling: remember the opener, keep Tab inside the dialog while
        // open, hand focus back on close.
        var lastFocus = null;
        function focusables() {
            var sel = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            var nodes = root.querySelectorAll(sel);
            var out = [];
            for (var i = 0; i < nodes.length; i++) {
                // offsetParent is null inside display:none subtrees (hidden
                // arrows, hidden CTA…), limiting the trap to visible controls.
                if (nodes[i].offsetParent !== null) out.push(nodes[i]);
            }
            return out;
        }

        root.addEventListener('click', function (e) {
            if (e.target.closest('[data-close]')) close();
        });
        document.addEventListener('keydown', function (e) {
            if (!root.classList.contains('mba-pro-mmodal-open')) return;
            if (e.key === 'Escape') { close(); return; }
            if (e.key === 'Tab') {
                var f = focusables();
                if (!f.length) { e.preventDefault(); els.dialog.focus(); return; }
                var first = f[0], last = f[f.length - 1], active = document.activeElement;
                if (!root.contains(active)) { e.preventDefault(); first.focus(); }
                else if (e.shiftKey && (active === first || active === els.dialog)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
                return;
            }
            if (e.key === 'ArrowLeft') { e.altKey ? gotoCase(-1) : goPair(-1); }
            else if (e.key === 'ArrowRight') { e.altKey ? gotoCase(1) : goPair(1); }
        });

        function open(item) {
            // open() is also how case prev/next re-fills the modal — only do the
            // once-per-session work (lock, history, focus) on a real open.
            var wasOpen = root.classList.contains('mba-pro-mmodal-open');
            state.pairs = buildPairs(item);
            state.idx = 0;
            state.after = DEFAULT_AFTER;
            state.both  = DEFAULT_BOTH;
            state.itemId = item.id;
            state.annotations = item.annotations || null;

            els.eyebrow.textContent = dec(catNames(item).join(', '));
            els.title.textContent = dec(item.title) || 'Case Study';

            // Multiple pairs are navigated with the stage arrows + the "i / N"
            // counter and each pair's on-image label; no separate indicator row.
            var multi = state.pairs.length > 1;
            els.prev.style.display = multi ? '' : 'none';
            els.next.style.display = multi ? '' : 'none';

            // "Hide case details" hides overview + description.
            var hideDetails = !!config.hideCaseDetails;
            if (hideDetails) {
                els.overview.classList.add('mba-pro-hidden');
            } else {
                // "Image Pairs" is informational and always present, but it is NOT
                // a case filter. hasFilters tracks whether the case carries at
                // least one real filter attribute; with none, the whole Treatment
                // Overview is hidden (it would otherwise show only Image Pairs).
                var tiles = [];
                var hasFilters = false;
                if (item.duration && detailEnabled('duration')) { tiles.push(['Duration', cap(item.duration)]); hasFilters = true; }
                tiles.push(['Image Pairs', String(state.pairs.length)]);
                if (item.recovery && detailEnabled('recovery')) { tiles.push(['Recovery', cap(item.recovery)]); hasFilters = true; }
                if (item.results && detailEnabled('results')) { tiles.push(['Results', cap(item.results)]); hasFilters = true; }
                if ((item.procedureType || item.procedure) && detailEnabled('procedure')) { tiles.push(['Procedure', cap(item.procedureType || item.procedure)]); hasFilters = true; }
                if (item.age && detailEnabled('age')) { tiles.push(['Age', String(item.age)]); hasFilters = true; }
                if (item.gender && detailEnabled('gender')) { tiles.push(['Gender', cap(item.gender)]); hasFilters = true; }
                // Custom filters — each shown with its own label so the value is
                // identifiable (resolves "icons only" ambiguity for custom data).
                CUSTOM_FILTER_DEFS.forEach(function (def) {
                    var v = customFilterValue(item, def);
                    if (v) { tiles.push([def.label, cap(v)]); hasFilters = true; }
                });
                tiles = tiles.slice(0, 8);
                els.tiles.innerHTML = tiles.map(function (t) {
                    var ic = TILE_ICONS[t[0]] || ICON_LAYERS;
                    return '<div class="mba-pro-mmodal-tile">' +
                           '<span class="mba-pro-mmodal-tile-ic">' + ic + '</span>' +
                           '<span class="mba-pro-mmodal-tile-v">' + esc(t[1]) + '</span>' +
                           '<span class="mba-pro-mmodal-tile-l">' + esc(t[0]) + '</span></div>';
                }).join('');
                // No case filters applied → no Treatment Overview at all.
                els.overview.classList.toggle('mba-pro-hidden', !hasFilters);
            }

            var about = item.description || item.content || '';
            if (!hideDetails && stripTags(about)) {
                els.aboutBody.innerHTML = about;
                els.about.classList.remove('mba-pro-hidden');
            } else {
                els.aboutBody.innerHTML = '';
                els.about.classList.add('mba-pro-hidden');
            }

            // Side panel: shown when either section has content. When BOTH are
            // present they become tabs on the stacked mobile layout (no room for
            // both); with a single section there is nothing to tab between, so
            // the tab bar stays hidden and that section just shows on its own.
            var overviewShown = !els.overview.classList.contains('mba-pro-hidden');
            var aboutShown    = !els.about.classList.contains('mba-pro-hidden');
            var sideHasContent = overviewShown || aboutShown;
            els.side.classList.toggle('mba-pro-hidden', !sideHasContent);
            els.side.classList.toggle('mba-pro-has-tabs', overviewShown && aboutShown);
            if (overviewShown && aboutShown) {
                setSideTab('overview');
            }

            // Footer: CTA (Display Options → Call to Action Button).
            var ctaLink = safeUrl(config.ctaButtonLink);
            if (config.showCtaButton && ctaLink) {
                els.cta.innerHTML = '<a class="mba-pro-mmodal-cta-btn" href="' + esc(ctaLink) +
                    '" target="_blank" rel="noopener noreferrer"><span>' + esc(config.ctaButtonText || 'Book Consultation') + '</span>' + ICON_ARROW + '</a>';
                els.cta.classList.remove('mba-pro-hidden');
            } else {
                els.cta.innerHTML = '';
                els.cta.classList.add('mba-pro-hidden');
            }

            // Footer: case counter "i / N" + prev/next.
            var list = filteredList();
            if (list && list.length) {
                var idx = list.findIndex(function (it) { return it.id === item.id; });
                els.counter.innerHTML = '<span class="mba-pro-mmodal-cur">' + (idx >= 0 ? (idx + 1) : 1) + '</span> / ' + list.length;
                els.footNav.classList.remove('mba-pro-hidden');
                var single = list.length < 2;
                els.caseprev.style.display = single ? 'none' : '';
                els.casenext.style.display = single ? 'none' : '';
            } else {
                els.footNav.classList.add('mba-pro-hidden');
            }

            paint();
            preloadNeighbors();
            root.classList.add('mba-pro-mmodal-open');
            if (!wasOpen) {
                lastFocus = document.activeElement;
                pushHistory();   // before lockScroll, so the browser records the real scroll offset
                lockScroll();
                els.dialog.focus();
            }
            // Each case starts at the top (the stacked mobile layout scrolls).
            els.body.scrollTop = 0;
            if (els.side) els.side.scrollTop = 0;
        }

        function close(fromPop) {
            if (!root.classList.contains('mba-pro-mmodal-open')) return;
            root.classList.remove('mba-pro-mmodal-open');
            unlockScroll();
            // Closed in-page (X / Esc / overlay): consume the history entry we
            // pushed so Back doesn't need a second press.
            if (!fromPop && pushedHistory) {
                pushedHistory = false;
                try { history.back(); } catch (err) {}
            }
            if (lastFocus && document.contains(lastFocus)) {
                try { lastFocus.focus(); } catch (err) {}
            }
            lastFocus = null;
        }

        modalApi = { open: open, close: close };
        return modalApi;
    }

    function openMasonryModal(id) {
        var item = findItem(id);
        if (!item) return;
        ensureModal().open(item);
    }

    /* ── Install overrides immediately (footer parse time, before first render) ── */
    window.createGalleryItem = buildMasonryCard;
    window.openModal = openMasonryModal;

    /* ════════════════════════════════════════════════════════════════════
       MASONRY LAYOUT ENGINE

       CSS multi-column (column-count) BALANCES the columns by height: when every
       card is the same height the balancer packs them into the leading columns
       to equalise height and leaves the trailing column(s) empty — e.g. 4 equal
       cards in 3 columns become [2][2][0], wasting the right-hand column.

       To always fill every column left-to-right (and still compact cards of
       differing heights like a real masonry), distribute the cards into flex
       column wrappers, each card going to the currently shortest column. The
       responsive column count is read from the CSS `column-count`, so the
       stylesheet's breakpoints and the admin's Grid Columns override remain the
       single source of truth.
       ════════════════════════════════════════════════════════════════════ */
    var MASONRY_GRID_SEL = '.medbeafgallery-container.mba-pro-layout-masonry .medbeafgallery-gallery-grid';

    function masonryGrids() {
        return document.querySelectorAll(MASONRY_GRID_SEL);
    }
    function colCountFor(grid) {
        var cc = parseInt(window.getComputedStyle(grid).columnCount, 10);
        if (cc > 0) return cc;
        // Fallback if column-count computes to "auto": mirror the stylesheet.
        var w = grid.clientWidth || window.innerWidth;
        return w >= 1200 ? 3 : (w >= 768 ? 2 : 1);
    }
    // Cards in their stable render order (filteredItems order) so re-laying out
    // (resize, image load, load-more) never reshuffles the sequence — once cards
    // are wrapped in columns the DOM order alone no longer reflects render order.
    function orderedCards(grid) {
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.mba-pro-mcard'));
        var list = filteredList();
        if (!list) return cards;
        var pos = {};
        for (var i = 0; i < list.length; i++) { pos[String(list[i].id)] = i; }
        cards.sort(function (a, b) {
            var pa = pos[String(a.dataset.id)]; if (pa === undefined) pa = Infinity;
            var pb = pos[String(b.dataset.id)]; if (pb === undefined) pb = Infinity;
            return pa - pb;
        });
        return cards;
    }

    function layoutGrid(grid) {
        var cards = orderedCards(grid);
        if (!cards.length) return;
        var cols = colCountFor(grid);

        // Single column: no wrappers — let the cards stack directly (the base
        // stylesheet's display:block handles a one-column stack).
        if (cols <= 1) {
            grid.classList.remove('mba-pro-masonry-js');
            var frag = document.createDocumentFragment();
            cards.forEach(function (c) { frag.appendChild(c); });
            grid.innerHTML = '';
            grid.appendChild(frag);
            bindLoad(grid);
            return;
        }

        grid.classList.add('mba-pro-masonry-js');
        grid.innerHTML = '';
        var colEls = [];
        for (var c = 0; c < cols; c++) {
            var col = document.createElement('div');
            col.className = 'mba-pro-mcol';
            grid.appendChild(col);
            colEls.push(col);
        }
        // Place each card in the shortest column. Heights are read live: before
        // images load every column measures ~0, so placement is round-robin
        // (which already fills all columns); as the images load a debounced
        // re-layout packs the now-differing heights into a true masonry.
        cards.forEach(function (card) {
            var min = 0, minH = colEls[0].offsetHeight;
            for (var i = 1; i < cols; i++) {
                var h = colEls[i].offsetHeight;
                if (h < minH) { minH = h; min = i; }
            }
            colEls[min].appendChild(card);
        });
        bindLoad(grid);
    }

    // Re-pack a grid once its images finish loading (their heights change the
    // packing). `load` doesn't bubble, so listen in the capture phase; bind once
    // per grid and coalesce a burst of loads into a single re-layout.
    function bindLoad(grid) {
        if (grid.__mbaLoadBound) return;
        grid.__mbaLoadBound = true;
        grid.addEventListener('load', function () { scheduleLayout(grid); }, true);
    }
    function scheduleLayout(grid) {
        if (grid.__mbaTimer) return;
        grid.__mbaTimer = setTimeout(function () {
            grid.__mbaTimer = null;
            layoutGrid(grid);
        }, 90);
    }
    function layoutAll() {
        var grids = masonryGrids();
        for (var i = 0; i < grids.length; i++) { layoutGrid(grids[i]); }
    }

    // Re-pack on resize (the column count can cross a breakpoint).
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layoutAll, 160);
    });

    // Re-pack after every (re)render. The free plugin's renderGalleryItems clears
    // the grid and appends raw cards (initial render, filter change, pagination,
    // load-more), so wrap it to rebuild the columns afterwards. It is a window
    // property (see file header), so internal calls pick up this wrapper too.
    if (typeof window.renderGalleryItems === 'function') {
        var _origRenderGalleryItems = window.renderGalleryItems;
        window.renderGalleryItems = function () {
            var r = _origRenderGalleryItems.apply(this, arguments);
            layoutAll();
            return r;
        };
    }

    function init() {
        // Lay out any cards already rendered before this script wrapped
        // renderGalleryItems (the wrapper covers every render after that).
        layoutAll();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
