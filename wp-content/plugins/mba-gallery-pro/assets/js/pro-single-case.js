/**
 * MBA Gallery Pro — Single Case embed ([mba_case]) viewer.
 *
 * Self-contained, one instance per `.mba-pro-scase` block (several embeds on a
 * page never share state or listeners; nothing is bound to document/window).
 *
 *   • Comparison modes: Slider (default) / Before / After / Side by side
 *     (segmented buttons, aria-pressed). In Before/After a click on the photo
 *     flips to the other one.
 *   • Slider: drag anywhere on the photo (mouse, pen, touch — vertical page
 *     scroll still works on touch), or focus the handle (role="slider") and
 *     use the arrow keys (Shift = bigger steps), PageUp/PageDown, Home/End.
 *   • Pair switcher for multi-pair cases (thumbnails + prev/next; a counter in
 *     compact/narrow layouts). The next pair is preloaded before swapping so
 *     before and after always change together.
 *   • Progress stages (cases with a progress timeline): a timeline under the
 *     photo — one stop per photo on a line — printed by PHP with its data in
 *     data-stages. Choosing a stop shows that photo, whole, over the comparison
 *     and fills the line up to it; choosing it again, the "Before / After"
 *     button (shown while a stage is on show), a comparison view or another
 *     pair goes back. Left/Right Arrow, Home and End move along the stops; a
 *     swipe on the photo changes stage. Same look and behaviour as the case
 *     windows' timeline (pro-viewer.css, pro-stages.js).
 *   • The stage's aspect ratio comes from the server (no layout shift) and is
 *     corrected from the loaded photo when missing or wrong.
 *   • "Read more" collapse for long descriptions, re-measured when the
 *     embed's width changes.
 *
 * Public (additive): window.mbaProSingleCase.init([root]) — initialise embeds
 * inserted after page load (page builders, AJAX content). Safe to call twice.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var I18N = window.mbaProSingleCaseI18n || {};

    function t(key, fallback) {
        return (I18N && typeof I18N[key] === 'string' && I18N[key]) ? I18N[key] : fallback;
    }

    function fmt(str, a, b) {
        return String(str).replace('%1$s', a).replace('%2$s', b).replace(/%%/g, '%');
    }

    function readList(root, attribute) {
        try {
            var list = JSON.parse(root.getAttribute(attribute) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function preload(src) {
        return new Promise(function (resolve) {
            if (!src) { resolve(null); return; }
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = src;
            if (img.decode) {
                img.decode().then(function () { resolve(img); }, function () { /* onload/onerror resolve */ });
            }
        });
    }

    function isRtl(el) {
        try {
            return window.getComputedStyle(el).direction === 'rtl';
        } catch (e) {
            return false;
        }
    }

    function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // "2025-06-10" in the page's language, written as the case windows write it.
    // The server's own text (the site's date format) stays when that fails.
    function formatDate(iso, fallback) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!match || typeof Intl === 'undefined') { return fallback || ''; }
        var date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
        var format = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
        var locales = [document.documentElement.lang, I18N.locale];
        for (var i = 0; i < locales.length; i++) {
            if (!locales[i]) { continue; }
            try { return new Intl.DateTimeFormat(locales[i], format).format(date); } catch (e) { /* next one */ }
        }
        try { return new Intl.DateTimeFormat(undefined, format).format(date); } catch (e) { return fallback || iso; }
    }

    function node(tag, className) {
        var el = document.createElement(tag);
        el.className = className;
        return el;
    }

    /* ── One embed ────────────────────────────────────────────────────────── */
    function initBlock(root) {
        if (!root || root.__mbaScaseReady) { return; }
        root.__mbaScaseReady = true;

        var pairs = readList(root, 'data-pairs');
        var viewer = root.querySelector('.mba-pro-scase-viewer');
        var stage = root.querySelector('.mba-pro-scase-stage');
        if (!pairs.length || !viewer || !stage) { return; }

        var imgB = stage.querySelector('.mba-pro-scase-before');
        var imgA = stage.querySelector('.mba-pro-scase-after');
        var handle = stage.querySelector('.mba-pro-scase-handle');
        var modeBtns = root.querySelectorAll('.mba-pro-scase-mode');
        var thumbs = root.querySelectorAll('.mba-pro-scase-thumb');
        var prevBtn = root.querySelector('.mba-pro-scase-prev');
        var nextBtn = root.querySelector('.mba-pro-scase-next');
        var countEl = root.querySelector('.mba-pro-scase-count');
        var labelEl = root.querySelector('.mba-pro-scase-plabel');
        var liveEl = root.querySelector('.mba-pro-scase-live');

        var MODES = ['slider', 'before', 'after', 'side'];
        var initialMode = viewer.getAttribute('data-mode');
        var state = {
            idx: 0,
            pos: 50,
            mode: MODES.indexOf(initialMode) !== -1 ? initialMode : 'slider',
            ratio: parseFloat(pairs[0] && pairs[0].ratio) || 0,
            token: 0,
            drag: null,
            stage: -1,
            announce: 0
        };

        /* Slider position. */
        function setPos(p) {
            state.pos = clamp(p, 0, 100);
            var shown = Math.round(state.pos * 10) / 10;
            stage.style.setProperty('--sc-pos', shown + '%');
            if (handle) {
                var r = Math.round(state.pos);
                handle.setAttribute('aria-valuenow', String(r));
                handle.setAttribute('aria-valuetext', fmt(t('sliderValue', '%1$s%% before, %2$s%% after'), r, 100 - r));
            }
        }

        function posFromEvent(e) {
            var rect = stage.getBoundingClientRect();
            if (!rect.width) { return state.pos; }
            return ((e.clientX - rect.left) / rect.width) * 100;
        }

        /* Aspect ratio of the stage. */
        function setRatio(r) {
            if (!(r > 0) || !isFinite(r)) { return; }
            state.ratio = r;
            viewer.style.setProperty('--sc-ar', String(Math.round(r * 10000) / 10000));
            stage.classList.add('has-ratio');
        }

        function checkRatio() {
            if (!imgB || !imgB.naturalWidth || !imgB.naturalHeight) { return; }
            var natural = imgB.naturalWidth / imgB.naturalHeight;
            if (!state.ratio || Math.abs(natural - state.ratio) / state.ratio > 0.02) {
                setRatio(natural);
                // Same rule as the server (≥ 1.6:1 keeps `auto` stacked), for the first view only.
                if (state.idx === 0) { root.classList.toggle('mba-pro-scase--wide-photo', natural >= 1.6); }
            }
        }

        /* Modes. A progress stage on show (state.stage >= 0) takes the photo area
           as data-mode="stage"; state.mode keeps the comparison to go back to. */
        function setMode(mode) {
            if (MODES.indexOf(mode) === -1) { return; }
            state.mode = mode;
            paintMode();
        }

        function paintMode() {
            var mode = state.mode;
            var showing = state.stage >= 0;
            viewer.setAttribute('data-mode', showing ? 'stage' : mode);
            root.setAttribute('data-view', mode);
            for (var i = 0; i < modeBtns.length; i++) {
                var on = !showing && modeBtns[i].getAttribute('data-mode') === mode;
                modeBtns[i].classList.toggle('is-active', on);
                modeBtns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            // Only the photos actually on screen are exposed to assistive tech.
            if (imgB) { imgB.setAttribute('aria-hidden', showing || mode === 'after' ? 'true' : 'false'); }
            if (imgA) { imgA.setAttribute('aria-hidden', showing || mode === 'before' ? 'true' : 'false'); }
        }

        /* Screen-reader message; cleared first so a repeat is read again. */
        function say(message) {
            if (!liveEl) { return; }
            window.clearTimeout(state.announce);
            liveEl.textContent = '';
            state.announce = window.setTimeout(function () { liveEl.textContent = message; }, 60);
        }

        /* Pairs. */
        function paintPairChrome() {
            var p = pairs[state.idx] || {};
            for (var i = 0; i < thumbs.length; i++) {
                var on = parseInt(thumbs[i].getAttribute('data-index'), 10) === state.idx;
                thumbs[i].classList.toggle('is-active', on);
                thumbs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            if (countEl) { countEl.textContent = (state.idx + 1) + ' / ' + pairs.length; }
            if (labelEl) {
                labelEl.textContent = p.label || '';
                if (p.label) { labelEl.removeAttribute('hidden'); } else { labelEl.setAttribute('hidden', ''); }
            }
        }

        function goPair(i) {
            var n = pairs.length;
            if (n < 2) { return; }
            var idx = ((i % n) + n) % n;
            if (idx === state.idx) { return; }
            state.idx = idx;
            var token = ++state.token;
            var p = pairs[idx] || {};
            paintPairChrome();
            if (liveEl) {
                window.clearTimeout(state.announce);
                liveEl.textContent = fmt(t('viewOf', 'View %1$s of %2$s'), idx + 1, n) + (p.label ? ': ' + p.label : '');
            }
            stage.classList.add('is-loading');
            // Swap before and after together, once both are ready.
            Promise.all([preload(p.before), preload(p.after)]).then(function (loaded) {
                if (token !== state.token) { return; }
                if (imgB) { imgB.src = p.before || ''; imgB.alt = p.beforeAlt || ''; }
                if (imgA) { imgA.src = p.after || ''; imgA.alt = p.afterAlt || ''; }
                var r = parseFloat(p.ratio) || 0;
                if (!r && loaded[0] && loaded[0].naturalHeight) {
                    r = loaded[0].naturalWidth / loaded[0].naturalHeight;
                }
                state.ratio = 0;
                setRatio(r);
                stage.classList.remove('is-loading');
            });
        }

        /* ── Wiring (all listeners are on this embed's own elements) ── */
        // The comparison views and the pair switcher bring the comparison back
        // when a progress stage is on show.
        var leaveStage = initStages();
        for (var m = 0; m < modeBtns.length; m++) {
            modeBtns[m].addEventListener('click', function () {
                leaveStage();
                setMode(this.getAttribute('data-mode'));
            });
        }
        function switchPair(i) {
            leaveStage();
            goPair(i);
        }
        for (var k = 0; k < thumbs.length; k++) {
            thumbs[k].addEventListener('click', function () {
                switchPair(parseInt(this.getAttribute('data-index'), 10) || 0);
            });
        }
        if (prevBtn) { prevBtn.addEventListener('click', function () { switchPair(state.idx - 1); }); }
        if (nextBtn) { nextBtn.addEventListener('click', function () { switchPair(state.idx + 1); }); }

        // Drag (Pointer Events). touch-action: pan-y on the stage keeps vertical
        // page scrolling on phones; a horizontal swipe moves the divider.
        stage.addEventListener('pointerdown', function (e) {
            if (state.mode !== 'slider' || state.stage >= 0) { return; }
            if (e.pointerType === 'mouse' && e.button !== 0) { return; }
            state.drag = { id: e.pointerId };
            try { stage.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
            stage.classList.add('is-dragging');
            setPos(posFromEvent(e));
            if (e.pointerType === 'mouse') { e.preventDefault(); }
        });
        stage.addEventListener('pointermove', function (e) {
            if (!state.drag || state.drag.id !== e.pointerId) { return; }
            setPos(posFromEvent(e));
        });
        function endDrag(e) {
            if (!state.drag || (e && state.drag.id !== e.pointerId)) { return; }
            state.drag = null;
            stage.classList.remove('is-dragging');
        }
        stage.addEventListener('pointerup', endDrag);
        stage.addEventListener('pointercancel', endDrag);
        stage.addEventListener('lostpointercapture', endDrag);

        // Before/After: a click on the photo flips to the other one.
        stage.addEventListener('click', function () {
            if (state.stage >= 0) { return; }
            if (state.mode === 'before') { setMode('after'); }
            else if (state.mode === 'after') { setMode('before'); }
        });

        if (handle) {
            handle.addEventListener('keydown', function (e) {
                var step = e.shiftKey ? 10 : 2;
                var next = null;
                switch (e.key) {
                    case 'ArrowLeft': case 'ArrowDown': case 'Left': case 'Down': next = state.pos - step; break;
                    case 'ArrowRight': case 'ArrowUp': case 'Right': case 'Up': next = state.pos + step; break;
                    case 'PageDown': next = state.pos - 10; break;
                    case 'PageUp': next = state.pos + 10; break;
                    case 'Home': next = 0; break;
                    case 'End': next = 100; break;
                    default: return;
                }
                e.preventDefault();
                setPos(next);
            });
        }

        if (imgB) {
            if (imgB.complete && imgB.naturalWidth) { checkRatio(); }
            imgB.addEventListener('load', checkRatio);
        }

        /* ── Progress stages. Returns a function that goes back to the
           comparison when a stage is on show. ── */
        function initStages() {
            var box = root.querySelector('.mba-pro-scase-progress');
            var track = box && box.querySelector('.mba-pro-scase-progress-track');
            var rail = track && track.querySelector('.mba-pro-scase-progress-rail');
            var back = box && box.querySelector('.mba-pro-scase-progress-back');
            var list = readList(root, 'data-stages');
            // One stop per stage on the timeline.
            var buttons = rail ? Array.prototype.slice.call(rail.querySelectorAll('.mba-pro-scase-progress-item')) : [];
            if (!list.length || buttons.length !== list.length) {
                if (box) { box.setAttribute('hidden', ''); }
                return function () {};
            }
            var warmed = {};
            var layer = null;
            var photo, capLabel, capDate, capNote, missing;

            function warm(index) {
                var src = list[index] && list[index].image;
                if (src && !warmed[src]) {
                    warmed[src] = true;
                    (new Image()).src = src;
                }
            }

            // The stage photo lies inside the photo area, so whatever blurs or
            // covers the photo area (the Sensitive Content Notice) covers it too.
            function build() {
                layer = node('figure', 'mba-pro-scase-stageview');
                photo = node('img', 'mba-pro-scase-stageview-img');
                photo.alt = '';
                photo.decoding = 'async';
                photo.draggable = false;
                missing = node('span', 'mba-pro-scase-stageview-missing');
                missing.textContent = t('stageMissing', 'Image unavailable');
                missing.hidden = true;
                var caption = node('figcaption', 'mba-pro-scase-stageview-cap');
                capLabel = node('bdi', 'mba-pro-scase-stageview-label');
                capDate = node('time', 'mba-pro-scase-stageview-date');
                capNote = node('bdi', 'mba-pro-scase-stageview-note');
                caption.appendChild(capLabel);
                caption.appendChild(capDate);
                caption.appendChild(capNote);
                layer.appendChild(photo);
                layer.appendChild(missing);
                layer.appendChild(caption);
                stage.appendChild(layer);

                photo.addEventListener('load', function () { setMissing(false); });
                photo.addEventListener('error', function () {
                    if (!photo.getAttribute('src')) { return; }
                    setMissing(true);
                    if (state.stage >= 0) {
                        say(list[state.stage].label + ': ' + t('stageMissing', 'Image unavailable'));
                    }
                });

                // A sideways swipe on the stage photo: next / previous stage.
                var swipe = null;
                layer.addEventListener('touchstart', function (e) {
                    swipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null;
                }, { passive: true });
                layer.addEventListener('touchend', function (e) {
                    var from = swipe;
                    swipe = null;
                    if (!from || e.changedTouches.length !== 1 || state.stage < 0) { return; }
                    var dx = e.changedTouches[0].clientX - from.x;
                    var dy = e.changedTouches[0].clientY - from.y;
                    if (Date.now() - from.at > 700 || Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.5) { return; }
                    var to = state.stage + ((dx < 0) !== isRtl(track) ? 1 : -1);
                    if (to >= 0 && to < list.length) { choose(to, true); }
                }, { passive: true });
            }

            function setMissing(on) {
                layer.classList.remove('is-loading');
                layer.classList.toggle('is-missing', on);
                missing.hidden = !on;
            }

            function choose(index, speak) {
                if (isNaN(index) || index < -1 || index >= list.length) { return; }
                // Going back from the header button: keep focus on the timeline,
                // on the stop that was on show (the button is about to hide).
                var refocus = index < 0 && back && document.activeElement === back ? buttons[state.stage] : null;
                state.stage = index;
                for (var i = 0; i < buttons.length; i++) {
                    var on = i === index;
                    buttons[i].classList.toggle('is-current', on);
                    buttons[i].classList.toggle('is-past', index >= 0 && i < index);
                    buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
                    if (on) {
                        buttons[i].setAttribute('aria-current', 'step');
                    } else {
                        buttons[i].removeAttribute('aria-current');
                    }
                }
                // The line fills from the first stop to the one on show.
                rail.style.setProperty('--sc-progress', index > 0 && buttons.length > 1 ? String(index / (buttons.length - 1)) : '0');
                if (back) { back.hidden = index < 0; }
                if (refocus) {
                    try { refocus.focus({ preventScroll: true }); } catch (err) { refocus.focus(); }
                }
                var label = '';
                if (index >= 0) {
                    var item = list[index];
                    label = item.label;
                    if (!layer) { build(); }
                    photo.alt = item.alt || label;
                    if (photo.getAttribute('src') !== item.image) {
                        setMissing(false);
                        layer.classList.add('is-loading');
                        photo.src = item.image;
                        if (photo.complete && photo.naturalWidth) { layer.classList.remove('is-loading'); }
                    } else if (photo.complete) {
                        setMissing(!photo.naturalWidth);
                    }
                    var date = formatDate(item.date, item.date);
                    capLabel.textContent = label;
                    capDate.textContent = date;
                    capDate.hidden = !date;
                    if (date) { capDate.setAttribute('datetime', item.date); } else { capDate.removeAttribute('datetime'); }
                    capNote.textContent = item.note || '';
                    capNote.hidden = !item.note;
                    // The neighbours load while this one is looked at.
                    warm(index - 1);
                    warm(index + 1);
                }
                if (layer) { layer.hidden = index < 0; }
                paintMode();
                reveal(buttons[index]);
                if (speak) {
                    say(index >= 0
                        ? t('stageShowing', 'Showing %s').split('%s').join(label)
                        : t('stageBack', 'Showing the before and after comparison'));
                }
            }

            // Keep a button in view inside the strip without scrolling the page.
            function reveal(button) {
                if (!button || track.scrollWidth <= track.clientWidth + 1) { return; }
                var pad = 32; // Clear of the edge fade.
                var view = track.getBoundingClientRect();
                var rect = button.getBoundingClientRect();
                var by = 0;
                if (rect.left - pad < view.left) {
                    by = rect.left - pad - view.left;
                } else if (rect.right + pad > view.right) {
                    by = rect.right + pad - view.right;
                }
                if (!by) { return; }
                if (typeof track.scrollBy === 'function') {
                    track.scrollBy({ left: by, behavior: reducedMotion() ? 'auto' : 'smooth' });
                } else {
                    track.scrollLeft += by;
                }
            }

            // A soft fade on an edge with more stages beyond it.
            function updateEdges() {
                var max = track.scrollWidth - track.clientWidth;
                var pos = Math.abs(track.scrollLeft); // RTL runs from 0 to -max.
                var before = max > 1 && pos > 1;
                var after = max > 1 && pos < max - 1;
                var rtl = isRtl(track);
                track.classList.toggle('is-fade-left', rtl ? after : before);
                track.classList.toggle('is-fade-right', rtl ? before : after);
            }

            track.addEventListener('click', function (e) {
                var button = e.target.closest ? e.target.closest('.mba-pro-scase-progress-item') : null;
                if (!button || buttons.indexOf(button) === -1) { return; }
                var index = parseInt(button.getAttribute('data-stage'), 10);
                // Choosing the stage on show again goes back to the comparison.
                choose(index === state.stage ? -1 : index, true);
            });

            track.addEventListener('keydown', function (e) {
                if (e.altKey || e.ctrlKey || e.metaKey) { return; }
                var at = buttons.indexOf(document.activeElement);
                if (at === -1) { return; }
                var step = isRtl(track) ? -1 : 1;
                var next;
                switch (e.key) {
                    case 'ArrowRight': case 'Right': next = at + step; break;
                    case 'ArrowLeft': case 'Left': next = at - step; break;
                    case 'Home': next = 0; break;
                    case 'End': next = buttons.length - 1; break;
                    default: return;
                }
                e.preventDefault();
                next = clamp(next, 0, buttons.length - 1);
                try { buttons[next].focus({ preventScroll: true }); } catch (err) { buttons[next].focus(); }
                reveal(buttons[next]);
            });

            buttons.forEach(function (button, i) {
                button.addEventListener('pointerenter', function () { warm(i); });
                button.addEventListener('focus', function () { warm(i); });
                var time = button.querySelector('time');
                if (time) { time.textContent = formatDate(time.getAttribute('datetime'), time.textContent); }
            });

            if (back) {
                back.addEventListener('click', function () { choose(-1, true); });
            }

            track.addEventListener('scroll', updateEdges, { passive: true });
            if (typeof window.ResizeObserver === 'function') {
                var ro = new window.ResizeObserver(updateEdges);
                ro.observe(box);
                ro.observe(track);
            }
            updateEdges();

            return function () {
                if (state.stage >= 0) { choose(-1, false); }
            };
        }

        initReadMore(root);

        setPos(50);
        setMode(state.mode);
        paintPairChrome();
        root.classList.add('is-ready');
    }

    /* ── "Read more" for long descriptions ────────────────────────────────── */
    function initReadMore(root) {
        var about = root.querySelector('.mba-pro-scase-about');
        if (!about) { return; }
        var body = about.querySelector('.mba-pro-scase-about-body');
        var btn = about.querySelector('.mba-pro-scase-more');
        if (!body || !btn) { return; }
        var textEl = btn.querySelector('.mba-pro-scase-more-text');
        var userOpened = false;
        var lastWidth = 0;

        function setExpanded(open) {
            about.classList.toggle('is-collapsed', !open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (textEl) { textEl.textContent = open ? t('readLess', 'Show less') : t('readMore', 'Read more'); }
        }

        function measure() {
            about.classList.remove('is-collapsed');
            var full = body.scrollHeight;
            var fontSize = parseFloat(window.getComputedStyle(body).fontSize) || 16;
            var limit = fontSize * 11.9; // ≈ 7 lines at line-height 1.7 (matches --sc-clamp)
            var long = full > limit * 1.4;
            about.classList.toggle('is-collapsible', long);
            if (long) {
                btn.removeAttribute('hidden');
                setExpanded(userOpened); // a reader who opened it keeps it open
            } else {
                btn.setAttribute('hidden', '');
                btn.setAttribute('aria-expanded', 'true');
            }
        }

        btn.addEventListener('click', function () {
            var open = btn.getAttribute('aria-expanded') !== 'true';
            userOpened = open;
            setExpanded(open);
        });
        // Keyboard users tabbing into a link inside the clipped text: open it.
        body.addEventListener('focusin', function () {
            if (about.classList.contains('is-collapsed')) {
                userOpened = true;
                setExpanded(true);
            }
        });

        measure();
        if (typeof window.ResizeObserver === 'function') {
            var ro = new window.ResizeObserver(function (entries) {
                var w = Math.round(entries[0].contentRect.width);
                if (w && w !== lastWidth) {
                    lastWidth = w;
                    measure();
                }
            });
            ro.observe(about);
        }
    }

    function init(scope) {
        var base = scope && scope.querySelectorAll ? scope : document;
        if (base !== document && base.classList && base.classList.contains('mba-pro-scase')) {
            initBlock(base);
            return;
        }
        var blocks = base.querySelectorAll('.mba-pro-scase');
        for (var i = 0; i < blocks.length; i++) { initBlock(blocks[i]); }
    }

    window.mbaProSingleCase = window.mbaProSingleCase || {};
    window.mbaProSingleCase.init = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }
})();
