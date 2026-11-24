/**
 * MBA Gallery Pro — category navigation styles (front end).
 *
 * Tabs, treatment cards, area chips, side menu, search first, icon chips and the
 * filter bar (pro-category-styles.php prints their markup and data next to the
 * free plugin's category bar). Nothing here filters cases itself: every choice
 * goes through the free plugin's category tiles and Pro's subcategory pills —
 * clicked, as the free drop-down does — and the doctor and recovery drop-downs
 * tick the filter sidebar's own checkboxes. So filtering, the active state,
 * deep links (?mbcat=) and the hiding of empty categories stay on one path,
 * and every control here follows that state instead of keeping its own.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof galleryConfig !== 'undefined' && galleryConfig) ? galleryConfig : null;
    }

    function cssEscape(value) {
        return (window.CSS && typeof window.CSS.escape === 'function')
            ? window.CSS.escape(String(value))
            : String(value).replace(/["\\\]\[]/g, '\\$&');
    }

    function fmt(pattern, value) {
        return String(pattern).replace('%s', value);
    }

    function each(list, fn) {
        Array.prototype.forEach.call(list || [], fn);
    }

    function setAttr(el, name, value) {
        if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
    }

    function setHidden(el, hidden) {
        if (el && el.hidden !== !!hidden) el.hidden = !!hidden;
    }

    /* ── Mount: the same steps as the inline script pro-category-styles.php
       prints, for pages where that script was delayed or blocked. ─────────── */
    function mount(m) {
        if (!m || m.getAttribute('data-mounted')) return;
        var content = m.closest('.medbeafgallery-gallery-content');
        var bar = content && content.querySelector('.medbeafgallery-category-carousel');
        if (!bar) return;
        var ui = m.querySelector('.mba-pro-catnav');
        var place = m.getAttribute('data-place');
        if (ui) {
            if (place === 'before') {
                bar.parentNode.insertBefore(ui, bar);
            } else if (place === 'after') {
                bar.parentNode.insertBefore(ui, bar.nextSibling);
            } else {
                m.parentNode.insertBefore(ui, m);
                m.parentNode.classList.add('mba-pro-catmenu-layout');
            }
        }
        each(m.querySelectorAll('.mba-pro-catnav-deco'), function (d) {
            var tile = bar.querySelector('.medbeafgallery-carousel-item[data-id="' + cssEscape(d.getAttribute('data-for')) + '"]');
            if (!tile) return;
            var label = d.getAttribute('data-label');
            if (label) tile.setAttribute('aria-label', label);
            var target = d.getAttribute('data-target');
            if (target === 'image') {
                var slot = tile.querySelector('.medbeafgallery-category-image');
                if (slot) {
                    slot.innerHTML = '';
                    while (d.firstChild) slot.appendChild(d.firstChild);
                    slot.classList.add('mba-pro-catnav-icon');
                }
            } else if (target === 'append') {
                while (d.firstChild) tile.appendChild(d.firstChild);
            }
            d.parentNode.removeChild(d);
        });
        m.setAttribute('data-mounted', '1');
    }

    /* ── One controller per gallery ──────────────────────────────────────── */
    function setup(dataEl) {
        var container = dataEl.closest('.medbeafgallery-container');
        var mountEl = dataEl.closest('.mba-pro-catnav-mount');
        if (!container || !mountEl || mountEl.getAttribute('data-mba-catnav-ready')) return;
        mountEl.setAttribute('data-mba-catnav-ready', '1');

        var data;
        try { data = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
        var content = container.querySelector('.medbeafgallery-gallery-content');
        var bar = content && content.querySelector('.medbeafgallery-category-carousel');
        if (!bar) return;

        var mode = data.mode;
        var S = data.strings || {};
        var tops = {};
        (data.tops || []).forEach(function (t) { tops[t.slug] = t; });
        var map = (data.map && typeof data.map === 'object') ? data.map : {};
        var ui = container.querySelector('.mba-pro-catnav');

        var plural = function (n, one, many) { return fmt(n === 1 ? one : many, Number(n).toLocaleString()); };
        var casesLabel = function (n) { return plural(n, S.caseOne || '%s case', S.caseMany || '%s cases'); };
        var allOf = function (name) {
            var n = String(name || '');
            if (S.lowerNames && /^\p{Lu}[^\p{Lu}]*$/u.test(n)) n = n.charAt(0).toLocaleLowerCase() + n.slice(1);
            return fmt(S.allOf || 'All %s', n);
        };

        function tileFor(slug) {
            var t = bar.querySelector('.medbeafgallery-carousel-item[data-id="' + cssEscape(slug) + '"]');
            if (!t && slug === 'all') t = bar.querySelector('.medbeafgallery-carousel-item[data-id="ba_category_all"]');
            return t;
        }

        // The free script hides categories none of the loaded cases use.
        function isHidden(slug) {
            if (slug === 'all') return false;
            var t = tileFor(slug);
            return !t || t.style.getPropertyValue('display') === 'none';
        }

        function pillsBox() {
            return content.querySelector('.medbeafgallery-child-categories');
        }

        function nameOf(parent, sub) {
            var top = tops[parent];
            if (!top) return S.allTreat || 'All treatments';
            if (!sub) return top.name;
            for (var i = 0; i < top.subs.length; i++) {
                if (top.subs[i].slug === sub) return top.subs[i].name;
            }
            return top.name;
        }

        // What the gallery shows now: { parent: 'all' | top slug, sub: '' | subcategory slug }.
        function current() {
            var g = cfg();
            var c = g && g.currentCategory ? String(g.currentCategory) : '';
            if (!c) {
                var active = bar.querySelector('.medbeafgallery-carousel-item.active');
                c = active ? active.getAttribute('data-id') : 'all';
            }
            if (c === 'all' || c === 'ba_category_all') return { parent: 'all', sub: '' };
            if (tops[c]) return { parent: c, sub: '' };
            if (map[c]) return { parent: map[c][0], sub: map[c][1] };
            return { parent: c, sub: '' };
        }

        // A deep link for a subcategory chosen before Pro's pills arrived
        // (they come from a REST request); the same parameter Pro's own writer uses.
        function writeCategoryParam(slug) {
            var c = window.medbeafgalleryGalleryConfig || {};
            if (!c.enableDeeplink || !window.history || typeof window.history.replaceState !== 'function') return;
            try {
                var url = new URL(window.location.href);
                if (!slug || slug === String(c.defaultCategory || 'all')) {
                    url.searchParams.delete('mbcat');
                } else {
                    url.searchParams.set('mbcat', slug);
                }
                window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
            } catch (e) {}
        }

        // Choose a category the way a visitor would: click its tile, then its pill.
        function choose(parent, sub, force) {
            parent = parent || 'all';
            sub = sub || '';
            var now = current();
            if (!force && now.parent === parent && now.sub === sub) return;
            var tile = tileFor(parent);
            if (!tile) return;
            if (!sub) {
                tile.click();
                schedule();
                return;
            }
            if (!tile.classList.contains('active') || now.parent !== parent) tile.click();
            var box = pillsBox();
            var pill = box && box.querySelector('.mba-pro-subcategory-pill[data-slug="' + cssEscape(sub) + '"]');
            if (pill) {
                pill.click();
            } else {
                var g = cfg();
                if (g && typeof renderGalleryItems === 'function') {
                    g.currentCategory = sub;
                    g.currentChildCategory = '';
                    renderGalleryItems();
                    writeCategoryParam(sub);
                }
            }
            schedule();
        }

        /* ── Pro's subcategory pills, in the styles that show them ────────── */
        var pillsVisible = ['tabs', 'cards', 'icons', 'search'].indexOf(mode) !== -1;

        function touchUpPills(state) {
            var box = pillsBox();
            if (!box) return;
            var pills = box.querySelectorAll('.mba-pro-subcategory-pill');
            if (!pills.length) return;
            var parent = '';
            each(pills, function (p) {
                var s = p.getAttribute('data-slug');
                if (!parent && s && map[s]) parent = map[s][0];
            });
            each(pills, function (p) {
                if (pillsVisible && !p.getAttribute('data-mba-catnav')) {
                    p.setAttribute('data-mba-catnav', '1');
                    var count = p.querySelector('.mba-pro-pill-count');
                    if (count) {
                        var m = /^\((.*)\)$/.exec((count.textContent || '').trim());
                        if (m) count.textContent = m[1];
                    }
                    if (!p.getAttribute('data-slug') && parent && tops[parent]) {
                        // "All" → "All face 6"
                        each(p.childNodes, function (n) {
                            if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = allOf(tops[parent].name);
                        });
                        if (!count) {
                            var c = document.createElement('span');
                            c.className = 'mba-pro-pill-count';
                            c.textContent = Number(tops[parent].count).toLocaleString();
                            p.appendChild(document.createTextNode(' '));
                            p.appendChild(c);
                        }
                    }
                    var top = parent && tops[parent];
                    var slug = p.getAttribute('data-slug');
                    var n = !slug ? (top ? top.count : null) : null;
                    if (slug && top) {
                        top.subs.forEach(function (s) { if (s.slug === slug) n = s.count; });
                    }
                    if (n !== null) {
                        p.setAttribute('aria-label', (slug ? nameOf(parent, slug) : allOf(top.name)) + ', ' + casesLabel(n));
                    }
                }
                // Pills arrived after a subcategory was chosen here: mark the right one.
                if (state.sub && state.parent === parent) {
                    p.classList.toggle('active', p.getAttribute('data-slug') === state.sub);
                }
                setAttr(p, 'aria-pressed', p.classList.contains('active') ? 'true' : 'false');
            });
        }

        /* ── Per-style controls ─────────────────────────────────────────── */
        var syncers = [];

        // Chips (area chips, popular picks): pressed state + hide those of hidden areas.
        function syncChips(root, state) {
            each(root.querySelectorAll('.mba-pro-catnav-chip, .mba-pro-catmenu-item'), function (chip) {
                var p = chip.getAttribute('data-parent');
                var s = chip.getAttribute('data-sub') || '';
                setAttr(chip, 'aria-pressed', (p === state.parent && s === state.sub) ? 'true' : 'false');
                if (chip.classList.contains('mba-pro-catnav-chip')) setHidden(chip, isHidden(p));
            });
        }

        function bindChips(root, onChoose) {
            root.addEventListener('click', function (e) {
                var chip = e.target.closest('.mba-pro-catnav-chip, .mba-pro-catmenu-item');
                if (!chip || !root.contains(chip)) return;
                choose(chip.getAttribute('data-parent'), chip.getAttribute('data-sub') || '', true);
                if (onChoose) onChoose(chip);
            });
        }

        if (mode === 'areas' && ui && ui.classList.contains('mba-pro-catchips')) {
            bindChips(ui);
            syncers.push(function (state) {
                var shown = false;
                each(ui.querySelectorAll('.mba-pro-catchips-set'), function (set) {
                    var on = set.getAttribute('data-for') === state.parent;
                    setHidden(set, !on);
                    if (on) shown = true;
                });
                ui.classList.toggle('mba-pro-catchips-empty', !shown);
                syncChips(ui, state);
            });
        }

        if (mode === 'menu' && ui && ui.classList.contains('mba-pro-catmenu')) {
            var toggle = ui.querySelector('.mba-pro-catmenu-toggle');
            var currentLabel = ui.querySelector('.mba-pro-catmenu-current');
            var lastParent = null;
            var setOpen = function (open) {
                ui.classList.toggle('is-open', open);
                if (toggle) setAttr(toggle, 'aria-expanded', open ? 'true' : 'false');
            };
            var setFold = function (group, open) {
                var fold = group.querySelector('.mba-pro-catmenu-fold');
                var list = group.querySelector('.mba-pro-catmenu-sublist');
                if (!fold || !list) return;
                setAttr(fold, 'aria-expanded', open ? 'true' : 'false');
                setHidden(list, !open);
            };
            var phone = function () { return toggle && toggle.offsetParent !== null; };
            if (toggle) {
                toggle.addEventListener('click', function () { setOpen(!ui.classList.contains('is-open')); });
            }
            ui.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && ui.classList.contains('is-open') && phone()) {
                    setOpen(false);
                    toggle.focus();
                }
            });
            ui.addEventListener('click', function (e) {
                var fold = e.target.closest('.mba-pro-catmenu-fold');
                if (fold) {
                    setFold(fold.closest('.mba-pro-catmenu-group'), fold.getAttribute('aria-expanded') !== 'true');
                }
            });
            bindChips(ui, function (chip) {
                var group = chip.closest('.mba-pro-catmenu-group');
                if (group && !chip.getAttribute('data-sub')) setFold(group, true);
                if (phone()) setOpen(false);
            });
            syncers.push(function (state) {
                if (state.parent !== lastParent) {
                    // A newly chosen area opens; folders the visitor opened stay open.
                    var g = ui.querySelector('.mba-pro-catmenu-group[data-for="' + cssEscape(state.parent) + '"]');
                    if (g) setFold(g, true);
                    lastParent = state.parent;
                }
                each(ui.querySelectorAll('.mba-pro-catmenu-group[data-for]'), function (g) {
                    setHidden(g, isHidden(g.getAttribute('data-for')));
                });
                if (currentLabel) {
                    var label = state.parent === 'all' ? (S.allTreat || 'All treatments') : nameOf(state.parent, state.sub);
                    if (currentLabel.textContent !== label) currentLabel.textContent = label;
                }
                syncChips(ui, state);
            });
        }

        if (mode === 'search' && ui && ui.classList.contains('mba-pro-catsearch')) {
            setupSearch(ui);
        }

        if (mode === 'bar' && ui && ui.classList.contains('mba-pro-catbar')) {
            setupBar(ui);
        }

        function setupSearch(root) {
            var input = root.querySelector('.mba-pro-catsearch-input');
            var list = root.querySelector('.mba-pro-catsearch-list');
            var status = root.querySelector('.mba-pro-catsearch-status');
            var clear = root.querySelector('.mba-pro-catsearch-clear');
            var pick = root.querySelector('.mba-pro-catsearch-pick');
            var popular = root.querySelector('.mba-pro-catsearch-popular');
            if (!input || !list) return;
            var listId = list.id;
            var results = [];
            var active = -1;

            var norm = function (s) {
                s = String(s || '').toLowerCase();
                if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
                return s.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
            };
            var entries = [];
            (data.tops || []).forEach(function (t) {
                entries.push({ parent: t.slug, sub: '', name: t.name, area: '', count: t.count });
                t.subs.forEach(function (s) {
                    entries.push({ parent: t.slug, sub: s.slug, name: s.name, area: t.name, count: s.count });
                });
            });
            entries.forEach(function (e) { e.key = norm(e.name); e.hay = e.key + ' ' + norm(e.area); });

            var find = function (q) {
                q = norm(q);
                if (!q) return [];
                var words = q.split(' ');
                var out = [];
                entries.forEach(function (e) {
                    if (isHidden(e.parent)) return;
                    if (!words.every(function (w) { return e.hay.indexOf(w) !== -1; })) return;
                    var score = e.key.indexOf(q) === 0 ? 0 : ((' ' + e.key).indexOf(' ' + words[0]) !== -1 ? 1 : (e.key.indexOf(words[0]) !== -1 ? 2 : 3));
                    out.push({ e: e, score: score });
                });
                out.sort(function (a, b) {
                    return (a.score - b.score) || (b.e.count - a.e.count) || a.e.name.localeCompare(b.e.name);
                });
                return out.slice(0, 6).map(function (x) { return x.e; });
            };

            var close = function () {
                setHidden(list, true);
                setAttr(input, 'aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                active = -1;
            };
            var mark = function () {
                each(list.querySelectorAll('[role="option"]'), function (li, i) {
                    setAttr(li, 'aria-selected', i === active ? 'true' : 'false');
                    li.classList.toggle('is-active', i === active);
                    if (i === active && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
                });
                if (active >= 0) {
                    input.setAttribute('aria-activedescendant', listId + '-opt-' + active);
                } else {
                    input.removeAttribute('aria-activedescendant');
                }
            };
            var choosePick = function (e) {
                input.value = '';
                close();
                choose(e.parent, e.sub, true);
                if (status) status.textContent = fmt(S.showing || 'Showing %s', e.name);
            };
            var render = function () {
                var q = input.value;
                results = find(q);
                active = -1;
                list.innerHTML = '';
                if (!norm(q)) {
                    close();
                    if (status) status.textContent = '';
                    return;
                }
                results.forEach(function (e, i) {
                    var li = document.createElement('li');
                    li.id = listId + '-opt-' + i;
                    li.className = 'mba-pro-catsearch-option';
                    li.setAttribute('role', 'option');
                    li.setAttribute('aria-selected', 'false');
                    var text = document.createElement('span');
                    text.className = 'mba-pro-catsearch-text';
                    var name = document.createElement('span');
                    name.className = 'mba-pro-catsearch-name';
                    name.textContent = e.name;
                    text.appendChild(name);
                    if (e.area) {
                        var area = document.createElement('span');
                        area.className = 'mba-pro-catsearch-area';
                        area.textContent = e.area;
                        text.appendChild(area);
                    }
                    var count = document.createElement('span');
                    count.className = 'mba-pro-catsearch-count';
                    count.textContent = casesLabel(e.count);
                    li.appendChild(text);
                    li.appendChild(count);
                    // Keep focus in the box while a pointer chooses.
                    li.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
                    li.addEventListener('click', function () { choosePick(e); });
                    list.appendChild(li);
                });
                if (!results.length) {
                    var empty = document.createElement('li');
                    empty.className = 'mba-pro-catsearch-empty';
                    empty.setAttribute('role', 'presentation');
                    empty.textContent = S.noMatch || '';
                    list.appendChild(empty);
                }
                setHidden(list, false);
                setAttr(input, 'aria-expanded', 'true');
                if (status) {
                    status.textContent = results.length ? plural(results.length, S.foundOne || '%s', S.foundMany || '%s') : (S.noMatch || '');
                }
            };

            input.addEventListener('input', render);
            input.addEventListener('focus', function () { if (norm(input.value)) render(); });
            input.addEventListener('blur', function () { close(); });
            input.addEventListener('keydown', function (e) {
                var open = !list.hidden;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (!open) {
                        if (!norm(input.value)) return;
                        render();
                    }
                    if (!results.length) return;
                    e.preventDefault();
                    active = e.key === 'ArrowDown'
                        ? (active + 1) % results.length
                        : (active <= 0 ? results.length - 1 : active - 1);
                    mark();
                } else if (e.key === 'Enter') {
                    if (open && results.length) {
                        e.preventDefault();
                        choosePick(results[active >= 0 ? active : 0]);
                    }
                } else if (e.key === 'Escape') {
                    if (open) {
                        e.preventDefault();
                        close();
                    } else if (input.value) {
                        e.preventDefault();
                        input.value = '';
                    }
                }
            });
            if (clear) {
                clear.addEventListener('click', function () {
                    choose('all', '', true);
                    input.focus();
                });
            }
            if (popular) bindChips(popular);

            syncers.push(function (state) {
                if (clear) {
                    var on = state.parent !== 'all';
                    setHidden(clear, !on);
                    var label = on ? nameOf(state.parent, state.sub) : '';
                    if (pick && pick.textContent !== label) pick.textContent = label;
                    root.classList.toggle('mba-pro-catsearch-picked', on);
                }
                if (popular) syncChips(popular, state);
            });
        }

        function setupBar(root) {
            var treat = root.querySelector('select[data-field="treatment"]');
            var countEl = root.querySelector('.mba-pro-catbar-count');
            var clearBtn = root.querySelector('.mba-pro-catbar-clear');
            var inputsFor = function (name) {
                var list = container.querySelectorAll('input[name="' + name + '"]');
                if (!list.length) list = document.querySelectorAll('input[name="' + name + '"]');
                return Array.prototype.slice.call(list);
            };
            var filterSelects = Array.prototype.slice.call(root.querySelectorAll('select[data-input]'));

            // A field whose filter is not on the page (no sidebar checkboxes) goes.
            filterSelects = filterSelects.filter(function (sel) {
                var boxes = inputsFor(sel.getAttribute('data-input'));
                if (boxes.length) {
                    each(sel.options, function (o) {
                        if (o.value && !boxes.some(function (b) { return b.value === o.value; })) o.parentNode.removeChild(o);
                    });
                }
                if (!boxes.length || sel.options.length < 2) {
                    var field = sel.closest('.mba-pro-catbar-field');
                    if (field) field.parentNode.removeChild(field);
                    return false;
                }
                return true;
            });
            root.classList.add('mba-pro-catbar-fields-' + (1 + filterSelects.length));

            if (treat) {
                treat.addEventListener('change', function () {
                    var v = treat.value || 'all';
                    if (v === 'all') {
                        choose('all', '', true);
                    } else if (tops[v]) {
                        choose(v, '', true);
                    } else if (map[v]) {
                        choose(map[v][0], v, true);
                    }
                });
            }

            filterSelects.forEach(function (sel) {
                sel.addEventListener('change', function () {
                    var v = sel.value;
                    if (v === '__several') return;
                    var changed = null;
                    inputsFor(sel.getAttribute('data-input')).forEach(function (cb) {
                        var want = !!v && cb.value === v;
                        if (cb.checked !== want) {
                            cb.checked = want;
                            changed = cb;
                        }
                    });
                    // One change event: the sidebar re-renders the gallery and
                    // updates the shared link, the drawer its count.
                    if (changed) changed.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });

            if (clearBtn) {
                clearBtn.addEventListener('click', function () {
                    filterSelects.forEach(function (sel) {
                        inputsFor(sel.getAttribute('data-input')).forEach(function (cb) { cb.checked = false; });
                    });
                    // Re-renders with the boxes unticked; Pro's link writer and the
                    // drawer count follow the tile click.
                    choose('all', '', true);
                });
            }

            var writeCount = function (n) {
                if (!countEl) return;
                var pattern = n === 1 ? (S.resultOne || '%s') : (S.resultMany || '%s');
                var parts = String(pattern).split('%s');
                var key = n + '|' + pattern;
                if (countEl.getAttribute('data-key') === key) return;
                countEl.setAttribute('data-key', key);
                countEl.textContent = '';
                countEl.appendChild(document.createTextNode(parts[0] || ''));
                var strong = document.createElement('strong');
                strong.textContent = Number(n).toLocaleString();
                countEl.appendChild(strong);
                countEl.appendChild(document.createTextNode(parts.slice(1).join('%s')));
            };

            syncers.push(function (state) {
                if (treat) {
                    each(treat.querySelectorAll('optgroup[data-for]'), function (g) {
                        var hide = isHidden(g.getAttribute('data-for'));
                        setHidden(g, hide);
                        g.disabled = hide;
                    });
                    each(treat.options, function (o) {
                        if (o.value === 'all' || !tops[o.value]) return;
                        var hide = isHidden(o.value);
                        o.hidden = hide;
                        o.disabled = hide;
                    });
                    var want = state.parent === 'all' ? 'all' : (state.sub || state.parent);
                    if (treat.value !== want && treat.querySelector('option[value="' + cssEscape(want) + '"]')) treat.value = want;
                }
                var any = state.parent !== 'all';
                filterSelects.forEach(function (sel) {
                    var checked = inputsFor(sel.getAttribute('data-input')).filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
                    var several = sel.querySelector('option[value="__several"]');
                    var want = checked.length === 0 ? '' : (checked.length === 1 ? checked[0] : '__several');
                    if (want === '__several' && !several) {
                        several = document.createElement('option');
                        several.value = '__several';
                        several.disabled = true;
                        several.textContent = S.several || '';
                        sel.appendChild(several);
                    } else if (want !== '__several' && several) {
                        several.parentNode.removeChild(several);
                    }
                    if (sel.value !== want) sel.value = want;
                    if (checked.length) any = true;
                });
                root.classList.toggle('mba-pro-catbar-active', any);
                var g = cfg();
                var ready = typeof galleryData !== 'undefined' && Array.isArray(galleryData) && galleryData.length > 0;
                writeCount(ready && g && Array.isArray(g.filteredItems) ? g.filteredItems.length : (data.total || 0));
            });
        }

        /* ── Keeping every control in step ──────────────────────────────── */
        var queued = false;
        function sync() {
            queued = false;
            var state = current();
            touchUpPills(state);
            syncers.forEach(function (fn) {
                try { fn(state); } catch (e) {}
            });
        }
        function schedule() {
            if (queued) return;
            queued = true;
            (window.requestAnimationFrame || window.setTimeout)(sync);
        }

        if (typeof MutationObserver !== 'undefined') {
            // Tile active state and hidden (empty) categories.
            new MutationObserver(schedule).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
            // Every render of the cards (category, filters, search, load more).
            var main = container.querySelector('.medbeafgallery-main-content');
            if (main) new MutationObserver(schedule).observe(main, { subtree: true, childList: true });
            // Pro's subcategory pills: inserted after the bar, re-filled per parent.
            var watchedBox = null;
            var watchPills = function () {
                var box = pillsBox();
                if (box && box !== watchedBox) {
                    watchedBox = box;
                    new MutationObserver(schedule).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
                    schedule();
                }
            };
            watchPills();
            new MutationObserver(watchPills).observe(content, { childList: true });
        }
        container.addEventListener('change', schedule, true);
        container.addEventListener('click', function () { setTimeout(schedule, 0); }, true);
        document.addEventListener('medbeafgallery:dataReady', function () { setTimeout(schedule, 0); });
        sync();
    }

    function init() {
        each(document.querySelectorAll('.mba-pro-catnav-mount:not([data-mounted])'), mount);
        each(document.querySelectorAll('.mba-pro-catnav-mount script.mba-pro-catnav-data'), setup);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
