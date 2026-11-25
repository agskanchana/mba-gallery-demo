/**
 * Pro Frontend Filters — checkbox handlers, mobile toggle, hide-case-details,
 * CTA button, hide-sidebar, plus the Pro Appearance / Comparison / Discovery /
 * Protection behaviors:
 *   - dark mode (on/auto)
 *   - custom Before/After labels + show/hide
 *   - frontend search box + sort order (via the free plugin's
 *     window.medbeafgalleryItemTransforms seam)
 *   - URL deep-linking (shareable filtered/searched views + open a case)
 *   - image protection (right-click / drag deterrence)
 *
 * Depends on the free plugin's gallery.js globals:
 *   renderGalleryItems(), openModal(), galleryConfig
 * and the `medbeafgallery:dataReady` event it dispatches once data is loaded.
 *
 * Reads settings from window.medbeafgalleryGalleryConfig.
 *
 * @package MBA_Gallery_Pro
 */

(function () {
    'use strict';

    const config = window.medbeafgalleryGalleryConfig || {};

    // Sidebar filter input names the free plugin's getSelectedValues() reads.
    const STANDARD_FILTER_NAMES = config.standardFilterNames || ['gender', 'age', 'recovery', 'duration', 'results', 'procedure'];

    // All configured filters ({ name, label, standard }). Custom filters are the
    // ones the free plugin does NOT handle natively — Pro both filters on them
    // and renders their values (with labels) in the modal.
    const PRO_FILTER_DEFS = Array.isArray(config.proFilterDefs) ? config.proFilterDefs : [];
    const CUSTOM_FILTER_DEFS = PRO_FILTER_DEFS.filter(function (d) { return d && !d.standard && d.name; });

    // "Doctor" filter group (rendered server-side when 2+ doctors have cases).
    const HAS_DOCTOR_FILTER = !!document.querySelector('input[name="mba_doctor"]');

    // Names used for deep-linking: the built-in six plus any custom filters.
    const FILTER_NAMES = STANDARD_FILTER_NAMES
        .concat(CUSTOM_FILTER_DEFS.map(function (d) { return d.name; }))
        .concat(HAS_DOCTOR_FILTER ? ['mba_doctor'] : []);

    // Live search/sort state (read by the registered transform on every render).
    let searchTerm = '';
    let sortOrder  = config.defaultSort || 'newest';

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
       ═══════════════════════════════════════════════════════════════════════ */

    function injectStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function stripTags(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // Decode HTML entities (WordPress encodes "&" in titles/terms as "&#038;").
    // A <textarea> decodes without executing markup; callers re-escape before use.
    function dec(str) {
        if (str === null || str === undefined) return '';
        const t = document.createElement('textarea');
        t.innerHTML = String(str);
        return t.value;
    }

    // Plain-text excerpt of (HTML) description, trimmed to a word near `max`.
    function snippet(html, max) {
        const t = stripTags(html).replace(/\s+/g, ' ').trim();
        return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
    }

    // All category names for an item (a case can belong to several categories).
    // Falls back to the single primary name / slug.
    function catNames(item) {
        if (Array.isArray(item.categoryNames) && item.categoryNames.length) return item.categoryNames;
        if (Array.isArray(item.category_names) && item.category_names.length) return item.category_names;
        const one = item.categoryName || item.category;
        return one ? [one] : [];
    }

    function getCheckedValues(name) {
        const values = [];
        document.querySelectorAll('input[name="' + name + '"]:checked').forEach(function (input) {
            values.push(input.value);
        });
        return values;
    }

    function debounce(fn, wait) {
        let t;
        return function () {
            const args = arguments, ctx = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    }

    function rerender() {
        if (typeof renderGalleryItems === 'function') {
            renderGalleryItems();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SEARCH + SORT  (registered into the free plugin's transform seam)
       ═══════════════════════════════════════════════════════════════════════ */

    // Bumped on every run so the applyAllFilters fallback (below) can tell
    // whether the free plugin's transform seam already applied us this pass.
    let proTransformRuns = 0;

    function proItemTransform(items) {
        proTransformRuns++;
        let out = items;

        // Custom filters — anything beyond the six the free plugin's
        // applyAllFilters() handles natively. Values come from item.proFilters
        // (injected into the gallery-data REST response by the Pro plugin).
        CUSTOM_FILTER_DEFS.forEach(function (def) {
            const selected = getCheckedValues(def.name);
            if (!selected.length) return;
            out = out.filter(function (item) {
                const v = item.proFilters ? item.proFilters[def.name] : undefined;
                return selected.indexOf(v) !== -1;
            });
        });

        // Doctor (item.doctors / item.doctor come from the free plugin's REST data).
        if (HAS_DOCTOR_FILTER) {
            const doctors = getCheckedValues('mba_doctor');
            if (doctors.length) {
                out = out.filter(function (item) {
                    const list = Array.isArray(item.doctors) && item.doctors.length
                        ? item.doctors
                        : (item.doctor ? [item.doctor] : []);
                    return list.some(function (d) { return d && doctors.indexOf(d.slug) !== -1; });
                });
            }
        }

        // Search across title, (stripped) description and every category the
        // case is in. Titles and term names arrive entity-encoded (WordPress
        // stores "&" as "&#038;"), so decode them — otherwise "Botox & Fillers"
        // never matched while "038" did.
        if (config.enableSearch && searchTerm) {
            const q = searchTerm.toLowerCase();
            out = out.filter(function (item) {
                const hay = (
                    dec(item.title || '') + ' ' +
                    stripTags(item.description || item.content || '') + ' ' +
                    catNames(item).map(dec).join(' ')
                ).toLowerCase();
                return hay.indexOf(q) !== -1;
            });
        }

        // Sort (slice() so we never mutate the source array).
        if (!config.enableSort) {
            return out;
        }
        if (sortOrder === 'oldest') {
            out = out.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
        } else if (sortOrder === 'newest') {
            out = out.slice().sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        } else if (sortOrder === 'title') {
            out = out.slice().sort(function (a, b) { return dec(a.title || '').localeCompare(dec(b.title || '')); });
        }

        return out;
    }

    function registerTransform() {
        if (!config.enableSearch && !config.enableSort && !CUSTOM_FILTER_DEFS.length && !HAS_DOCTOR_FILTER) return;
        window.medbeafgalleryItemTransforms = window.medbeafgalleryItemTransforms || [];
        window.medbeafgalleryItemTransforms.push(proItemTransform);
    }

    // Resilience against free-plugin version drift: some builds of gallery.js
    // ship WITHOUT the medbeafgalleryItemTransforms seam, so the transform above
    // is never invoked and selecting a custom filter leaves every case showing
    // (custom filters aren't among the six the free plugin filters natively).
    // Wrap applyAllFilters and, only when the seam did NOT run our transform this
    // pass, apply it to the committed result and fix pagination. The run-counter
    // check keeps this a no-op when the seam IS present (no double filtering).
    function installApplyAllFiltersFallback() {
        if (!config.enableSearch && !config.enableSort && !CUSTOM_FILTER_DEFS.length && !HAS_DOCTOR_FILTER) return;
        if (typeof window.applyAllFilters !== 'function' || window.applyAllFilters.__mbaProWrapped) return;

        const orig = window.applyAllFilters;
        const wrapped = function () {
            const before = proTransformRuns;
            const r = orig.apply(this, arguments);
            if (proTransformRuns === before &&
                typeof galleryConfig !== 'undefined' && galleryConfig &&
                Array.isArray(galleryConfig.filteredItems)) {
                try {
                    const t = proItemTransform(galleryConfig.filteredItems);
                    galleryConfig.filteredItems = t;
                    const per = galleryConfig.itemsPerPage || t.length || 1;
                    galleryConfig.totalPages = Math.ceil(t.length / per);
                } catch (e) {}
            }
            return r;
        };
        wrapped.__mbaProWrapped = true;
        window.applyAllFilters = wrapped;
    }

    function bindSearchSort() {
        const searchInput = document.getElementById('medbeafgallery-pro-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function () {
                searchTerm = searchInput.value || '';
                rerender();
                updateUrl();
            }, 250));
        }

        const sortSelect = document.getElementById('medbeafgallery-pro-sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', function () {
                sortOrder = sortSelect.value || 'newest';
                rerender();
                updateUrl();
            });
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       URL DEEP-LINKING
       ═══════════════════════════════════════════════════════════════════════ */

    function restoreFromUrl() {
        if (!config.enableDeeplink) return;
        const params = new URLSearchParams(window.location.search);

        const q = params.get('mbq');
        if (q !== null) {
            searchTerm = q;
            const si = document.getElementById('medbeafgallery-pro-search-input');
            if (si) si.value = q;
        }

        const s = params.get('mbsort');
        if (s) {
            sortOrder = s;
            const ss = document.getElementById('medbeafgallery-pro-sort-select');
            if (ss) ss.value = s;
        }

        FILTER_NAMES.forEach(function (name) {
            const raw = params.get(name);
            if (!raw) return;
            const vals = raw.split(',');
            document.querySelectorAll('input[name="' + name + '"]').forEach(function (cb) {
                if (vals.indexOf(cb.value) !== -1) cb.checked = true;
            });
        });
    }

    function updateUrl() {
        if (!config.enableDeeplink) return;

        const params = new URLSearchParams(window.location.search);
        ['mbq', 'mbsort', 'mbcat'].concat(FILTER_NAMES).forEach(function (k) { params.delete(k); });

        // The selected category (or subcategory pill). Shared links used to keep
        // the search and checkbox filters but drop the category, so a link to
        // "Teeth, female" opened on "All, female".
        const cat = currentCategorySlug();
        if (cat && cat !== String(config.defaultCategory || 'all')) params.set('mbcat', cat);

        if (searchTerm) params.set('mbq', searchTerm);
        if (config.enableSort && sortOrder && sortOrder !== (config.defaultSort || 'newest')) {
            params.set('mbsort', sortOrder);
        }
        FILTER_NAMES.forEach(function (name) {
            const vals = getCheckedValues(name);
            if (vals.length) params.set(name, vals.join(','));
        });

        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? ('?' + qs) : '') + window.location.hash;
        window.history.replaceState(null, '', newUrl);
    }

    function currentCategorySlug() {
        if (typeof galleryConfig === 'undefined' || !galleryConfig) return '';
        return galleryConfig.currentCategory ? String(galleryConfig.currentCategory) : '';
    }

    function cssEscape(value) {
        return (window.CSS && typeof window.CSS.escape === 'function')
            ? window.CSS.escape(value)
            : String(value).replace(/["\\]/g, '\\$&');
    }

    // Select a category named in ?mbcat=. A top-level category has a tile; a
    // subcategory is reached through its parent's tile and then its Pro pill.
    // Clicking (rather than setting state) keeps every listener — subcategory
    // pills, category tabs, filter tags — in step.
    function selectCategoryFromUrl(slug) {
        const tileFor = function (s) {
            return document.querySelector('.medbeafgallery-carousel-item[data-id="' + cssEscape(s) + '"]');
        };
        const tile = tileFor(slug);
        if (tile) {
            tile.click();
            return;
        }
        const tree = (typeof galleryConfig !== 'undefined' && galleryConfig && galleryConfig.categoryDescendants) || {};
        const parent = Object.keys(tree).find(function (p) {
            return Array.isArray(tree[p]) && tree[p].indexOf(slug) !== -1 && tileFor(p);
        });
        if (!parent) return;
        tileFor(parent).click();
        let tries = 0;
        (function clickPill() {
            const pill = document.querySelector('.mba-pro-subcategory-pill[data-slug="' + cssEscape(slug) + '"]');
            if (pill) {
                pill.click();
            } else if (++tries < 20) {
                setTimeout(clickPill, 50);
            }
        })();
    }

    // The free plugin's "Clear All" button and the individual filter-tag remove
    // buttons uncheck the filter inputs programmatically (no change event fires),
    // so the deep-link URL kept its stale params. Re-sync the URL after the free
    // plugin's own click handler has run. Category tiles, tabs and subcategory
    // pills change galleryConfig.currentCategory the same way, by click or key.
    function initDeeplinkClearSync() {
        if (!config.enableDeeplink) return;
        document.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            if (e.target.closest('#medbeafgallery-clear-filters') ||
                e.target.closest('.medbeafgallery-filter-tag-remove') ||
                e.target.closest('.medbeafgallery-carousel-item') ||
                e.target.closest('.mba-pro-subcategory-pill')) {
                setTimeout(updateUrl, 0);
            }
        }, true);
        document.addEventListener('keydown', function (e) {
            if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest &&
                e.target.closest('.medbeafgallery-carousel-item, .mba-pro-subcategory-pill')) {
                setTimeout(updateUrl, 0);
            }
        }, true);
    }

    /* ── Writing the case parameter ──────────────────────────────────────────
       Reading a ?mbcase= link already worked, but nothing ever produced one:
       opening a case left the URL untouched, so a visitor had no way to copy a
       link to the case they were looking at. Both layouts funnel through
       window.openModal — Pro's masonry replaces the free implementation — so
       wrapping that single function covers every entry point: gallery cards,
       the carousel, and the deep-link restore itself.

       Uses replaceState, not pushState: the masonry modal already pushes its
       own history entry so the back button closes it, and adding a second entry
       per open would make back-to-exit take two presses. */

    function writeCaseParam(id) {
        const params = new URLSearchParams(window.location.search);

        if (id === null) {
            if (!params.has('mbcase')) return;
            params.delete('mbcase');
        } else {
            if (params.get('mbcase') === String(id)) return;
            params.set('mbcase', id);
        }

        const qs = params.toString();
        window.history.replaceState(
            null, '',
            window.location.pathname + (qs ? ('?' + qs) : '') + window.location.hash
        );
    }

    function isAnyCaseModalOpen() {
        const free = document.querySelector('.medbeafgallery-modal');
        if (free && free.classList.contains('active')) return true;
        const pro = document.querySelector('.mba-pro-mmodal');
        if (pro && pro.classList.contains('mba-pro-mmodal-open')) return true;
        // Case Window styles (includes/pro-viewer.php).
        const viewer = document.querySelector('.mba-pro-viewer');
        if (viewer && viewer.classList.contains('mba-pro-viewer-open')) return true;
        return false;
    }

    // Each modal has its own close paths (button, Escape, backdrop, popstate),
    // so watch the open-state class rather than trying to hook all of them.
    function watchModalClose(el) {
        if (!el || el.getAttribute('data-mba-case-param-watched')) return;
        el.setAttribute('data-mba-case-param-watched', '1');
        new MutationObserver(function () {
            if (!isAnyCaseModalOpen()) writeCaseParam(null);
        }).observe(el, { attributes: true, attributeFilter: ['class'] });
    }

    let caseParamWriterInstalled = false;

    function initCaseParamWriter() {
        if (!config.enableDeeplink || caseParamWriterInstalled) return;
        if (typeof window.openModal !== 'function') return;
        caseParamWriterInstalled = true;

        const inner = window.openModal;
        window.openModal = function (id) {
            const result = inner.apply(this, arguments);
            // Let the implementation finish opening before reading its state —
            // the masonry modal builds its root lazily on first open.
            setTimeout(function () {
                if (!isAnyCaseModalOpen()) return;
                writeCaseParam(id);
                watchModalClose(document.querySelector('.medbeafgallery-modal'));
                watchModalClose(document.querySelector('.mba-pro-mmodal'));
                watchModalClose(document.querySelector('.mba-pro-viewer'));
            }, 0);
            return result;
        };

        // Back/Forward onto an entry that still names a case while no modal is
        // open (e.g. Forward after closing): clear it rather than leave a URL
        // that reopens a case the visitor is not looking at. Deferred so the
        // masonry modal's own popstate handler has closed it first.
        window.addEventListener('popstate', function () {
            setTimeout(function () {
                if (!isAnyCaseModalOpen()) writeCaseParam(null);
            }, 0);
        });
    }

    // Once data is loaded, re-apply state and optionally open a deep-linked case.
    function onDataReady() {
        if (!config.enableDeeplink) return;
        // Installed here rather than at init: Pro's masonry swaps window.openModal
        // during its own setup, and dataReady is guaranteed to run after that.
        initCaseParamWriter();
        const linkedCategory = new URLSearchParams(window.location.search).get('mbcat');
        if (linkedCategory) selectCategoryFromUrl(linkedCategory);
        rerender(); // ensures restored filters/search/sort are applied
        const caseId = new URLSearchParams(window.location.search).get('mbcase');
        if (caseId && typeof openModal === 'function') {
            const openLinkedCase = function () {
                // Strip it from the landing entry first; the writer puts it back
                // on the entry the modal opens with. Otherwise closing the
                // masonry modal (which steps Back to that landing entry) left
                // ?mbcase= in the address bar, and a reload popped the case open
                // again. A link to a case that no longer exists is cleaned up the
                // same way.
                writeCaseParam(null);
                openModal(parseInt(caseId, 10));
            };

            // A shared link usually lands a first-time visitor, so the
            // Sensitive Content Notice is still up. Opening now put the case's
            // photo in a modal ABOVE the notice, skipping the gate entirely.
            if (document.getElementById('medbeafgallery-consent-overlay')) {
                document.addEventListener('medbeafgallery:consentGiven', openLinkedCase, { once: true });
            } else {
                openLinkedCase();
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FILTER CHECKBOX CHANGE HANDLERS (free plugin reads the checkboxes)
       ═══════════════════════════════════════════════════════════════════════ */

    function initFilterCheckboxes() {
        const sidebar = document.getElementById('medbeafgallery-filter-sidebar');
        if (!sidebar) return;

        sidebar.addEventListener('change', function (e) {
            if (e.target.matches('input[type="checkbox"]')) {
                rerender(); // renderGalleryItems() calls applyAllFilters() internally
                updateUrl();
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MOBILE TOGGLE
       ═══════════════════════════════════════════════════════════════════════ */

    function initMobileToggle() {
        const toggle = document.getElementById('medbeafgallery-filter-toggle');
        const groups = document.getElementById('medbeafgallery-filter-groups');
        if (!toggle || !groups) return;

        if (window.innerWidth <= 991) {
            groups.classList.add('collapsed');
        }

        toggle.addEventListener('click', function () {
            groups.classList.toggle('collapsed');
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       HIDE CASE DETAILS
       ═══════════════════════════════════════════════════════════════════════ */

    function initHideCaseDetails() {
        if (!config.hideCaseDetails) return;
        // Inject a stylesheet rule instead of setting an inline style on the
        // element found at init: the modal is relocated into a body-level portal
        // when it opens, and the Pro modal CSS can re-show the panel. An
        // !important rule (matching the other hide-* options) reliably hides it
        // in the Classic layout. (The Masonry layout uses its own modal, which
        // honours hideCaseDetails directly.)
        injectStyle('.medbeafgallery-case-details { display: none !important; }');
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CLASSIC MODAL — MASONRY-STYLE DETAIL PANEL

       Replace the free plugin's tabbed Description / Details panel with the same
       single-view design the Masonry modal uses: a "Treatment Overview" tile
       grid (built-in attributes, gated by the enabled filters, plus custom
       filters) followed by an "About This Case" section. The original tabs and
       tab panels are hidden via CSS (`.mba-pro-cmodal`); the social-share footer
       is kept. (The Masonry layout has its own modal, so this is skipped there.)
       ═══════════════════════════════════════════════════════════════════════ */

    function findGalleryItem(id) {
        if (typeof galleryData !== 'undefined' && Array.isArray(galleryData)) {
            return galleryData.find(function (it) { return it.id === id; }) || null;
        }
        return null;
    }

    // SVG icon set matching the Masonry modal's Treatment Overview tiles.
    var SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    var TILE_ICON = {
        clock:  SVG_OPEN + '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        pulse:  SVG_OPEN + '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
        star:   SVG_OPEN + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        layers: SVG_OPEN + '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
        shield: SVG_OPEN + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
        user:   SVG_OPEN + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
    };
    var TILE_ICON_FOR = {
        'Duration': 'clock', 'Image Pairs': 'layers', 'Recovery': 'pulse',
        'Results': 'star', 'Procedure': 'shield', 'Age': 'user', 'Gender': 'user'
    };

    var ENABLED_DETAILS = Array.isArray(config.enabledDetails) ? config.enabledDetails : null;
    function detailEnabled(key) {
        return !ENABLED_DETAILS || ENABLED_DETAILS.indexOf(key) !== -1;
    }
    function cap(s) {
        s = (s === null || s === undefined) ? '' : String(s);
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }
    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = (s === null || s === undefined) ? '' : String(s);
        return d.innerHTML;
    }
    function pairCount(item) {
        let n = 0;
        if (item.beforeImg || item.afterImg) n++;
        if (item.imagePairs && item.imagePairs.length) n += item.imagePairs.length;
        return n || 1;
    }

    // Returns { tiles, hasFilters }. "Image Pairs" is informational and always
    // present, but it is NOT a case filter; hasFilters tracks whether the case
    // carries at least one real filter attribute so the Treatment Overview can be
    // hidden entirely when none apply.
    function buildOverviewTiles(item) {
        const tiles = [];
        let hasFilters = false;
        if (item.duration && detailEnabled('duration')) { tiles.push(['Duration', cap(item.duration)]); hasFilters = true; }
        tiles.push(['Image Pairs', String(pairCount(item))]);
        if (item.recovery && detailEnabled('recovery')) { tiles.push(['Recovery', cap(item.recovery)]); hasFilters = true; }
        if (item.results && detailEnabled('results')) { tiles.push(['Results', cap(item.results)]); hasFilters = true; }
        if ((item.procedureType || item.procedure) && detailEnabled('procedure')) { tiles.push(['Procedure', cap(item.procedureType || item.procedure)]); hasFilters = true; }
        if (item.age && detailEnabled('age')) { tiles.push(['Age', String(item.age)]); hasFilters = true; }
        if (item.gender && detailEnabled('gender')) { tiles.push(['Gender', cap(item.gender)]); hasFilters = true; }
        CUSTOM_FILTER_DEFS.forEach(function (def) {
            const v = item.proFilters ? item.proFilters[def.name] : '';
            if (v) { tiles.push([def.label, cap(v)]); hasFilters = true; }
        });
        return { tiles: tiles.slice(0, 8), hasFilters: hasFilters };
    }

    // Compact meta pills for a Classic gallery card — mirrors the Masonry card's
    // "treatment overview" pills (duration/recovery/results/angles + custom),
    // gated by the enabled filters.
    function cardPill(icon, text) {
        return '<span class="mba-pro-ccard-pill">' + icon + '<span>' + escHtml(text) + '</span></span>';
    }
    function cardPillLabeled(label, text) {
        return '<span class="mba-pro-ccard-pill mba-pro-ccard-pill-custom">' +
               '<span class="mba-pro-ccard-pill-l">' + escHtml(label) + ':</span> ' +
               '<span>' + escHtml(text) + '</span></span>';
    }
    function buildCardPills(item) {
        let pills = '';
        if (item.duration && detailEnabled('duration')) pills += cardPill(TILE_ICON.clock, cap(item.duration));
        if (item.recovery && detailEnabled('recovery')) pills += cardPill(TILE_ICON.pulse, cap(item.recovery));
        if (item.results && detailEnabled('results')) pills += cardPill(TILE_ICON.star, cap(item.results));
        const angles = pairCount(item);
        if (angles > 1) pills += cardPill(TILE_ICON.layers, angles + ' angles').replace('mba-pro-ccard-pill"', 'mba-pro-ccard-pill mba-pro-ccard-pill-angles"');
        CUSTOM_FILTER_DEFS.forEach(function (def) {
            const v = item.proFilters ? item.proFilters[def.name] : '';
            if (v) pills += cardPillLabeled(def.label, cap(v));
        });
        return pills;
    }

    function renderClassicSide(item) {
        const side = document.querySelector('.mba-pro-cmodal-side');
        if (!side) return;

        const cats = catNames(item).join(', ');
        const eyebrow = cats ? '<div class="mba-pro-cmodal-eyebrow">' + escHtml(dec(cats)) + '</div>' : '';

        // No case filters applied → no Treatment Overview at all (parity with the
        // Masonry modal). "Image Pairs" alone never counts as a filter.
        const built = buildOverviewTiles(item);
        const overview = built.hasFilters
            ? '<div class="mba-pro-cmodal-section mba-pro-cmodal-overview mba-pro-tab-active"><div class="mba-pro-cmodal-h">Treatment Overview</div>' +
              '<div class="mba-pro-cmodal-tiles">' + built.tiles.map(function (t) {
                  const ic = TILE_ICON[TILE_ICON_FOR[t[0]] || 'layers'] || TILE_ICON.layers;
                  return '<div class="mba-pro-cmodal-tile"><span class="mba-pro-cmodal-tile-ic">' + ic + '</span>' +
                         '<span class="mba-pro-cmodal-tile-v">' + escHtml(t[1]) + '</span>' +
                         '<span class="mba-pro-cmodal-tile-l">' + escHtml(t[0]) + '</span></div>';
              }).join('') + '</div></div>'
            : '';

        const about = item.description || item.content || '';
        const aboutSection = stripTags(about)
            ? '<div class="mba-pro-cmodal-section mba-pro-cmodal-aboutsec"><div class="mba-pro-cmodal-h">About This Case</div>' +
              '<div class="mba-pro-cmodal-about">' + about + '</div></div>'
            : '';

        // When BOTH sections are present they become tabs on the stacked mobile
        // layout (no room for both); a single section needs no tabbing. The tab
        // bar is hidden on desktop via CSS regardless.
        const bothShown = !!overview && !!aboutSection;
        const tabBar = bothShown
            ? '<div class="mba-pro-cmodal-tabs" role="tablist">' +
              '<button type="button" class="mba-pro-cmodal-tab is-active" data-tab="overview" role="tab" aria-selected="true">Treatment Overview</button>' +
              '<button type="button" class="mba-pro-cmodal-tab" data-tab="about" role="tab" aria-selected="false">About This Case</button>' +
              '</div>'
            : '';

        side.classList.toggle('mba-pro-has-tabs', bothShown);
        side.innerHTML = eyebrow + doctorCardHtml(item.doctor) + tabBar + overview + aboutSection;
    }

    // Doctor who treated the case (free 1.5.0+ REST field `doctor`), shown above
    // the tabs. Escaped here: the values are plain text from term meta.
    function doctorCardHtml(d) {
        if (!d || !d.name) return '';
        const initial = String(d.name).replace(/^dr\.?\s+/i, '').charAt(0).toUpperCase();
        const photo = d.photo
            ? '<img class="mba-pro-doctor-photo" src="' + escHtml(d.photo).replace(/"/g, '&quot;') + '" alt="" loading="lazy">'
            : '<span class="mba-pro-doctor-photo mba-pro-doctor-initials" aria-hidden="true">' + escHtml(initial) + '</span>';
        const url = /^https?:\/\//i.test(String(d.url || '')) ? String(d.url) : '';
        const name = url
            ? '<a class="mba-pro-doctor-name" href="' + escHtml(url).replace(/"/g, '&quot;') + '">' + escHtml(d.name) + '</a>'
            : '<span class="mba-pro-doctor-name">' + escHtml(d.name) + '</span>';
        return '<div class="mba-pro-doctor mba-pro-cmodal-doctor">' + photo +
            '<div class="mba-pro-doctor-text">' +
                '<span class="mba-pro-doctor-label">' + escHtml(config.treatedByText || 'Treated by') + '</span>' + name +
                (d.credentials ? '<span class="mba-pro-doctor-cred">' + escHtml(d.credentials) + '</span>' : '') +
                (d.location ? '<span class="mba-pro-doctor-loc">' + escHtml(d.location) + '</span>' : '') +
            '</div></div>';
    }

    // Tab switching for the Classic modal side panel (delegated, since the panel
    // is re-rendered on every open). Only meaningful on mobile, where the tab bar
    // is visible; on desktop both panels show and these clicks never fire.
    function bindClassicSideTabs(side) {
        side.addEventListener('click', function (e) {
            const btn = e.target.closest('.mba-pro-cmodal-tab');
            if (!btn || !side.contains(btn)) return;
            const name = btn.getAttribute('data-tab');
            side.querySelectorAll('.mba-pro-cmodal-tab').forEach(function (b) {
                const on = b.getAttribute('data-tab') === name;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', String(on));
            });
            const ov = side.querySelector('.mba-pro-cmodal-overview');
            const ab = side.querySelector('.mba-pro-cmodal-aboutsec');
            if (ov) ov.classList.toggle('mba-pro-tab-active', name === 'overview');
            if (ab) ab.classList.toggle('mba-pro-tab-active', name === 'about');

            // Bring the freshly-revealed panel into view. The tab bar only shows
            // on the stacked mobile layout, where the whole modal body scrolls;
            // nudge the bar to the top so the chosen panel sits in view below it.
            const tabBar = side.querySelector('.mba-pro-cmodal-tabs');
            if (tabBar && tabBar.scrollIntoView) {
                tabBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    function initClassicModalRedesign() {
        if (config.galleryLayout === 'masonry') return; // Masonry has its own modal.
        if (typeof window.openModal !== 'function') return;

        const details = document.querySelector('.medbeafgallery-case-details');
        if (details) {
            details.classList.add('mba-pro-cmodal');
            if (!details.querySelector('.mba-pro-cmodal-side')) {
                const side = document.createElement('div');
                side.className = 'mba-pro-cmodal-side';
                details.insertBefore(side, details.firstChild);
                bindClassicSideTabs(side);
            }
        }

        const orig = window.openModal;
        if (orig.__mbaRedesign) return;
        const wrapped = function (id) {
            currentModalId = id; // for annotation lookup (see mountClassicAnnotations)
            const result = orig.apply(this, arguments);
            try {
                const item = findGalleryItem(id);
                if (item) renderClassicSide(item);
            } catch (e) {}
            return result;
        };
        wrapped.__mbaRedesign = true;
        window.openModal = wrapped;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CLASSIC MODAL — ANNOTATION HOTSPOTS
       Mount markers on the standalone before/after images for the active pair
       and current view. Skipped in the Cocoen split/slider view (it clips the
       image). Re-runs whenever the view or image pair changes (via setViewMode).
       ═══════════════════════════════════════════════════════════════════════ */

    let currentModalId = null;

    function mountClassicAnnotations(mode) {
        if (!window.mbaProAnno) return;
        const container = document.querySelector('.medbeafgallery-comparison-container');
        if (container) window.mbaProAnno.clearAll(container);
        if (mode === 'split' || currentModalId == null) return;

        const item = findGalleryItem(currentModalId);
        if (!item || !item.annotations) return;

        const wrapper = document.querySelector('.medbeafgallery-before-after-wrapper.active');
        if (!wrapper) return;
        const pairIndex = (parseInt(wrapper.getAttribute('data-pair-id'), 10) || 1) - 1;
        const anno = item.annotations[pairIndex];
        if (!anno) return;

        const before = wrapper.querySelector('.medbeafgallery-standalone-before');
        const after  = wrapper.querySelector('.medbeafgallery-standalone-after');
        if (mode === 'both' || mode === 'before') {
            if (before) window.mbaProAnno.mount(before, anno.before || []);
        }
        if (mode === 'both' || mode === 'after') {
            if (after) window.mbaProAnno.mount(after, anno.after || []);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MULTI-CATEGORY GALLERY CARDS (Classic layout)

       A case can belong to several categories but the free plugin's card shows
       only the primary one. Wrap its card renderer and replace the single
       category label with one pill per category. (The Masonry layout builds its
       own cards and handles this directly.)
       ═══════════════════════════════════════════════════════════════════════ */

    function initMultiCategoryCards() {
        if (config.galleryLayout === 'masonry') return;
        if (typeof window.createGalleryItem !== 'function') return;

        const orig = window.createGalleryItem;
        if (orig.__mbaMultiCat) return;

        const wrapped = function (item) {
            const el = orig.apply(this, arguments);
            try {
                const names = catNames(item);
                if (el && names.length > 1) {
                    const span = el.querySelector('.medbeafgallery-gallery-category');
                    if (span) {
                        const wrap = document.createElement('span');
                        wrap.className = 'medbeafgallery-gallery-categories';
                        names.forEach(function (n) {
                            const s = document.createElement('span');
                            s.className = 'medbeafgallery-gallery-category';
                            s.textContent = dec(n);
                            wrap.appendChild(s);
                        });
                        span.replaceWith(wrap);
                    }
                }
                // Richer card body (parity with the Masonry cards): a description
                // excerpt under the title, then the treatment-overview meta pills.
                const info = el && el.querySelector('.medbeafgallery-gallery-item-info');
                if (info) {
                    const titleEl = info.querySelector('h3');
                    const excerpt = snippet(item.description || item.content || '', 120);
                    if (excerpt && titleEl && !info.querySelector('.mba-pro-ccard-desc')) {
                        const p = document.createElement('p');
                        p.className = 'mba-pro-ccard-desc';
                        p.textContent = excerpt;
                        titleEl.insertAdjacentElement('afterend', p);
                    }
                    const pills = buildCardPills(item);
                    if (pills && !info.querySelector('.mba-pro-ccard-meta')) {
                        const meta = document.createElement('div');
                        meta.className = 'mba-pro-ccard-meta';
                        meta.innerHTML = pills;
                        info.appendChild(meta);
                    }
                }
            } catch (e) {}
            return el;
        };
        wrapped.__mbaMultiCat = true;
        window.createGalleryItem = wrapped;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CLASSIC MODAL — "BOTH" VIEW (before + after side by side)

       The free plugin's setViewMode() understands split/before/after only. We
       wrap the global so a new 'both' mode lays the two standalone images side
       by side. The free plugin already calls setViewMode(defaultViewMode) on
       open and on every pair render, so wrapping is enough — no extra button is
       added (this is a default-open mode only). Masonry has its own modal.
       ═══════════════════════════════════════════════════════════════════════ */

    function applyClassicBothView() {
        const wrapper = document.querySelector('.medbeafgallery-before-after-wrapper.active');
        if (!wrapper) return;
        const container = document.querySelector('.medbeafgallery-comparison-container');

        wrapper.classList.remove('view-split', 'view-before', 'view-after');
        wrapper.classList.add('mba-pro-view-both');
        if (container) {
            container.classList.remove('view-split', 'view-before', 'view-after');
            container.classList.add('mba-pro-view-both');
        }

        // Hide the slider, show both standalone images (laid out by the CSS).
        const cocoen = wrapper.querySelector('cocoen-component') || wrapper.querySelector('.cocoen');
        if (cocoen) cocoen.style.display = 'none';
        const before = wrapper.querySelector('.medbeafgallery-standalone-before');
        const after  = wrapper.querySelector('.medbeafgallery-standalone-after');
        if (before) before.style.display = 'block';
        if (after)  after.style.display = 'block';

        // No "both" button exists, so clear the three view-control buttons.
        ['.medbeafgallery-split-view', '.medbeafgallery-before-view', '.medbeafgallery-after-view']
            .forEach(function (sel) {
                const btn = document.querySelector(sel);
                if (btn) btn.classList.remove('active');
            });
    }

    function clearClassicBothView() {
        document.querySelectorAll('.mba-pro-view-both').forEach(function (el) {
            el.classList.remove('mba-pro-view-both');
        });
    }

    function initClassicBothView() {
        if (config.galleryLayout === 'masonry') return; // Masonry has its own modal.
        if (typeof window.setViewMode !== 'function') return;

        // When "Both" is the default, side-by-side is the whole point — the
        // split/before/after switch buttons are redundant, so hide them.
        if (config.defaultViewMode === 'both') {
            injectStyle('.medbeafgallery-modal-header .medbeafgallery-image-controls { display: none !important; }');
        }

        if (window.setViewMode.__mbaBoth) return;

        const orig = window.setViewMode;
        const wrapped = function (mode) {
            let r;
            if (mode === 'both') {
                applyClassicBothView();
            } else {
                clearClassicBothView();
                r = orig.apply(this, arguments);
            }
            try { mountClassicAnnotations(mode); } catch (e) {}
            return r;
        };
        wrapped.__mbaBoth = true;
        window.setViewMode = wrapped;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CTA BUTTON
       ═══════════════════════════════════════════════════════════════════════ */

    function initCtaButton() {
        if (!config.showCtaButton || !config.ctaButtonLink) return;

        const navContainer = document.querySelector('.medbeafgallery-modal-nav-container');
        if (!navContainer) return;

        const ctaBtn = document.createElement('a');
        ctaBtn.href = config.ctaButtonLink;
        ctaBtn.target = '_blank';
        ctaBtn.rel = 'noopener noreferrer';
        ctaBtn.className = 'medbeafgallery-cta-button';
        ctaBtn.textContent = config.ctaButtonText || 'Book Consultation';

        navContainer.appendChild(ctaBtn);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MODAL MAX HEIGHT (Pro override)
       ═══════════════════════════════════════════════════════════════════════ */

    function initModalHeight() {
        const height = parseInt(config.modalMaxHeight, 10);
        if (!height || height < 20 || height > 100) return;
        // The admin-set height applies on desktop only. On screens narrower than
        // 992px the modal always fills the viewport (100vh).
        injectStyle(
            '@media (min-width: 992px) { .medbeafgallery-modal-content { max-height: ' + height + 'vh !important; } }' +
            '@media (max-width: 991.98px) { .medbeafgallery-modal-content { max-height: 100vh !important; } }'
        );
    }

    /* ═══════════════════════════════════════════════════════════════════════
       HIDE CASE TITLE / CATEGORY (gallery cards)
       ═══════════════════════════════════════════════════════════════════════ */

    function initHideCaseTitle() {
        if (!config.hideCaseTitle) return;
        injectStyle('.medbeafgallery-gallery-item-info h3 { display: none !important; }');
    }

    function initHideCaseCategory() {
        if (!config.hideCaseCategory) return;
        injectStyle('.medbeafgallery-gallery-category { display: none !important; }');
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CUSTOM BEFORE / AFTER LABELS
       ═══════════════════════════════════════════════════════════════════════ */

    // wp_localize_script() turns every top-level scalar into a string, so a PHP
    // false arrives as "" — `config.showLabels === false` was never true and
    // "Show labels" could not be switched off. Treat only an explicit off as
    // off, so an absent value keeps the labels.
    function isOff(v) {
        return v === false || v === '' || v === '0' || v === 0;
    }

    function initLabels() {
        const before = document.querySelector('.medbeafgallery-before-label');
        const after  = document.querySelector('.medbeafgallery-after-label');
        if (before && config.beforeLabel) before.textContent = config.beforeLabel;
        if (after && config.afterLabel) after.textContent = config.afterLabel;
        if (isOff(config.showLabels)) {
            injectStyle('.medbeafgallery-before-label, .medbeafgallery-after-label { display: none !important; }');
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       DARK MODE (class on <html>, since the modal lives in a body-level portal)
       ═══════════════════════════════════════════════════════════════════════ */

    function initDarkMode() {
        const mode = config.darkMode || 'off';
        if (mode === 'on') {
            document.documentElement.classList.add('mba-pro-dark');
        } else if (mode === 'auto' && window.matchMedia) {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const apply = function (e) {
                document.documentElement.classList.toggle('mba-pro-dark', e.matches);
            };
            apply(mq);
            if (mq.addEventListener) {
                mq.addEventListener('change', apply);
            } else if (mq.addListener) {
                mq.addListener(apply); // Safari < 14
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CATEGORY DISPLAY STYLE — flatten the image-card carousel into a row of
       text tabs. Purely visual: the free plugin's category click/filter
       handlers stay bound to the same .medbeafgallery-carousel-item elements.
       ═══════════════════════════════════════════════════════════════════════ */

    var TAB_CHEVRON_LEFT  = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    var TAB_CHEVRON_RIGHT = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    function initCategoryDisplay() {
        if (config.categoryDisplayStyle !== 'tabs') return;
        document.querySelectorAll('.medbeafgallery-category-carousel').forEach(setupCategoryTabs);
    }

    function setupCategoryTabs(root) {
        root.classList.add('mba-pro-cat-tabs');

        var items   = root.querySelector('.medbeafgallery-carousel-items');
        var wrapper = root.querySelector('.medbeafgallery-carousel-wrapper');
        if (!items || !wrapper) return;

        // Build the prev/next scroll controls (hidden until the strip overflows).
        var prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'mba-pro-tab-scroll mba-pro-tab-scroll-prev';
        prev.setAttribute('aria-label', 'Scroll categories left');
        prev.innerHTML = TAB_CHEVRON_LEFT;

        var next = document.createElement('button');
        next.type = 'button';
        next.className = 'mba-pro-tab-scroll mba-pro-tab-scroll-next';
        next.setAttribute('aria-label', 'Scroll categories right');
        next.innerHTML = TAB_CHEVRON_RIGHT;

        wrapper.appendChild(prev);
        wrapper.appendChild(next);

        // Reflect overflow + scroll position as classes the CSS uses to show/hide
        // the arrows and the fading edges.
        function update() {
            var max = items.scrollWidth - items.clientWidth;
            root.classList.toggle('mba-pro-tabs-overflow', max > 2);
            root.classList.toggle('mba-pro-tabs-at-start', items.scrollLeft <= 2);
            root.classList.toggle('mba-pro-tabs-at-end', items.scrollLeft >= max - 2);
        }

        function step(dir) {
            items.scrollBy({ left: dir * Math.max(120, items.clientWidth * 0.7), behavior: 'smooth' });
        }

        prev.addEventListener('click', function () { step(-1); });
        next.addEventListener('click', function () { step(1); });

        items.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', debounce(update, 150));

        // Keep the tapped tab fully in view when it sits near a clipped edge.
        items.addEventListener('click', function (e) {
            var item = e.target.closest('.medbeafgallery-carousel-item');
            if (item) ensureTabVisible(items, item, false);
        });

        // After layout settles: center the active tab (if scrolling) and sync arrows.
        requestAnimationFrame(function () {
            var active = items.querySelector('.medbeafgallery-carousel-item.active');
            if (active) ensureTabVisible(items, active, true);
            update();
        });
    }

    function ensureTabVisible(scroller, item, center) {
        var sRect = scroller.getBoundingClientRect();
        var iRect = item.getBoundingClientRect();
        if (center) {
            scroller.scrollLeft += (iRect.left - sRect.left) - (sRect.width - iRect.width) / 2;
        } else if (iRect.left < sRect.left) {
            scroller.scrollBy({ left: iRect.left - sRect.left - 12, behavior: 'smooth' });
        } else if (iRect.right > sRect.right) {
            scroller.scrollBy({ left: iRect.right - sRect.right + 12, behavior: 'smooth' });
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CATEGORY CAROUSEL (image-card mode) POLISH

       Two touch-ups to the free plugin's category carousel:
         1. Replace the text arrows (← →) on the prev/next buttons with crisp
            SVG chevrons (same icons the tab strip uses).
         2. When every category already fits — the carousel can't scroll — hide
            the now-pointless arrows and center the cards. The CSS keys off the
            `mba-pro-cat-fits` class toggled here.
       ═══════════════════════════════════════════════════════════════════════ */

    function initCategoryCarousel() {
        if (config.categoryDisplayStyle === 'tabs') return; // tabs has its own arrows
        document.querySelectorAll('.medbeafgallery-category-carousel.medbeafgallery-carousel-mode')
            .forEach(setupCategoryCarousel);
    }

    function setupCategoryCarousel(root) {
        var wrapper = root.querySelector('.medbeafgallery-carousel-wrapper');
        var items   = root.querySelector('.medbeafgallery-carousel-items');
        if (!wrapper || !items) return;

        // Swap the free plugin's text arrows for SVG chevrons. The free JS bound
        // its click handlers to the buttons themselves, so replacing their inner
        // markup leaves the scroll behavior intact.
        var prevBtn = root.querySelector('.medbeafgallery-prev-btn');
        var nextBtn = root.querySelector('.medbeafgallery-next-btn');
        if (prevBtn) prevBtn.innerHTML = TAB_CHEVRON_LEFT;
        if (nextBtn) nextBtn.innerHTML = TAB_CHEVRON_RIGHT;

        // No horizontal overflow ⇒ nothing to scroll ⇒ drop the arrows + center.
        function updateFit() {
            var overflow = wrapper.scrollWidth - wrapper.clientWidth;
            root.classList.toggle('mba-pro-cat-fits', overflow <= 2);
        }

        updateFit();
        requestAnimationFrame(updateFit);
        window.addEventListener('resize', debounce(updateFit, 150));
        document.addEventListener('medbeafgallery:dataReady', updateFit);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       IMAGE PROTECTION (deterrence only — not security)
       ═══════════════════════════════════════════════════════════════════════ */

    function initImageProtection() {
        if (!config.imageProtection) return;

        // The masonry modal is its own body-level portal (.mba-pro-mmodal) and
        // shows the largest images, so it must be covered too — as must the
        // [mba_case] / carousel embeds when they share a page with the gallery.
        const SCOPE = '.medbeafgallery-container, .medbeafgallery-modal, .mba-pro-mmodal, .mba-pro-scase, .mba-pro-sstory, .mba-pro-discovery, .mba-carousel-wrapper';
        const inScope = function (target) {
            return target && target.closest && target.closest(SCOPE);
        };
        const prevent = function (e) {
            if (inScope(e.target)) e.preventDefault();
        };

        document.addEventListener('contextmenu', prevent);
        document.addEventListener('dragstart', prevent);
        // user-select:none is harmless to the Cocoen slider (its drag is mouse-based,
        // not native image dragging, which is already blocked above).
        injectStyle(SCOPE + ' { -webkit-user-select: none; user-select: none; }');
    }

    /* ═══════════════════════════════════════════════════════════════════════
       INIT
       ═══════════════════════════════════════════════════════════════════════ */

    function init() {
        // Search/sort: register the transform + restore URL state BEFORE the
        // gallery's first render so the initial paint already reflects the state.
        registerTransform();
        installApplyAllFiltersFallback();
        restoreFromUrl();
        bindSearchSort();
        initDeeplinkClearSync();

        initFilterCheckboxes();
        initMobileToggle();
        initHideCaseDetails();
        initMultiCategoryCards();
        initClassicModalRedesign();
        initClassicBothView();
        initCtaButton();
        initModalHeight();
        initHideCaseTitle();
        initHideCaseCategory();
        initLabels();
        initDarkMode();
        initCategoryDisplay();
        initCategoryCarousel();
        initImageProtection();
        initLegacyShareButtons();

        document.addEventListener('medbeafgallery:dataReady', onDataReady);
    }

    /**
     * Free 1.3.2–1.3.9 print onclick="shareOnSocial(...)" on the case window's
     * share buttons AND bind a click listener to the first button of each kind
     * (document.querySelector), so every share opened two windows. Free 1.4.0
     * replaced both with one delegated listener (medbeafgalleryBindShareButtons);
     * with an older free plugin, drop the inline handler from exactly the buttons
     * its listener is bound to, so each click shares once.
     */
    function initLegacyShareButtons() {
        if (typeof window.medbeafgalleryBindShareButtons === 'function') return;

        ['facebook', 'twitter', 'email'].forEach(function (network) {
            const btn = document.querySelector('.medbeafgallery-share-' + network);
            if (btn && btn.hasAttribute('onclick')) btn.removeAttribute('onclick');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
