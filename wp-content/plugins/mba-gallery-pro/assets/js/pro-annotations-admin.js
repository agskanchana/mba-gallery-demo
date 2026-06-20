/**
 * MBA Gallery Pro — Image Annotations editor (case editor screen).
 *
 * Click an image to drop a numbered marker, drag to reposition, click a marker
 * to edit its title/note or delete it. Coordinates are stored as a percentage of
 * the image (the editor box uses the image's exact aspect-ratio, so a click maps
 * 1:1 to the percentage the frontend uses). Serializes to a hidden JSON input.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var i18n = window.mbaProAnnoAdminI18n || {};
    var dataInput = document.getElementById('mba-pro-anno-data');
    if (!dataInput) return;

    var model;
    try { model = JSON.parse(dataInput.value || '{}') || {}; } catch (e) { model = {}; }
    if (typeof model !== 'object' || model === null) model = {};

    function round(n) { return Math.round(n * 100) / 100; }

    function listFor(pair, side, create) {
        if (!model[pair]) { if (!create) return null; model[pair] = {}; }
        if (!model[pair][side]) { if (!create) return null; model[pair][side] = []; }
        return model[pair][side];
    }

    function save() {
        Object.keys(model).forEach(function (pk) {
            ['before', 'after'].forEach(function (s) {
                if (model[pk] && model[pk][s] && !model[pk][s].length) delete model[pk][s];
            });
            if (model[pk] && !model[pk].before && !model[pk].after) delete model[pk];
        });
        dataInput.value = JSON.stringify(model);
    }

    function closeAllPopovers() {
        document.querySelectorAll('.mba-pro-anno-pop').forEach(function (el) { el.remove(); });
    }

    Array.prototype.forEach.call(
        document.querySelectorAll('.mba-pro-anno-box[data-pair][data-side]'),
        setupBox
    );

    function setupBox(box) {
        var pair = box.getAttribute('data-pair');
        var side = box.getAttribute('data-side');

        renderPins();

        box.addEventListener('click', function (e) {
            if (e.target.closest('.mba-pro-anno-pin') || e.target.closest('.mba-pro-anno-pop')) return;
            var rect = box.getBoundingClientRect();
            var x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            var y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            var list = listFor(pair, side, true);
            list.push({ x: round(x), y: round(y), title: '', note: '' });
            save();
            renderPins();
            var pins = box.querySelectorAll('.mba-pro-anno-pin');
            openPopover(pins[pins.length - 1], list.length - 1);
        });

        function renderPins() {
            Array.prototype.forEach.call(
                box.querySelectorAll('.mba-pro-anno-pin, .mba-pro-anno-pop'),
                function (el) { el.remove(); }
            );
            var list = listFor(pair, side, false);
            if (!list) return;
            list.forEach(function (pt, i) {
                var pin = document.createElement('button');
                pin.type = 'button';
                pin.className = 'mba-pro-anno-pin';
                pin.style.left = pt.x + '%';
                pin.style.top = pt.y + '%';
                pin.textContent = String(i + 1);
                pin.title = pt.title || '';
                box.appendChild(pin);
                attachPinHandlers(pin, i);
            });
        }

        function attachPinHandlers(pin, index) {
            var dragging = false, moved = false, sx = 0, sy = 0;
            pin.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
                try { pin.setPointerCapture(e.pointerId); } catch (err) {}
            });
            pin.addEventListener('pointermove', function (e) {
                if (!dragging) return;
                if (Math.abs(e.clientX - sx) > 3 || Math.abs(e.clientY - sy) > 3) moved = true;
                var rect = box.getBoundingClientRect();
                var x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                var y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                pin.style.left = x + '%';
                pin.style.top = y + '%';
                var list = listFor(pair, side, false);
                if (list && list[index]) { list[index].x = round(x); list[index].y = round(y); }
            });
            pin.addEventListener('pointerup', function (e) {
                if (!dragging) return;
                dragging = false;
                try { pin.releasePointerCapture(e.pointerId); } catch (err) {}
                if (moved) { save(); }
                else { openPopover(pin, index); }
            });
        }

        // Place the popover relative to the pin but clamped inside the box (which
        // is overflow:hidden), flipping below the pin when there's no room above.
        function positionPopover(pop, pin) {
            var br = box.getBoundingClientRect();
            var pr = pin.getBoundingClientRect();
            var pad = 8, gap = 12;
            var pw = pop.offsetWidth, ph = pop.offsetHeight;

            var pinCx = (pr.left - br.left) + pr.width / 2;
            var left = Math.max(pad, Math.min(pinCx - pw / 2, br.width - pw - pad));

            var top = (pr.top - br.top) - gap - ph; // above the pin
            if (top < pad) {
                top = (pr.bottom - br.top) + gap;   // flip below
                if (top + ph > br.height - pad) top = Math.max(pad, br.height - ph - pad);
            }

            pop.style.left = left + 'px';
            pop.style.top = top + 'px';
            pop.style.transform = 'none';
        }

        function openPopover(pin, index) {
            closeAllPopovers();
            var list = listFor(pair, side, false);
            if (!list || !list[index]) return;
            var pt = list[index];

            var pop = document.createElement('div');
            pop.className = 'mba-pro-anno-pop';

            var titleI = document.createElement('input');
            titleI.type = 'text';
            titleI.className = 'mba-pro-anno-pop-title';
            titleI.placeholder = i18n.titlePlaceholder || 'Marker title';
            titleI.value = pt.title || '';

            var noteI = document.createElement('textarea');
            noteI.className = 'mba-pro-anno-pop-note';
            noteI.rows = 2;
            noteI.placeholder = i18n.notePlaceholder || 'Optional note';
            noteI.value = pt.note || '';

            var bar = document.createElement('div');
            bar.className = 'mba-pro-anno-pop-bar';

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'mba-pro-anno-pop-del';
            del.textContent = i18n.delete || 'Delete';

            var done = document.createElement('button');
            done.type = 'button';
            done.className = 'button button-small button-primary mba-pro-anno-pop-done';
            done.textContent = i18n.done || 'Done';

            bar.appendChild(del);
            bar.appendChild(done);
            pop.appendChild(titleI);
            pop.appendChild(noteI);
            pop.appendChild(bar);
            box.appendChild(pop);
            positionPopover(pop, pin);
            titleI.focus();

            function sync() { pt.title = titleI.value; pt.note = noteI.value; pin.title = pt.title; save(); }
            titleI.addEventListener('input', sync);
            noteI.addEventListener('input', sync);
            done.addEventListener('click', function () { sync(); closeAllPopovers(); });
            del.addEventListener('click', function () {
                list.splice(index, 1);
                save();
                closeAllPopovers();
                renderPins();
            });
            pop.addEventListener('click', function (e) { e.stopPropagation(); });
            pop.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        }
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('.mba-pro-anno-pop') ||
            e.target.closest('.mba-pro-anno-pin') ||
            e.target.closest('.mba-pro-anno-box')) {
            return;
        }
        closeAllPopovers();
    });
})();
