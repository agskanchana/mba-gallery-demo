/**
 * MBA Gallery Pro — image zoom for the case modal.
 *
 * Wheel, trackpad pinch, touch pinch, drag-to-pan and zoom buttons over one
 * image "wrap". The same transform is applied to every target image, so the
 * masonry modal's stacked before/after pair stays aligned: zoom in on a detail,
 * flip to the other side, and the view stays on that same detail — the point of
 * zooming in a before/after gallery.
 *
 * Deliberately no double-click / double-tap zoom: a single click already flips
 * before/after, and telling the two apart would delay every flip.
 *
 * Public API (window.mbaProZoom):
 *   create(wrap, { targets, enabled, canWheelZoom, onChange, max }) → controller
 *     targets()       → the elements to transform (same layout box as wrap)
 *     enabled()       → false while zoom should be off (e.g. side-by-side view)
 *     canWheelZoom(e) → whether a plain wheel (no Ctrl) may zoom, not scroll
 *     onChange(scale) → called after every change
 *   controller.zoomBy(factor, animate) · reset(animate) · isZoomed()
 *             · consumeClick() — true once after a drag/pinch, so the click
 *               that ends one does not also flip the image
 *             · recentlyPinched() — for callers with their own swipe handling
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    var MIN = 1;
    var DRAG_THRESHOLD = 4;   // px of pointer travel before a press counts as a pan
    var CLICK_GUARD_MS = 350; // swallow the click that ends a pan / pinch

    function create(wrap, opts) {
        opts = opts || {};
        var MAX = opts.max || 4;
        var targets = opts.targets || function () { return []; };
        var enabled = opts.enabled || function () { return true; };
        var canWheelZoom = opts.canWheelZoom || function () { return true; };
        var onChange = opts.onChange || function () {};

        var s = 1, tx = 0, ty = 0;
        var pointers = {};          // pointerId → { x, y }
        var gesture = null;         // current pan / pinch baseline
        var lastGestureEnd = 0;
        var lastPinchEnd = 0;
        var moved = false;
        var animTimer = null;

        function size() {
            var t = targets()[0];
            return t ? { w: t.offsetWidth, h: t.offsetHeight } : { w: 0, h: 0 };
        }

        // Keep the image covering the wrap: never pan past an edge.
        function clamp() {
            var sz = size();
            tx = Math.min(0, Math.max(sz.w - sz.w * s, tx));
            ty = Math.min(0, Math.max(sz.h - sz.h * s, ty));
        }

        function apply(animate) {
            if (s <= MIN + 0.001) { s = MIN; tx = 0; ty = 0; }
            clamp();

            clearTimeout(animTimer);
            wrap.classList.toggle('mba-pro-zoom-animate', !!animate);
            if (animate) {
                animTimer = setTimeout(function () { wrap.classList.remove('mba-pro-zoom-animate'); }, 260);
            }

            var value = s === MIN ? '' : 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
            targets().forEach(function (el) { el.style.transform = value; });
            wrap.classList.toggle('mba-pro-zoomed', s > MIN);
            onChange(s);
        }

        // Zoom to `next`, keeping the wrap-relative point (px, py) where it is.
        function zoomAt(px, py, next, animate) {
            next = Math.min(MAX, Math.max(MIN, next));
            var cx = (px - tx) / s, cy = (py - ty) / s;
            s = next;
            tx = px - cx * s;
            ty = py - cy * s;
            apply(animate);
        }

        function local(clientX, clientY) {
            var r = wrap.getBoundingClientRect();
            return { x: clientX - r.left, y: clientY - r.top };
        }

        function zoomBy(factor, animate) {
            if (!enabled()) return;
            var sz = size();
            if (!sz.w || !sz.h) return;
            zoomAt(sz.w / 2, sz.h / 2, s * factor, animate);
        }

        function reset(animate) {
            pointers = {};
            gesture = null;
            wrap.classList.remove('mba-pro-zoom-dragging');
            if (s === MIN && tx === 0 && ty === 0) return;
            s = MIN;
            apply(animate);
        }

        /* ── Wheel / trackpad pinch (browsers send pinch as ctrl+wheel) ─────── */
        wrap.addEventListener('wheel', function (e) {
            if (!enabled() || !size().w) return;
            // A plain wheel scrolls where the modal itself scrolls (the stacked
            // mobile layout), unless we are already zoomed in.
            if (!e.ctrlKey && s === MIN && !canWheelZoom(e)) return;
            var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            if (!delta) return;
            e.preventDefault();
            var p = local(e.clientX, e.clientY);
            zoomAt(p.x, p.y, s * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), false);
        }, { passive: false });

        /* ── Pointer pan + two-finger pinch ─────────────────────────────────── */
        function baseline() {
            var ids = Object.keys(pointers);
            if (ids.length >= 2) {
                var a = pointers[ids[0]], b = pointers[ids[1]];
                var mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
                gesture = {
                    pinch: true,
                    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
                    s: s,
                    cx: (mid.x - tx) / s,
                    cy: (mid.y - ty) / s,
                };
            } else if (ids.length === 1) {
                var p = pointers[ids[0]];
                gesture = { pinch: false, x: p.x, y: p.y, tx: tx, ty: ty };
            } else {
                gesture = null;
            }
        }

        wrap.addEventListener('pointerdown', function (e) {
            if (!enabled()) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            // Controls layered on the image (zoom buttons, annotation pins)
            // keep their own clicks.
            if (e.target.closest && e.target.closest('button')) return;
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            if (Object.keys(pointers).length === 1) moved = false;
            baseline();
            // Capture only once a gesture needs it: a two-finger pinch, or a
            // pan of an image that is already zoomed.
            if (gesture && (gesture.pinch || s > MIN)) {
                try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
            }
        });

        wrap.addEventListener('pointermove', function (e) {
            if (!pointers[e.pointerId] || !gesture) return;
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

            if (gesture.pinch) {
                var ids = Object.keys(pointers);
                if (ids.length < 2) return;
                var a = pointers[ids[0]], b = pointers[ids[1]];
                var mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
                var next = Math.min(MAX, Math.max(MIN, gesture.s * Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist));
                s = next;
                tx = mid.x - gesture.cx * s;
                ty = mid.y - gesture.cy * s;
                moved = true;
                apply(false);
                return;
            }

            if (s === MIN) return; // nothing to pan; leave the gesture to the page
            var dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
            if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            moved = true;
            wrap.classList.add('mba-pro-zoom-dragging');
            tx = gesture.tx + dx;
            ty = gesture.ty + dy;
            apply(false);
        });

        function release(e) {
            if (!pointers[e.pointerId]) return;
            var wasPinch = gesture && gesture.pinch;
            delete pointers[e.pointerId];
            if (wasPinch) lastPinchEnd = Date.now();
            if (moved) lastGestureEnd = Date.now();
            wrap.classList.remove('mba-pro-zoom-dragging');
            baseline(); // one finger left after a pinch carries on panning
        }
        wrap.addEventListener('pointerup', release);
        wrap.addEventListener('pointercancel', release);

        // Images are natively draggable: a mouse pan would start a drag-and-drop
        // after a few pixels, and the browser then cancels the pointer stream.
        wrap.addEventListener('dragstart', function (e) {
            if (s > MIN) e.preventDefault();
        });

        // The image box can change size (window resize, rotation): keep the
        // zoomed view inside the new bounds rather than dropping the zoom.
        window.addEventListener('resize', function () {
            if (s > MIN) apply(false);
        });

        return {
            zoomBy: zoomBy,
            reset: reset,
            isZoomed: function () { return s > MIN; },
            scale: function () { return s; },
            consumeClick: function () {
                if (Date.now() - lastGestureEnd < CLICK_GUARD_MS) {
                    lastGestureEnd = 0;
                    return true;
                }
                return false;
            },
            recentlyPinched: function () { return Date.now() - lastPinchEnd < CLICK_GUARD_MS; },
        };
    }

    window.mbaProZoom = { create: create };
})();
