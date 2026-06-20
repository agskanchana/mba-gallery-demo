/**
 * MBA Gallery Pro — Single Case embed ([mba_case]) viewer.
 *
 * Self-contained. The skin follows the Gallery Layout setting (data-skin):
 *   • masonry → before/after FLIP (segmented toggle + image click)
 *   • classic → draggable before/after SLIDER (Cocoen), like the classic gallery
 * Both support pair navigation (arrows + label/counter) read from data-pairs.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    function readPairs(root) {
        try { return JSON.parse(root.getAttribute('data-pairs') || '[]'); }
        catch (e) { return []; }
    }

    function setPairChrome(root, pairs, idx) {
        var labelEl = root.querySelector('.mba-pro-scase-plabel');
        var countEl = root.querySelector('.mba-pro-scase-count');
        var p = pairs[idx];
        if (labelEl) {
            labelEl.textContent = p.label || '';
            labelEl.style.display = p.label ? '' : 'none';
        }
        if (countEl) { countEl.textContent = (idx + 1) + ' / ' + pairs.length; }
    }

    /* ── Masonry skin: before/after flip ─────────────────────────────────── */
    function initFlip(root, pairs) {
        var viewer  = root.querySelector('.mba-pro-scase-viewer');
        var beforeI = root.querySelector('.mba-pro-scase-before');
        var afterI  = root.querySelector('.mba-pro-scase-after');
        var segB    = root.querySelector('.mba-pro-scase-seg[data-mode="before"]');
        var segA    = root.querySelector('.mba-pro-scase-seg[data-mode="after"]');
        var prevBtn = root.querySelector('.mba-pro-scase-prev');
        var nextBtn = root.querySelector('.mba-pro-scase-next');
        if (!viewer || !beforeI || !afterI) return;

        var state = { idx: 0, after: false };

        function paint() {
            var p = pairs[state.idx];
            beforeI.src = p.before || ''; beforeI.alt = p.beforeAlt || 'Before';
            afterI.src = p.after || ''; afterI.alt = p.afterAlt || 'After';
            viewer.classList.toggle('mba-pro-show-after', state.after);
            beforeI.setAttribute('aria-hidden', String(state.after));
            afterI.setAttribute('aria-hidden', String(!state.after));
            if (segB) { segB.classList.toggle('is-active', !state.after); segB.setAttribute('aria-pressed', String(!state.after)); }
            if (segA) { segA.classList.toggle('is-active', state.after); segA.setAttribute('aria-pressed', String(state.after)); }
            setPairChrome(root, pairs, state.idx);
        }
        function goPair(d) { state.idx = (state.idx + d + pairs.length) % pairs.length; state.after = false; paint(); }

        viewer.addEventListener('click', function () { state.after = !state.after; paint(); });
        if (segB) segB.addEventListener('click', function (e) { e.stopPropagation(); state.after = false; paint(); });
        if (segA) segA.addEventListener('click', function (e) { e.stopPropagation(); state.after = true; paint(); });
        if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); goPair(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); goPair(1); });
        paint();
    }

    /* ── Classic skin: draggable Cocoen slider ───────────────────────────── */
    function loadImg(img, src) {
        return new Promise(function (resolve) {
            if (!src) { resolve(); return; }
            img.onload = resolve; img.onerror = resolve; img.src = src;
            if (img.complete && img.naturalHeight !== 0) resolve();
        });
    }

    function initSlider(root, pairs) {
        var viewer  = root.querySelector('.mba-pro-scase-viewer');
        var prevBtn = root.querySelector('.mba-pro-scase-prev');
        var nextBtn = root.querySelector('.mba-pro-scase-next');
        if (!viewer) return;
        var idx = 0;

        function build() {
            var p = pairs[idx];
            // Remove whatever the previous pair left (a fresh .cocoen or the
            // <cocoen-component> Cocoen.create() swapped it for).
            var old = viewer.querySelector('cocoen-component, .mba-pro-scase-cocoen');
            var div = document.createElement('div');
            div.className = 'mba-pro-scase-cocoen cocoen';
            var b = document.createElement('img'); b.alt = p.beforeAlt || 'Before';
            var a = document.createElement('img'); a.alt = p.afterAlt || 'After';
            div.appendChild(b); div.appendChild(a);
            if (old) { old.parentNode.replaceChild(div, old); }
            else { viewer.appendChild(div); }

            // Cocoen needs the images loaded AND the element laid out (non-zero
            // width) before create(), or the handle/clip geometry is wrong.
            Promise.all([loadImg(b, p.before), loadImg(a, p.after)]).then(function () {
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        try {
                            if (window.Cocoen && typeof Cocoen.create === 'function') {
                                Cocoen.create(div);
                            }
                        } catch (e) { /* leave the static .cocoen images in place */ }
                    });
                });
            });
            setPairChrome(root, pairs, idx);
        }
        function goPair(d) { idx = (idx + d + pairs.length) % pairs.length; build(); }

        if (prevBtn) prevBtn.addEventListener('click', function () { goPair(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { goPair(1); });
        build();
    }

    function initBlock(root) {
        if (root.__mbaScaseReady) return;
        root.__mbaScaseReady = true;
        var pairs = readPairs(root);
        if (!pairs.length) return;
        if (root.getAttribute('data-skin') === 'classic') { initSlider(root, pairs); }
        else { initFlip(root, pairs); }
    }

    function init() {
        var blocks = document.querySelectorAll('.mba-pro-scase');
        for (var i = 0; i < blocks.length; i++) { initBlock(blocks[i]); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
