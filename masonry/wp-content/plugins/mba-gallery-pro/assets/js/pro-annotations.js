/**
 * MBA Gallery Pro — Image Annotations (frontend).
 *
 * Renders numbered hotspot pins over a before/after image inside the gallery
 * modal. Markers are stored as a percentage of the image's natural size; this
 * overlay computes the *contained* image rectangle at runtime (accounting for
 * object-fit:contain letterboxing) and positions each pin exactly on the image,
 * recomputing on load / resize. Hover or focus (desktop) and tap (mobile) reveal
 * a small title card.
 *
 * Public API (window.mbaProAnno):
 *   mount(imgEl, markers)   — overlay markers on imgEl (clears any previous layer)
 *   clear(imgEl)            — remove the layer mounted on imgEl
 *   clearAll(containerEl)   — remove every annotation layer inside containerEl
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    function clear(imgEl) {
        if (!imgEl || !imgEl._mbaAnno) return;
        var h = imgEl._mbaAnno;
        if (h.ro) { try { h.ro.disconnect(); } catch (e) {} }
        window.removeEventListener('resize', h.onResize);
        if (h.layer && h.layer.parentNode) h.layer.parentNode.removeChild(h.layer);
        imgEl.removeEventListener('load', h.onLoad);
        delete imgEl._mbaAnno;
    }

    function clearAll(container) {
        if (!container) return;
        var layers = container.querySelectorAll('.mba-pro-anno-layer');
        Array.prototype.forEach.call(layers, function (layer) {
            if (layer._mbaImg) { clear(layer._mbaImg); }
            else if (layer.parentNode) { layer.parentNode.removeChild(layer); }
        });
    }

    function closeOpenPins(except) {
        document.querySelectorAll('.mba-pro-anno-mpin.is-open').forEach(function (p) {
            if (p !== except) p.classList.remove('is-open');
        });
    }

    function mount(imgEl, markers) {
        clear(imgEl);
        if (!imgEl || !markers || !markers.length) return;

        var parent = imgEl.parentElement;
        if (!parent) return;

        // Pins are placed in px relative to `parent`, so it must be a positioned
        // ancestor (the masonry side-by-side cells are otherwise static).
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        var layer = document.createElement('div');
        layer.className = 'mba-pro-anno-layer';
        layer._mbaImg = imgEl;

        var pins = markers.map(function (m, i) {
            var pin = document.createElement('button');
            pin.type = 'button';
            pin.className = 'mba-pro-anno-mpin';
            pin.setAttribute('aria-label', m.title || ('Marker ' + (i + 1)));

            var dot = document.createElement('span');
            dot.className = 'mba-pro-anno-mdot';
            dot.textContent = String(i + 1);

            var tip = document.createElement('span');
            tip.className = 'mba-pro-anno-mtip';
            var t = document.createElement('span');
            t.className = 'mba-pro-anno-mtip-title';
            t.textContent = m.title || '';
            tip.appendChild(t);
            if (m.note) {
                var n = document.createElement('span');
                n.className = 'mba-pro-anno-mtip-note';
                n.textContent = m.note;
                tip.appendChild(n);
            }

            pin.appendChild(dot);
            pin.appendChild(tip);

            // Reposition the tooltip before each reveal so it never spills off
            // the (overflow:hidden) image wrap — clamp horizontally, flip below
            // the pin when there isn't room above.
            pin.addEventListener('mouseenter', function () { positionTip(pin, tip); });
            pin.addEventListener('focus', function () { positionTip(pin, tip); });

            // Tap (and click) toggles the tooltip; hover/focus handled by CSS.
            pin.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = pin.classList.contains('is-open');
                closeOpenPins(pin);
                pin.classList.toggle('is-open', !open);
                if (!open) positionTip(pin, tip);
            });

            layer.appendChild(pin);
            return pin;
        });

        parent.appendChild(layer);

        function position() {
            var natW = imgEl.naturalWidth, natH = imgEl.naturalHeight;
            var pr = parent.getBoundingClientRect();
            var ir = imgEl.getBoundingClientRect();
            if (!natW || !natH || ir.width < 2 || ir.height < 2) {
                layer.style.display = 'none';
                return;
            }
            layer.style.display = '';

            var boxLeft = ir.left - pr.left;
            var boxTop  = ir.top - pr.top;
            var scale   = Math.min(ir.width / natW, ir.height / natH);
            var rW = natW * scale, rH = natH * scale;
            var offX = boxLeft + (ir.width - rW) / 2;
            var offY = boxTop + (ir.height - rH) / 2;

            for (var i = 0; i < pins.length; i++) {
                var m = markers[i];
                pins[i].style.left = (offX + (m.x / 100) * rW) + 'px';
                pins[i].style.top  = (offY + (m.y / 100) * rH) + 'px';
            }

            // Keep an open (tapped) tooltip glued to its pin after a resize.
            var openPin = layer.querySelector('.mba-pro-anno-mpin.is-open');
            if (openPin) {
                var openTip = openPin.querySelector('.mba-pro-anno-mtip');
                if (openTip) positionTip(openPin, openTip);
            }
        }

        // Place the tooltip relative to its pin, clamped inside the image wrap
        // (`layer` spans it) so it can't be clipped, and flipped below the pin
        // when there isn't room above.
        function positionTip(pin, tip) {
            tip.classList.add('mba-pro-anno-mtip--js');
            var lr = layer.getBoundingClientRect();
            var pr = pin.getBoundingClientRect();
            var tw = tip.offsetWidth, th = tip.offsetHeight;
            var pad = 6, gap = 10;

            // Horizontal: centre on the pin, then clamp to the layer.
            var pinCx = (pr.left - lr.left) + pr.width / 2;
            var leftLayer = Math.max(pad, Math.min(pinCx - tw / 2, lr.width - tw - pad));
            tip.style.left = (leftLayer - (pr.left - lr.left)) + 'px';
            tip.style.right = 'auto';

            // Keep the arrow pointing at the pin even after the card is shifted.
            var arrowX = Math.max(12, Math.min(pinCx - leftLayer, tw - 12));
            tip.style.setProperty('--mba-arrow-x', arrowX + 'px');

            // Vertical: prefer above; flip below if it would overflow the top.
            if ((pr.top - lr.top) - gap - th < pad) {
                tip.classList.add('mba-pro-anno-mtip--below');
                tip.style.top = (pr.height + gap) + 'px';
                tip.style.bottom = 'auto';
            } else {
                tip.classList.remove('mba-pro-anno-mtip--below');
                tip.style.bottom = (pr.height + gap) + 'px';
                tip.style.top = 'auto';
            }
        }

        var raf = null;
        function schedule() {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(position);
        }

        var onLoad = schedule;
        var onResize = schedule;
        imgEl.addEventListener('load', onLoad);
        window.addEventListener('resize', onResize);

        var ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(schedule);
            ro.observe(parent);
            ro.observe(imgEl);
        }

        imgEl._mbaAnno = { layer: layer, ro: ro, onResize: onResize, onLoad: onLoad };

        // Initial placement (and a couple of follow-ups while the modal animates in).
        schedule();
        setTimeout(schedule, 120);
        setTimeout(schedule, 360);
    }

    // Tap elsewhere closes any open tooltip.
    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.mba-pro-anno-mpin')) return;
        closeOpenPins(null);
    });

    window.mbaProAnno = { mount: mount, clear: clear, clearAll: clearAll };
})();
