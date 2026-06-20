/**
 * MBA Gallery Pro – Subcategory Pills
 *
 * When a parent category is selected in the carousel, this script fetches
 * its child categories from the Pro REST endpoint and renders them as
 * clickable pill buttons below the category carousel.
 *
 * Filtering strategy:
 * ───────────────────
 * The free plugin's applyAllFilters() first filters by currentCategory,
 * then by currentChildCategory.  A post assigned to child "Leg" (under
 * parent "Body") won't have "Body" in its categories array, so the
 * sequential parent→child filter returns 0 results.
 *
 * Fix: instead of using currentChildCategory, we set currentCategory
 * directly to the child slug.  The "All" pill restores it to the parent
 * slug.  This way the free plugin's existing single-category filter works
 * correctly for both parent and child categories.
 *
 * Requires: the free plugin's gallery.js to be loaded first.
 *
 * @package MBA_Gallery_Pro
 */
(function () {
    'use strict';

    // ── Configuration ────────────────────────────────────────────────
    const REST_BASE = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.restBase)
        ? window.medbeafgalleryGalleryConfig.restBase
        : window.location.origin + '/wp-json/medical-before-after-gallery/v1';

    // Cache: parentSlug → [children]
    let subcategoryCache = {};

    // Track which parent category is currently selected so the "All" pill
    // can restore it after a child pill was active.
    let activeParentSlug = '';

    // ── Bootstrap ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        injectContainer();
        prefetchAllSubcategories();
        observeParentCategoryClicks();
    });

    // ── 1. Inject the subcategory container into the DOM ─────────────
    function injectContainer() {
        const carousel = document.querySelector('.medbeafgallery-category-carousel');
        if (!carousel) return;

        if (document.querySelector('.medbeafgallery-child-categories')) return;

        const container = document.createElement('div');
        container.className = 'medbeafgallery-child-categories';
        container.style.display = 'none';

        carousel.parentNode.insertBefore(container, carousel.nextSibling);
    }

    // ── 2. Pre-fetch all parent→children mappings ────────────────────
    function prefetchAllSubcategories() {
        fetch(REST_BASE + '/subcategories')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (Array.isArray(data)) {
                    data.forEach(function (entry) {
                        if (entry.parent && entry.children && entry.children.length) {
                            subcategoryCache[entry.parent.slug] = entry.children;
                        }
                    });
                }
            })
            .catch(function (err) {
                console.warn('MBA Gallery Pro: Could not prefetch subcategories', err);
            });
    }

    // ── 3. Listen for parent category clicks ─────────────────────────
    function observeParentCategoryClicks() {
        const carousel = document.querySelector('.medbeafgallery-category-carousel');
        if (!carousel) return;

        carousel.addEventListener('click', function (e) {
            const item = e.target.closest('.medbeafgallery-carousel-item');
            if (!item) return;

            const slug = item.getAttribute('data-id');

            // If "All" is clicked, hide subcategories
            if (slug === 'all' || slug === 'ba_category_all') {
                hideSubcategories();
                return;
            }

            // Remember the parent so the "All" pill can restore it
            activeParentSlug = slug;
            showSubcategories(slug);
        });
    }

    // ── 4. Show subcategory pills for a parent ───────────────────────
    function showSubcategories(parentSlug) {
        const container = document.querySelector('.medbeafgallery-child-categories');
        if (!container) return;

        if (subcategoryCache[parentSlug]) {
            renderPills(container, parentSlug, subcategoryCache[parentSlug]);
            return;
        }

        fetch(REST_BASE + '/subcategories?parent=' + encodeURIComponent(parentSlug))
            .then(function (res) { return res.json(); })
            .then(function (children) {
                if (!Array.isArray(children)) children = [];
                subcategoryCache[parentSlug] = children;
                renderPills(container, parentSlug, children);
            })
            .catch(function () {
                container.style.display = 'none';
            });
    }

    // ── 5. Render the pill buttons ───────────────────────────────────
    function renderPills(container, parentSlug, children) {
        container.innerHTML = '';

        // Filter out children with 0 posts
        var visibleChildren = children.filter(function (child) {
            return child.count && child.count > 0;
        });

        // Hide if no children have posts
        if (!visibleChildren.length) {
            container.style.display = 'none';
            return;
        }

        // "All" pill — shows all items in the parent category
        var allPill = createPill({ slug: '', name: 'All', count: null }, true, parentSlug);
        container.appendChild(allPill);

        // Individual child pills
        visibleChildren.forEach(function (child) {
            container.appendChild(createPill(child, false, parentSlug));
        });

        container.style.display = 'flex';

        // Animate in
        container.classList.remove('mba-pro-pills-enter');
        void container.offsetWidth; // trigger reflow
        container.classList.add('mba-pro-pills-enter');
    }

    function createPill(child, isAll, parentSlug) {
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'mba-pro-subcategory-pill' + (isAll ? ' active' : '');
        pill.setAttribute('data-slug', child.slug);

        var label = child.name;
        if (child.count !== null && child.count !== undefined) {
            label += ' <span class="mba-pro-pill-count">(' + child.count + ')</span>';
        }
        pill.innerHTML = label;

        pill.addEventListener('click', function () {
            // Update active state on pills
            var allPills = pill.parentNode.querySelectorAll('.mba-pro-subcategory-pill');
            allPills.forEach(function (p) { p.classList.remove('active'); });
            pill.classList.add('active');

            if (typeof galleryConfig !== 'undefined') {
                // Always clear currentChildCategory to avoid double-filtering
                galleryConfig.currentChildCategory = '';

                if (isAll) {
                    // "All" pill → restore parent category
                    galleryConfig.currentCategory = parentSlug;
                } else {
                    // Child pill → set currentCategory to the child slug directly
                    // so the free plugin's single-category filter finds matching posts
                    galleryConfig.currentCategory = child.slug;
                }
            }

            // Re-render gallery
            if (typeof renderGalleryItems === 'function') {
                renderGalleryItems();
            }
        });

        return pill;
    }

    // ── 6. Hide subcategory pills ────────────────────────────────────
    function hideSubcategories() {
        var container = document.querySelector('.medbeafgallery-child-categories');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }

        activeParentSlug = '';

        if (typeof galleryConfig !== 'undefined') {
            galleryConfig.currentChildCategory = '';
        }
    }

})();
