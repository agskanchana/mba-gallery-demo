let galleryData = []; // This will be populated from the API
// Global REST API base URL for MEDBEAFGALLERY Gallery
const medbeafgalleryRestBase = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.restBase)
    ? window.medbeafgalleryGalleryConfig.restBase
    : `${window.location.origin}/wp-json/medical-before-after-gallery/v1`;// Add these global variables and functions at the top of your script
let modalPortal = null;
let originalModalContainer = null;
// Timer for the delayed move back out of the portal after closing. Kept so a
// case opened during the close transition can cancel it (otherwise the move
// would pull the newly opened window out of its portal and leave it invisible).
let medbeafgalleryModalRestoreTimer = null;

// Add this variable to store category relationships
let categoryRelationships = {};

// Global modal state variables
let currentItemId = null;
let currentViewMode = 'split'; // 'split', 'before', or 'after'
let currentPairIndex = 0; // Track which image pair is currently displayed

// Create the fixed-position container the modal is moved into while open, so
// it escapes any theme wrapper with overflow/transform that would clip it.
// z-index 99999: ties with the admin bar and fixed theme headers (Divi and
// others use 99999) and wins, because the portal is the last child of <body>;
// stays under Pro's layers (100000+), e.g. its consent notice in every version.
function createModalPortal() {
    const existing = document.getElementById('medbeafgallery-modal-portal');
    if (existing) {
        return existing;
    }

    const portal = document.createElement('div');
    portal.id = 'medbeafgallery-modal-portal';
    portal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 99999;
        display: none;
    `;

    document.body.appendChild(portal);
    return portal;
}

// Move modal to portal when opening
function moveModalToPortal() {
    // Create portal if it doesn't exist
    if (!modalPortal) {
        modalPortal = createModalPortal();
    }

    // Last child of <body> again, so it also wins the z-index tie against layers
    // that scripts added after page load (sticky headers, banners).
    if (document.body && document.body.lastElementChild !== modalPortal) {
        document.body.appendChild(modalPortal);
    }

    // Get the original modal
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal) return;

    // Store the original parent for later restoration. Opened again before the
    // last close finished: it is still in the portal, and its parent is the
    // portal itself, which must not replace the real container.
    if (modal.parentNode !== modalPortal) {
        originalModalContainer = modal.parentNode;
    }

    // Move modal to portal
    modalPortal.appendChild(modal);
    modalPortal.style.display = 'block';
}

// Restore modal to original position when closing
function restoreModalPosition() {
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal || !originalModalContainer || !modalPortal) return;

    // Opened again since the close: it must stay in the portal.
    if (modal.classList.contains('active')) return;

    // Move modal back to original container
    originalModalContainer.appendChild(modal);

    // Hide portal
    modalPortal.style.display = 'none';
}

// Escape a value for safe interpolation into an HTML attribute inside a
// template literal. Titles and alt text come from post meta, so a stray quote
// would otherwise break out of the attribute.
//
// WordPress hands these values over already entity-encoded ("Smith &#038; Co"),
// so decode first — escaping the raw string would double-encode the ampersand
// and the alt text would literally read "&#038;".
function medbeafgalleryEscapeAttr(str) {
    if (str === null || str === undefined) return '';
    return medbeafgalleryDecodeEntities(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Add this function to load category data
function loadCategoryRelationships() {
// Get the correct REST API base URL
const medbeafgalleryRestBase = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.restBase) ? window.medbeafgalleryGalleryConfig.restBase : `${window.location.origin}/wp-json/medical-before-after-gallery/v1`;

return fetch(`${medbeafgalleryRestBase}/categories`)
        .then(response => response.json())
        .then(categories => {
            // Create a map of parent categories to their children
            categories.forEach(cat => {
                if (cat.parent !== 0) {
                    // Find parent category
                    const parentCat = categories.find(p => p.id === cat.parent);
                    if (parentCat) {
                        // Initialize array if needed
                        if (!categoryRelationships[parentCat.slug]) {
                            categoryRelationships[parentCat.slug] = [];
                        }
                        // Add this child category to the parent's array
                        categoryRelationships[parentCat.slug].push(cat.slug);
                    }
                }
            });

            return categoryRelationships;
        });
}

// Replace the document ready function with this updated version

// Modify the document ready function to fetch data first
document.addEventListener("DOMContentLoaded", function() {
    // Show loading indicators
    const loadingIndicator = document.querySelector('.medbeafgallery-loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    const galleryGrid = document.getElementById('medbeafgallery-gallery-grid');
    if (galleryGrid) galleryGrid.style.display = 'none';

    // Get configuration from the container. The data-category / data-per-page
    // attributes (the shortcode's default_category and items_per_page) live on
    // the inner .medbeafgallery-gallery-container; this used to query the outer
    // .medbeafgallery-container, which has neither, so both attributes were
    // silently ignored (6 per page, starting on "All", whatever was set).
    const galleryContainer = document.querySelector('.medbeafgallery-gallery-container[data-per-page]')
        || document.querySelector('.medbeafgallery-container');
    if (galleryContainer) {
        if (galleryContainer.dataset.category) {
            galleryConfig.currentCategory = galleryContainer.dataset.category;
        } else {
            // Set default to 'all' if not specified
            galleryConfig.currentCategory = 'all';
        }

        if (galleryContainer.dataset.perPage) {
            galleryConfig.itemsPerPage = parseInt(galleryContainer.dataset.perPage);
        }
    }

    // Fetch data from the API before initializing the gallery
    fetchGalleryData().then(() => {

        // Initialize the carousel functionality
        initCarouselNavigation();

        // Initialize carousel item events including child category handling
        addCarouselItemEvents();

        // Initialize the gallery display
        initGallery();

        // Gallery initialized successfully

        // Initialize the Clear All button
        initClearAllButton();

        // Initialize modal functionality
        initModal();

        // Keep aria-pressed / aria-selected in step with the .active class
        medbeafgalleryObserveToggleState();

    }).catch(error => {
        console.error("Error initializing gallery:", error);

        // Show error message in case of failure
        if (galleryGrid) {
            const loadingIndicator = document.querySelector('.medbeafgallery-loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';

            galleryGrid.style.display = 'block';
            galleryGrid.innerHTML = `
                <div class="medbeafgallery-error-message">
                    <p>Error loading gallery data. Please try again later.</p>
                    <p class="medbeafgallery-error-details">${error.message}</p>
                </div>
            `;
        }
    });

    // Initialize modal portal
    createModalPortal();

    // Add event listener for modal close button
    const closeBtn = document.querySelector('.medbeafgallery-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Add click outside to close modal
    document.addEventListener('mousedown', function(e) {
        const modal = document.getElementById('medbeafgallery-modal');
        if (modal && modal.classList.contains('active')) {
            const modalContent = modal.querySelector('.medbeafgallery-modal-content');
            if (modalContent && !modalContent.contains(e.target) && e.target === modal) {
                closeModal();
            }
        }
    });

    // Debug category structure
    debugCategoryStructure();

    // Load category relationships
    loadCategoryRelationships().then(() => {
    });
});

// Map each category slug to the slugs of every category beneath it (all levels),
// from the /categories response (each term carries its parent's term id).
function medbeafgalleryCategoryDescendants(categories) {
    const list = Array.isArray(categories) ? categories : [];
    const slugById = {};
    const childrenOf = {};
    list.forEach(cat => {
        if (cat && cat.slug) {
            slugById[cat.id] = cat.slug;
        }
    });
    list.forEach(cat => {
        const parentSlug = cat && cat.parent ? (cat.parent_slug || slugById[cat.parent]) : '';
        if (parentSlug) {
            (childrenOf[parentSlug] = childrenOf[parentSlug] || []).push(cat.slug);
        }
    });
    const descendants = {};
    Object.keys(childrenOf).forEach(slug => {
        const seen = new Set([slug]);
        const stack = childrenOf[slug].slice();
        const found = [];
        while (stack.length) {
            const next = stack.pop();
            if (seen.has(next)) {
                continue;
            }
            seen.add(next);
            found.push(next);
            (childrenOf[next] || []).forEach(child => stack.push(child));
        }
        descendants[slug] = found;
    });
    return descendants;
}

// Over the free plan's limits (a lapsed Pro licence) only the first cases load,
// while the server renders a tile for every category with cases: hide the tiles
// none of the loaded cases belong to, so no tile opens an empty gallery. With
// every case loaded this hides nothing.
function medbeafgalleryHideEmptyCategoryTiles(cases) {
    const present = new Set();
    cases.forEach(item => {
        (item.categories || []).forEach(cat => {
            if (cat && cat.slug) present.add(cat.slug);
        });
        if (item.category) present.add(item.category);
    });

    document.querySelectorAll('.medbeafgallery-carousel-item[data-id]').forEach(tile => {
        const slug = tile.getAttribute('data-id');
        if (!slug || slug === 'all' || slug === 'ba_category_all') return;

        const slugs = [slug].concat((galleryConfig.categoryDescendants && galleryConfig.categoryDescendants[slug]) || []);
        if (!slugs.some(s => present.has(s))) {
            // Inline !important: the tiles' own display rule is !important too.
            tile.style.setProperty('display', 'none', 'important');
        }
    });
}

// The category bar's drop-down style. The select drives the same tiles every
// other style uses (they stay in the page, hidden), so category filtering, the
// Pro add-on's subcategories and deep links all keep working through one path.
function medbeafgalleryInitCategorySelects() {
    document.querySelectorAll('.medbeafgallery-category-select').forEach(select => {
        if (select.dataset.medbeafgalleryBound) return;
        select.dataset.medbeafgalleryBound = '1';

        const bar = select.closest('.medbeafgallery-category-carousel');
        if (!bar) return;
        const tileFor = slug => Array.from(bar.querySelectorAll('.medbeafgallery-carousel-item[data-id]'))
            .find(tile => tile.getAttribute('data-id') === slug);

        select.addEventListener('change', () => {
            const tile = tileFor(select.value);
            if (tile && !tile.classList.contains('active')) tile.click();
        });

        const sync = () => {
            const active = bar.querySelector('.medbeafgallery-carousel-item.active[data-id]');
            if (active && select.value !== active.getAttribute('data-id')) {
                select.value = active.getAttribute('data-id');
            }
            // Categories none of the loaded cases use are hidden as tiles
            // (medbeafgalleryHideEmptyCategoryTiles); leave them out here too.
            Array.from(select.options).forEach(option => {
                const tile = tileFor(option.value);
                const empty = !!(tile && tile.style.getPropertyValue('display') === 'none');
                option.hidden = empty;
                option.disabled = empty;
            });
        };

        // Watches class/style only, so updating the options cannot retrigger it.
        new MutationObserver(sync).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        sync();
    });
}

// Modify the fetchGalleryData function to not recreate the carousel

async function fetchGalleryData() {
    try {
        // Fetch categories (we still need this data)
        const categoriesResponse = await fetch(`${medbeafgalleryRestBase}/categories`);
        const categories = await categoriesResponse.json();

        // Known before the first render, so a parent category matches its
        // subcategories' cases from the very first click. The page carries the
        // whole tree (shortcodes.php); /categories — capped at four categories on
        // the free plan — is only the fallback, for pages that do not.
        const pageTree = window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.categoryDescendants;
        galleryConfig.categoryDescendants = (pageTree && typeof pageTree === 'object' && !Array.isArray(pageTree) && Object.keys(pageTree).length)
            ? pageTree
            : medbeafgalleryCategoryDescendants(categories);

        // Fetch gallery items
        const galleryResponse = await fetch(`${medbeafgalleryRestBase}/gallery-data`);
        const galleryResult = await galleryResponse.json();

        // Before the carousel is wired up, so it works with the final set of tiles.
        medbeafgalleryHideEmptyCategoryTiles(galleryResult.cases || []);

        // DON'T re-create the carousel, just add events to existing elements
        initCarouselInteractions();
        medbeafgalleryInitCategorySelects();

        // Process gallery data
        galleryData = galleryResult.cases.map(item => {
            // Find the category information
            const category = categories.find(cat => cat.slug === item.category) || {};

            // Add the category name to each item. The REST data already names it;
            // the lookup misses whenever /categories was capped by the free plan.
            return {
                ...item,
                categoryName: category.name || item.categoryName || 'Uncategorized'
            };
        });

        // Initialize items with all items from the selected category
        galleryConfig.filteredItems = [...galleryData];
        galleryConfig.totalPages = Math.ceil(galleryConfig.filteredItems.length / galleryConfig.itemsPerPage);

        // Render initial gallery items
        renderGalleryItems();

        // Signal that gallery data is loaded and rendered, so add-ons (e.g. the
        // Pro deep-linking feature) can safely restore state or open a modal.
        document.dispatchEvent(new CustomEvent('medbeafgallery:dataReady'));

        return galleryData;
    } catch (error) {
        console.error("Error fetching gallery data:", error);
        // The indicator is absent on some layouts; guard so we don't throw a
        // second error from inside the handler and lose the original one.
        const indicator = document.querySelector('.medbeafgallery-loading-indicator');
        if (indicator) {
            indicator.innerHTML = '<p>Error loading gallery. Please refresh the page and try again.</p>';
        }
    }
}

// New function to initialize carousel interactions
function initCarouselInteractions() {
    // Get carousel elements
    const carouselWrapper = document.getElementById('medbeafgallery-carousel-wrapper');
    const carouselItems = document.querySelectorAll('.medbeafgallery-carousel-item');
    const prevBtn = document.querySelector('.medbeafgallery-prev-btn');
    const nextBtn = document.querySelector('.medbeafgallery-next-btn');

    if (!carouselWrapper || !carouselItems.length) return;

    // Add click events to carousel items
    carouselItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all carousel items
            document.querySelectorAll('.medbeafgallery-carousel-item').forEach(el => {
                el.classList.remove('active');
            });

            // Add active class to clicked item
            this.classList.add('active');

            // Get category slug from data-id
            const categorySlug = this.dataset.id;

            // Update current category
            galleryConfig.currentCategory = categorySlug;
            galleryConfig.currentChildCategory = '';

            // Category changed, render new items
            renderGalleryItems();

            // Scroll to gallery
            scrollToGallery();
        });
    });

    // Add click events to navigation buttons
    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            const scrollAmount = carouselWrapper.clientWidth * 0.8;
            carouselWrapper.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            const scrollAmount = carouselWrapper.clientWidth * 0.8;
            carouselWrapper.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        });
    }

    // Initialize the scroll position based on active item
    const activeItem = document.querySelector('.medbeafgallery-carousel-item.active');
    if (activeItem) {
        const containerWidth = carouselWrapper.clientWidth;
        const itemLeft = activeItem.offsetLeft;
        const itemWidth = activeItem.offsetWidth;
        const scrollTo = itemLeft - (containerWidth / 2) + (itemWidth / 2);
        carouselWrapper.scrollLeft = Math.max(0, scrollTo);
    }
}

// Update the addCarouselItemEvents function to clear child category selection
function addCarouselItemEvents() {
    const carouselItems = document.querySelectorAll('.medbeafgallery-carousel-item');

    carouselItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all items
            document.querySelectorAll('.medbeafgallery-carousel-item').forEach(el => {
                el.classList.remove('active');
            });

            // Add active class to clicked item
            this.classList.add('active');

            // Get category ID (slug)
            const categoryId = this.getAttribute('data-id');



            // IMPORTANT FIX: Clear the child category filter when selecting a new category
            galleryConfig.currentChildCategory = '';

            // Also uncheck any child category checkboxes that might be selected
            document.querySelectorAll('input[name="child_category"]').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Update current category
            galleryConfig.currentCategory = categoryId;

            // Load child categories if this is a parent category
            // Render gallery items for the selected category
            renderGalleryItems();
        });
    });
}

// Get pagination info
// Category navigation function - handles both grid and carousel modes
// Carousel navigation function
function initCarouselNavigation() {
    const wrapper = document.querySelector('.medbeafgallery-carousel-wrapper');
    const prevBtn = document.querySelector('.medbeafgallery-prev-btn');
    const nextBtn = document.querySelector('.medbeafgallery-next-btn');
    const carouselItems = document.querySelectorAll('.medbeafgallery-carousel-item');

    if (!wrapper || !prevBtn || !nextBtn) return;

    function updateNavigation() {
        const scrollLeft = wrapper.scrollLeft;
        const scrollWidth = wrapper.scrollWidth;
        const clientWidth = wrapper.clientWidth;

        prevBtn.disabled = scrollLeft <= 0;
        nextBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
    }

    function scrollCarousel(direction) {
        const scrollAmount = wrapper.clientWidth * 0.8;
        wrapper.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });
    }

    // Event Listeners for navigation buttons
    prevBtn.addEventListener('click', () => scrollCarousel(-1));
    nextBtn.addEventListener('click', () => scrollCarousel(1));

    // Category selection
    carouselItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all items
            carouselItems.forEach(el => el.classList.remove('active'));

            // Add active class to clicked item
            this.classList.add('active');

            // Get category slug
            const categorySlug = this.getAttribute('data-id');

            // Update gallery config
            galleryConfig.currentCategory = categorySlug;
            galleryConfig.currentChildCategory = '';

            // Render gallery items
            renderGalleryItems();

            // Scroll to gallery on mobile
            if (window.innerWidth <= 768) {
                scrollToGallery();
            }
        });
    });

    // Update navigation on scroll
    wrapper.addEventListener('scroll', updateNavigation);

    // Update navigation on resize
    const resizeObserver = new ResizeObserver(updateNavigation);
    resizeObserver.observe(wrapper);

    // Initial check
    updateNavigation();

    // Update after images load
    window.addEventListener('load', updateNavigation);
}

// Gallery configuration
const galleryConfig = {
    itemsPerPage: 6,
    currentPage: 1,
    currentCategory: 'ba_category_all',
    currentChildCategory: '', // Add this line for child category tracking
    categoryDescendants: {}, // slug → every subcategory slug beneath it
    totalPages: 1,
    filteredItems: []
};

// Initialize the gallery
function initGallery() {
    const galleryGrid = document.getElementById('medbeafgallery-gallery-grid');
    const loadMoreBtn = document.getElementById('medbeafgallery-load-more');

    if (!galleryGrid || !loadMoreBtn) return;

    // Set initial filtered items to all items
    galleryConfig.filteredItems = [...galleryData];
    galleryConfig.totalPages = Math.ceil(galleryConfig.filteredItems.length / galleryConfig.itemsPerPage);

    // Render initial gallery items
    renderGalleryItems();

    // Add event listener to the Load More button
    loadMoreBtn.addEventListener('click', function() {
        if (galleryConfig.currentPage < galleryConfig.totalPages) {
            galleryConfig.currentPage++;
            renderGalleryItems(true); // append = true

            // Hide button if we've loaded all pages
            if (galleryConfig.currentPage >= galleryConfig.totalPages) {
                loadMoreBtn.style.display = 'none';
            }
        }
    });
}

// Fix the category filtering in applyAllFilters function
function applyAllFilters() {

    // Reset pagination
    galleryConfig.currentPage = 1;

    // Start with all items
    let filteredItems = [...galleryData];


    // Filter by category. A parent also matches the cases filed only under its
    // subcategories — otherwise choosing "Face" hid every "Rhinoplasty" case.
    if (galleryConfig.currentCategory !== 'all' && galleryConfig.currentCategory !== 'ba_category_all') {
        const wanted = [galleryConfig.currentCategory].concat(
            (galleryConfig.categoryDescendants && galleryConfig.categoryDescendants[galleryConfig.currentCategory]) || []
        );
        filteredItems = filteredItems.filter(item => {
            // Check if item belongs to the selected category
            if (item.categories && item.categories.length > 0) {
                return item.categories.some(cat => wanted.includes(cat.slug));
            }
            // Fallback to checking item.category property
            return wanted.includes(item.category);
        });
    }

    // Filter by child category if selected
    if (galleryConfig.currentChildCategory) {
        filteredItems = filteredItems.filter(item => {
            if (item.categories && item.categories.length > 0) {
                return item.categories.some(cat => cat.slug === galleryConfig.currentChildCategory);
            }
            return item.category === galleryConfig.currentChildCategory;
        });
    }

    // Get selected filters
    const selectedGenders = getSelectedValues('gender');
    const selectedAges = getSelectedValues('age');
    const selectedRecovery = getSelectedValues('recovery');
    const selectedDuration = getSelectedValues('duration');
    const selectedResults = getSelectedValues('results');
    const selectedProcedure = getSelectedValues('procedure');

    // Apply each filter if values are selected
    if (selectedGenders.length > 0) {
        filteredItems = filteredItems.filter(item => selectedGenders.includes(item.gender));
    }

    if (selectedAges.length > 0) {
        filteredItems = filteredItems.filter(item => {
            if (!item.age) return false;
            const age = parseInt(item.age);
            return selectedAges.some(ageRange => {
                switch (ageRange) {
                    case '18-30': return age >= 18 && age <= 30;
                    case '31-45': return age >= 31 && age <= 45;
                    case '46-60': return age >= 46 && age <= 60;
                    case '60+': return age > 60;
                    default: return false;
                }
            });
        });
    }

    if (selectedRecovery.length > 0) {
        filteredItems = filteredItems.filter(item => selectedRecovery.includes(item.recovery));
    }

    if (selectedDuration.length > 0) {
        filteredItems = filteredItems.filter(item => selectedDuration.includes(item.duration));
    }

    if (selectedResults.length > 0) {
        filteredItems = filteredItems.filter(item => selectedResults.includes(item.results));
    }

    if (selectedProcedure.length > 0) {
        filteredItems = filteredItems.filter(item => selectedProcedure.includes(item.procedure) || selectedProcedure.includes(item.procedureType));
    }


    // Extension seam: allow add-ons (e.g. the Pro search/sort) to transform the
    // filtered set before it is committed. Harmless when no add-on is present.
    if (Array.isArray(window.medbeafgalleryItemTransforms)) {
        window.medbeafgalleryItemTransforms.forEach(function (fn) {
            try {
                filteredItems = fn(filteredItems) || filteredItems;
            } catch (e) {
                console.error('medbeafgallery item transform failed:', e);
            }
        });
    }

    // Update filtered items
    galleryConfig.filteredItems = filteredItems;
    galleryConfig.totalPages = Math.ceil(filteredItems.length / galleryConfig.itemsPerPage);

    // Update filter tags
    updateFilterTags();

}

// Helper function to get selected filter values
function getSelectedValues(name) {
    const values = [];
    document.querySelectorAll(`input[name="${name}"]:checked`).forEach(input => {
        values.push(input.value);
    });
    return values;
}

// Hide child categories section
function hideChildCategoriesSection() {
    const section = document.querySelector('.medbeafgallery-child-categories');
    if (section) {
        section.style.display = 'none';
    }
}

// Render gallery items
function renderGalleryItems(append = false) {
    const galleryGrid = document.getElementById('medbeafgallery-gallery-grid');
    const loadMoreBtn = document.getElementById('medbeafgallery-load-more');
    const noResultsMsg = document.getElementById('medbeafgallery-no-results');
    const loadingIndicator = document.querySelector('.medbeafgallery-loading-indicator');

    if (!galleryGrid) return;

    // Apply filters first if not appending and we have data
    if (!append && galleryData.length > 0) {
        applyAllFilters();
        // Don't return here - continue with rendering the filtered items
    }

    // Hide loading indicator and show gallery grid
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    galleryGrid.style.display = 'grid'; // Make sure grid is visible

    // Expose the grid as a list so screen readers announce how many cases there
    // are. The CSS grid display would otherwise suppress the implicit semantics.
    galleryGrid.setAttribute('role', 'list');

    // Clear the gallery if not appending
    if (!append) {
        galleryGrid.innerHTML = '';
    }

    // Calculate slice indices
    const startIndex = append
        ? (galleryConfig.currentPage - 1) * galleryConfig.itemsPerPage
        : 0;
    const endIndex = galleryConfig.currentPage * galleryConfig.itemsPerPage;

    // Get items for current page
    const itemsToShow = galleryConfig.filteredItems.slice(startIndex, endIndex);

    // Show/hide no results message
    if (noResultsMsg) {
        if (galleryConfig.filteredItems.length === 0) {
            noResultsMsg.style.display = 'block';
            loadMoreBtn.style.display = 'none';
        } else {
            noResultsMsg.style.display = 'none';
        }
    }

    // Create and append gallery items
    itemsToShow.forEach(item => {
        const galleryItem = createGalleryItem(item);
        if (galleryItem) { // Only append valid items
            galleryGrid.appendChild(galleryItem);
        }
    });

    // Update load more button visibility
    if (galleryConfig.filteredItems.length <= galleryConfig.currentPage * galleryConfig.itemsPerPage) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'block';
    }
}

// Enhanced gallery item rendering function
function createGalleryItem(item) {
    const galleryItem = document.createElement('div');
    galleryItem.className = 'medbeafgallery-gallery-item';
    galleryItem.dataset.id = item.id;
    galleryItem.dataset.category = item.category;

    // Determine if this item has multiple image pairs
    const hasMultiplePairs = item.imagePairs && item.imagePairs.length > 0;
    const multiViewBadge = hasMultiplePairs ?
        `<div class="medbeafgallery-multi-view-indicator">
           <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
        </svg>
            <span>${item.imagePairs ? item.imagePairs.length : 1} more</span>
         </div>` : '';

    // Extract attributes for metadata display
    const ageValue = item.age ? `${item.age} years` : '';
    const genderDisplay = item.gender === 'male' ? 'Male' : (item.gender === 'female' ? 'Female' : '');
    const procedureType = item.procedureType || '';

    // Use the alt text the REST layer already resolved (custom alt, falling back
    // to a generated "Before photo - {title}"). Skip the <img> entirely when the
    // attachment has been deleted, otherwise src would be the string "false".
    const beforeAlt = medbeafgalleryEscapeAttr(item.beforeAlt || 'Before image');
    const afterAlt = medbeafgalleryEscapeAttr(item.afterAlt || 'After image');

    // Cards draw into a ~200px slot, so prefer the card-sized variant. Falls back
    // to the full-size URL when the REST response predates beforeThumb/afterThumb.
    const beforeSrc = item.beforeThumb || item.beforeImg;
    const afterSrc = item.afterThumb || item.afterImg;

    const beforeTag = beforeSrc
        ? `<img src="${medbeafgalleryEscapeAttr(beforeSrc)}" alt="${beforeAlt}" class="medbeafgallery-preview-before" loading="lazy" decoding="async">`
        : '<div class="medbeafgallery-preview-before medbeafgallery-preview-missing" aria-hidden="true"></div>';
    const afterTag = afterSrc
        ? `<img src="${medbeafgalleryEscapeAttr(afterSrc)}" alt="${afterAlt}" class="medbeafgallery-preview-after" loading="lazy" decoding="async">`
        : '<div class="medbeafgallery-preview-after medbeafgallery-preview-missing" aria-hidden="true"></div>';

    // "View Details" alone is the accessible name on every card, which is
    // useless in a screen reader's button list — qualify it with the case title.
    const safeTitle = medbeafgalleryEscapeAttr(item.title);
    const safeCategory = medbeafgalleryEscapeAttr(item.categoryName || item.category);

    galleryItem.setAttribute('role', 'listitem');

    // Design → Card Style "Hover reveal": a Before/After chip that follows the wipe.
    const cfg = (typeof medbeafgalleryGalleryConfig !== 'undefined' && medbeafgalleryGalleryConfig) || {};
    const revealCards = cfg.cardStyle === 'reveal' && !!beforeSrc && !!afterSrc;
    const stateChip = revealCards
        ? `<span class="medbeafgallery-card-state" aria-hidden="true"><span class="medbeafgallery-card-state-before">${medbeafgalleryEscapeAttr(cfg.beforeLabel || cfg.beforeText || 'Before')}</span><span class="medbeafgallery-card-state-after">${medbeafgalleryEscapeAttr(cfg.afterLabel || cfg.afterText || 'After')}</span></span>`
        : '';
    // Hover-reveal cards show each photo whole, over a blurred copy of itself
    // that fills the frame (no part of a result cropped away). The after copy
    // wipes in with the after photo.
    const revealBackdrop = (src, side) => revealCards
        ? `<img src="${medbeafgalleryEscapeAttr(src)}" alt="" aria-hidden="true" class="medbeafgallery-preview-backdrop medbeafgallery-preview-backdrop-${side}" loading="lazy" decoding="async">`
        : '';
    if (revealCards) {
        galleryItem.classList.add('medbeafgallery-reveal-card');
    }

    // Create the gallery item HTML
    galleryItem.innerHTML = `
        <div class="medbeafgallery-gallery-image-container">
            ${multiViewBadge}
            <div class="medbeafgallery-preview-container">
                ${revealBackdrop(beforeSrc, 'before')}
                ${beforeTag}
                <div class="medbeafgallery-preview-divider" aria-hidden="true"></div>
                ${revealBackdrop(afterSrc, 'after')}
                ${afterTag}
                ${stateChip}
            </div>
            <button type="button" class="medbeafgallery-gallery-view-btn" data-id="${item.id}" aria-label="View details for ${safeTitle}">
                <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                View Details
            </button>
        </div>
        <div class="medbeafgallery-gallery-item-info">
            <span class="medbeafgallery-gallery-category">${safeCategory}</span>
            <h3>${safeTitle}</h3>

        </div>
    `;

    if (revealCards) {
        medbeafgalleryInitRevealCard(galleryItem, item.id);
    }
    // (medbeafgalleryInitRevealCard and the one-time wipe are defined after this function.)

    // Add click event listener to the view button
    const viewBtn = galleryItem.querySelector('.medbeafgallery-gallery-view-btn');
    viewBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openModal(item.id);
    });

    // Make entire item clickable but avoid double-triggering with the button
    galleryItem.addEventListener('click', function(e) {
        // Only trigger if the click wasn't on the button or its children
        if (!e.target.closest('.medbeafgallery-gallery-view-btn')) {
            openModal(item.id);
        }
    });

    return galleryItem;
}

/* ── Hover-reveal cards (Design → Card Style) ─────────────────────────────────
   The card shows the before photo; the after photo wipes in on hover or
   keyboard focus (CSS), on a press-and-hold on touch screens (here), and by
   itself on ONE card per page view — the first one that scrolls into view — to
   show visitors that the photo changes. Every card doing it (each new batch
   while scrolling) read as the grid flickering. Visitors who ask for reduced
   motion get no automatic wipe.
   ────────────────────────────────────────────────────────────────────────── */

const medbeafgalleryPeekedIds = new Set();
let medbeafgalleryPeekObserver = null;
let medbeafgalleryPeekPlayed = false;

function medbeafgalleryInitRevealCard(card, caseId) {
    const area = card.querySelector('.medbeafgallery-gallery-image-container');
    if (!area) return;

    // Touch: press and hold to see the after photo; a quick tap still opens the case.
    let holdTimer = null;
    let held = false;
    const endHold = () => {
        clearTimeout(holdTimer);
        holdTimer = null;
        if (held) card.classList.remove('is-revealed');
    };
    area.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        held = false;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            held = true;
            card.classList.add('is-revealed');
        }, 280);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => area.addEventListener(type, endHold));
    area.addEventListener('contextmenu', (e) => {
        if (holdTimer || held) e.preventDefault();
    });
    // The click that ends a hold must not open the case.
    card.addEventListener('click', (e) => {
        if (held) {
            held = false;
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    medbeafgalleryObservePeek(card, caseId);
}

function medbeafgalleryObservePeek(card, caseId) {
    if (!('IntersectionObserver' in window)) return;
    if (medbeafgalleryPeekPlayed) return;
    if (medbeafgalleryPeekedIds.has(String(caseId))) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (!medbeafgalleryPeekObserver) {
        medbeafgalleryPeekObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting || medbeafgalleryPeekPlayed) return;
                const el = entry.target.closest('.medbeafgallery-gallery-item') || entry.target;
                const id = el.dataset.id;
                if (medbeafgalleryPeekedIds.has(id)) return;
                medbeafgalleryPeekedIds.add(id);
                // One card per page view: stop watching the rest.
                medbeafgalleryPeekPlayed = true;
                medbeafgalleryPeekObserver.disconnect();

                const delay = 300;
                const play = () => setTimeout(() => {
                    if (!el.isConnected || el.matches(':hover')) return;
                    el.classList.add('is-peeking');
                    setTimeout(() => el.classList.remove('is-peeking'), 2200);
                }, delay);
                const afterImg = el.querySelector('img.medbeafgallery-preview-after');
                if (afterImg && !afterImg.complete) {
                    afterImg.addEventListener('load', play, { once: true });
                } else {
                    play();
                }
            });
        }, { threshold: 0.5 });
    }
    // Watch the photo, not the whole card: with longer card text (Pro) half a
    // card can be below the fold while its photo is fully in view.
    medbeafgalleryPeekObserver.observe(card.querySelector('.medbeafgallery-gallery-image-container') || card);
}

/* ── Modal focus management ──────────────────────────────────────────────────
   The modal is a dialog, so keyboard focus has to move into it on open, stay
   inside it while it is open, and return to whatever opened it on close.
   Without this, keyboard and screen-reader users tab straight through into the
   page behind the overlay.
   ────────────────────────────────────────────────────────────────────────── */

// Element that had focus before the modal opened, so we can restore it.
let medbeafgalleryLastFocused = null;

const MEDBEAFGALLERY_FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function medbeafgalleryFocusableIn(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(MEDBEAFGALLERY_FOCUSABLE))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
}

// Keep Tab inside the modal while it is open.
function medbeafgalleryTrapFocus(e) {
    if (e.key !== 'Tab') return;

    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal || !modal.classList.contains('active')) return;

    const focusable = medbeafgalleryFocusableIn(modal);
    if (!focusable.length) {
        e.preventDefault();
        modal.focus();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}
document.addEventListener('keydown', medbeafgalleryTrapFocus);

/* ── Carousel + toggle accessibility ─────────────────────────────────────────
   Category tiles are divs carrying role="button", so the browser gives them no
   keyboard behaviour of its own — Enter and Space have to be wired up by hand.
   Several places in this file (and in the Pro add-on) toggle the .active class
   on those tiles, so rather than patch every one, a MutationObserver mirrors
   .active onto aria-pressed wherever it changes.
   ────────────────────────────────────────────────────────────────────────── */

/* Share buttons, bound once by delegation.
   These used to carry an inline onclick AND get an addEventListener, so every
   click fired shareOnSocial() twice — two popup windows, or two mailto: calls.
   Delegation also fixes the other half of that bug: the old code used
   querySelector(), so when a page held both the gallery modal and the Pro
   carousel modal, only the first set of buttons was ever wired up. */
function medbeafgalleryBindShareButtons() {
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.medbeafgallery-share-btn');
        if (!btn) return;

        // The Pro add-on's carousel modal (Pro 1.4.1 and older) still prints
        // onclick="shareOnSocial(...)" on these buttons. That inline handler
        // already shares; handling the click here too would share twice.
        if (btn.hasAttribute('onclick')) return;

        e.preventDefault();

        if (btn.classList.contains('medbeafgallery-share-facebook')) {
            shareOnSocial('facebook');
        } else if (btn.classList.contains('medbeafgallery-share-twitter')) {
            shareOnSocial('twitter');
        } else if (btn.classList.contains('medbeafgallery-share-email')) {
            shareOnSocial('email');
        }
    });
}
medbeafgalleryBindShareButtons();

// Enter / Space activate a role="button" element, matching native buttons.
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;

    const target = e.target.closest('.medbeafgallery-carousel-item[role="button"]');
    if (!target) return;

    e.preventDefault(); // stop Space from scrolling the page
    target.click();
});

// Mirror the .active class onto aria-pressed / aria-selected.
function medbeafgallerySyncToggleState(root) {
    (root || document).querySelectorAll('.medbeafgallery-carousel-item[role="button"]').forEach(el => {
        el.setAttribute('aria-pressed', String(el.classList.contains('active')));
    });
    (root || document).querySelectorAll('.medbeafgallery-control-btn').forEach(el => {
        el.setAttribute('aria-pressed', String(el.classList.contains('active')));
    });
    (root || document).querySelectorAll('.medbeafgallery-tab[role="tab"]').forEach(el => {
        const selected = el.classList.contains('active');
        el.setAttribute('aria-selected', String(selected));
        // Roving tabindex: only the selected tab is in the tab order.
        el.setAttribute('tabindex', selected ? '0' : '-1');
    });
}

function medbeafgalleryObserveToggleState() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.attributeName === 'class')) {
            medbeafgallerySyncToggleState();
        }
    });

    ['.medbeafgallery-carousel-items', '.medbeafgallery-image-controls', '.medbeafgallery-case-tabs']
        .forEach(sel => {
            const node = document.querySelector(sel);
            if (node) {
                observer.observe(node, { attributes: true, subtree: true, attributeFilter: ['class'] });
            }
        });

    medbeafgallerySyncToggleState();
}

// Close the modal - now a global function
function closeModal() {
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal) return;

    // Hide modal
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Reset global state
    currentItemId = null;
    currentPairIndex = 0;

    // Hand focus back to whatever opened the modal.
    if (medbeafgalleryLastFocused && document.contains(medbeafgalleryLastFocused)) {
        medbeafgalleryLastFocused.focus();
    }
    medbeafgalleryLastFocused = null;

    // After transition completes, restore modal position
    clearTimeout(medbeafgalleryModalRestoreTimer);
    medbeafgalleryModalRestoreTimer = setTimeout(() => {
        medbeafgalleryModalRestoreTimer = null;
        restoreModalPosition();
    }, 300); // Match this to your CSS transition time
}

// Navigate between cases - now a global function
function navigateModal(direction) {
    if (currentItemId === null) return;

    const currentIndex = galleryConfig.filteredItems.findIndex(item => item.id === currentItemId);
    if (currentIndex === -1) return;

    let newIndex;
    if (direction === 'prev') {
        newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = galleryConfig.filteredItems.length - 1;
    } else {
        newIndex = currentIndex + 1;
        if (newIndex >= galleryConfig.filteredItems.length) newIndex = 0;
    }

    const newItem = galleryConfig.filteredItems[newIndex];
    openModal(newItem.id);
}

// The Pro add-on's category carousel (Pro 1.4.1 and older) prints its own copy
// of this modal without the dialog and tab semantics the gallery's markup now
// carries. Fill in only what is missing, so carousel-only pages get the same
// screen-reader behaviour; the gallery's own modal is left exactly as it is.
function medbeafgalleryBackfillModalSemantics(modal) {
    if (!modal) return;

    const defaults = {
        'role': 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'medbeafgallery-case-title',
        'aria-hidden': modal.classList.contains('active') ? 'false' : 'true',
        'tabindex': '-1'
    };
    Object.keys(defaults).forEach(name => {
        if (!modal.hasAttribute(name)) modal.setAttribute(name, defaults[name]);
    });

    modal.querySelectorAll('.medbeafgallery-case-tabs').forEach(list => {
        if (!list.hasAttribute('role')) list.setAttribute('role', 'tablist');
    });
    modal.querySelectorAll('.medbeafgallery-tab').forEach(tab => {
        if (!tab.hasAttribute('role')) tab.setAttribute('role', 'tab');
    });
}

// Initialize modal functionality with enhanced features
function initModal() {
    const modal = document.getElementById('medbeafgallery-modal');
    medbeafgalleryBackfillModalSemantics(modal);
    const modalClose = document.querySelector('.medbeafgallery-modal-close');
    const beforeImg = document.getElementById('medbeafgallery-before-img');
    const afterImg = document.getElementById('medbeafgallery-after-img');
    const caseTitle = document.getElementById('medbeafgallery-case-title');
    const caseDesc = document.getElementById('medbeafgallery-case-description');
    const caseCategory = document.getElementById('medbeafgallery-case-category');
    const caseGender = document.getElementById('medbeafgallery-case-gender');
    const caseAge = document.getElementById('medbeafgallery-case-age');
    const caseRecovery = document.getElementById('medbeafgallery-case-recovery');
    const caseDuration = document.getElementById('medbeafgallery-case-duration');
    const caseResults = document.getElementById('medbeafgallery-case-results');
    const prevButton = document.querySelector('.medbeafgallery-modal-prev');
    const nextButton = document.querySelector('.medbeafgallery-modal-next');
    const currentItemCounter = document.getElementById('medbeafgallery-current-item');
    const totalItemsCounter = document.getElementById('medbeafgallery-total-items');

    // Image view control buttons
    const splitViewBtn = document.querySelector('.medbeafgallery-split-view');
    const beforeViewBtn = document.querySelector('.medbeafgallery-before-view');
    const afterViewBtn = document.querySelector('.medbeafgallery-after-view');

    // Tab navigation
    const tabs = document.querySelectorAll('.medbeafgallery-tab');
    const tabContents = document.querySelectorAll('.medbeafgallery-tab-content');

    const imagePairsContainer = document.querySelector('.medbeafgallery-image-sets-container');
    const pairPrevBtn = document.querySelector('.medbeafgallery-pair-prev');
    const pairNextBtn = document.querySelector('.medbeafgallery-pair-next');
    const pairIndicators = document.querySelector('.medbeafgallery-pair-indicators');
    const pairInfoText = document.querySelector('.medbeafgallery-pair-description');
    const imagePairsNav = document.querySelector('.medbeafgallery-image-pairs-nav');

    // Handle gallery item clicks
    document.addEventListener('click', function(e) {
        const galleryItem = e.target.closest('.medbeafgallery-gallery-item');
        if (galleryItem || e.target.closest('.medbeafgallery-gallery-view-btn')) {
            const itemId = galleryItem.getAttribute('data-id');
            openModal(parseInt(itemId));
            e.preventDefault();
        }
    });

    // Close modal when clicking the close button
    modalClose?.addEventListener('click', function() {
        closeModal();
    });

    // Close modal when clicking outside the modal content
    modal?.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeModal();
        }
    });

    // Previous case button
    prevButton?.addEventListener('click', function() {
        navigateModal('prev');
    });

    // Next case button
    nextButton?.addEventListener('click', function() {
        navigateModal('next');
    });

    // Tab navigation
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');

            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to selected tab and content
            this.classList.add('active');
            document.querySelector(`.medbeafgallery-tab-content[data-tab="${tabId}"]`).classList.add('active');
        });
    });

    // Image view controls
    splitViewBtn?.addEventListener('click', function() {
        setViewMode('split');
    });

    beforeViewBtn?.addEventListener('click', function() {
        setViewMode('before');
    });

    afterViewBtn?.addEventListener('click', function() {
        setViewMode('after');
    });

    // Social sharing is bound once, globally, via delegation — see
    // medbeafgalleryBindShareButtons() below.

    // Add event listeners for image pair navigation
    pairPrevBtn?.addEventListener('click', function() {
        navigateImagePairs('prev');
    });

    pairNextBtn?.addEventListener('click', function() {
        navigateImagePairs('next');
    });

    // Add keyboard navigation for modal
    document.addEventListener('keydown', function(e) {
        if (!modal?.classList.contains('active')) return;

        if (e.key === 'ArrowLeft') {
            if (e.altKey) {
                // Alt+Left Arrow = navigate to previous case
                navigateModal('prev');
            } else {
                // Left Arrow = navigate to previous image pair
                navigateImagePairs('prev');
            }
        } else if (e.key === 'ArrowRight') {
            if (e.altKey) {
                // Alt+Right Arrow = navigate to next case
                navigateModal('next');
            } else {
                // Right Arrow = navigate to next image pair
                navigateImagePairs('next');
            }
        } else if (e.key === '1') {
            // 1 = Before view
            setViewMode('before');
        } else if (e.key === '2') {
            // 2 = After view
            setViewMode('after');
        } else if (e.key === '3') {
            // 3 = Split view
            setViewMode('split');
        }
    });
}

// Also move these related functions outside of initModal
function updateNavigationButtons() {
    const prevButton = document.querySelector('.medbeafgallery-modal-prev');
    const nextButton = document.querySelector('.medbeafgallery-modal-next');

    if (!prevButton || !nextButton) return;

    if (galleryConfig.filteredItems.length <= 1) {
        prevButton.disabled = true;
        nextButton.disabled = true;
    } else {
        prevButton.disabled = false;
        nextButton.disabled = false;
    }
}

function createPairIndicators(count) {
    const pairIndicators = document.querySelector('.medbeafgallery-pair-indicators');
    if (!pairIndicators) return;

    // Clear existing indicators
    pairIndicators.innerHTML = '';

    // Create indicator for each image pair
    for (let i = 0; i < count; i++) {
        const indicator = document.createElement('span');
        indicator.className = 'medbeafgallery-pair-indicator';
        if (i === currentPairIndex) {
            indicator.classList.add('active');
        }

        // Add click event to jump to specific pair
        indicator.addEventListener('click', function() {
            currentPairIndex = i;
            const item = galleryData.find(item => item.id === currentItemId);
            if (item) {
                showImagePair(item, i);
                updatePairIndicators(count, i);
            }
        });

        pairIndicators.appendChild(indicator);
    }
}

function updatePairNavigation(pairCount) {
    const imagePairsNav = document.querySelector('.medbeafgallery-image-pairs-nav');
    const pairPrevBtn = document.querySelector('.medbeafgallery-pair-prev');
    const pairNextBtn = document.querySelector('.medbeafgallery-pair-next');

    if (!imagePairsNav || !pairPrevBtn || !pairNextBtn) return;

    if (pairCount <= 1) {
        // Hide navigation if there's only one pair or none
        imagePairsNav.classList.add('single-pair');
        pairPrevBtn.disabled = true;
        pairNextBtn.disabled = true;
    } else {
        // Show navigation if there are multiple pairs
        imagePairsNav.classList.remove('single-pair');
        pairPrevBtn.disabled = false;
        pairNextBtn.disabled = false;
    }
}

// Move showImagePair function outside of initModal
function showImagePair(item, index) {
    // Check if the item exists
    if (!item) return;

    // Store the current view mode before switching images
    const previousViewMode = currentViewMode;

    // Create consolidated array of all image pairs
    let allPairs = [];

    // Add main before/after as first pair
    if (item.beforeImg && item.afterImg) {
        allPairs.push({
            beforeImg: item.beforeImg,
            afterImg: item.afterImg,
            beforeAlt: item.beforeAlt || `Before - ${item.title}`,
            afterAlt: item.afterAlt || `After - ${item.title}`,
            description: "Main View"
        });
    }

    // Add additional pairs if they exist
    if (item.imagePairs && item.imagePairs.length > 0) {
        allPairs = allPairs.concat(item.imagePairs);
    }

    // Get the pair at the requested index
    const pair = allPairs[index];

    if (!pair) {
        console.error(`No image pair found at index ${index}`);
        return;
    }

    // Get necessary DOM elements
    const imagePairsContainer = document.querySelector('.medbeafgallery-image-sets-container');
    const pairInfoText = document.querySelector('.medbeafgallery-pair-description');

    // Hide all image pair wrappers
    document.querySelectorAll('.medbeafgallery-before-after-wrapper').forEach(wrapper => {
        wrapper.classList.remove('active');
    });

    // Find or create the wrapper for this index
    let wrapper = document.querySelector(`.medbeafgallery-before-after-wrapper[data-pair-id="${index + 1}"]`);

    // If it doesn't exist, create it
    if (!wrapper) {
        wrapper = createImagePairWrapper(index + 1);
        if (imagePairsContainer) {
            imagePairsContainer.appendChild(wrapper);
        }
    }

    // Clear wrapper content and rebuild with Cocoen slider
    wrapper.innerHTML = '';
    wrapper.classList.add('loading');

    // The blurred backdrop (Design → Case Window Background) is a copy of the
    // photo itself, so remember both URLs for setViewMode().
    wrapper.dataset.backdropBefore = pair.beforeImg || '';
    wrapper.dataset.backdropAfter = pair.afterImg || '';
    medbeafgallerySetBackdrop(wrapper, pair.afterImg || pair.beforeImg);

    // Add loading spinner
    const spinner = document.createElement('div');
    spinner.className = 'medbeafgallery-loading-spinner';
    spinner.innerHTML = `
        <svg viewBox="0 0 50 50" class="spinner">
            <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
    `;
    wrapper.appendChild(spinner);

    // Create Cocoen slider container (for split view)
    const cocoenDiv = document.createElement('div');
    cocoenDiv.className = 'cocoen';

    const beforeImg = document.createElement('img');
    beforeImg.alt = pair.beforeAlt || `Before - ${item.title}`;

    const afterImg = document.createElement('img');
    afterImg.alt = pair.afterAlt || `After - ${item.title}`;

    cocoenDiv.appendChild(beforeImg);
    cocoenDiv.appendChild(afterImg);
    wrapper.appendChild(cocoenDiv);

    // Create standalone images for before-only / after-only view modes
    const standaloneBefore = document.createElement('img');
    standaloneBefore.className = 'medbeafgallery-standalone-before';
    standaloneBefore.alt = pair.beforeAlt || `Before - ${item.title}`;
    standaloneBefore.style.display = 'none';
    wrapper.appendChild(standaloneBefore);

    const standaloneAfter = document.createElement('img');
    standaloneAfter.className = 'medbeafgallery-standalone-after';
    standaloneAfter.alt = pair.afterAlt || `After - ${item.title}`;
    standaloneAfter.style.display = 'none';
    wrapper.appendChild(standaloneAfter);

    // Show this wrapper
    wrapper.classList.add('active');

    // Load images and then initialize Cocoen
    const loadImage = (img, src) => new Promise(resolve => {
        if (!src) { resolve(); return; }
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
        if (img.complete && img.naturalHeight !== 0) resolve();
    });

    Promise.all([
        loadImage(beforeImg, pair.beforeImg),
        loadImage(afterImg, pair.afterImg),
        loadImage(standaloneBefore, pair.beforeImg),
        loadImage(standaloneAfter, pair.afterImg)
    ]).then(() => {
        // Remove loading state
        wrapper.classList.remove('loading');
        const sp = wrapper.querySelector('.medbeafgallery-loading-spinner');
        if (sp) sp.remove();

        // Use requestAnimationFrame to ensure the browser has laid out the modal
        // before Cocoen calculates its dimensions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Only initialize Cocoen now if we're opening directly in split
                // view. For "before"/"after" defaults we defer initialization
                // until the user switches to split, because Cocoen must be
                // created while visible — initializing it hidden corrupts the
                // slider's geometry (handle/clip computed at zero width).
                if (previousViewMode === 'split') {
                    initBeforeAfterSlider(wrapper);
                }

                // Apply the saved view mode
                setViewMode(previousViewMode);
            });
        });
    });

    // Update pair info text
    if (pairInfoText) {
        pairInfoText.textContent = pair?.description || `View ${index + 1}`;
    }
}

// The doctor card under the photo in the case window (free modal only — the
// strip is not printed when Pro's details panel is shown, which has its own).
function medbeafgalleryRenderDoctorStrip(item) {
    const strip = document.getElementById('medbeafgallery-doctor-strip');
    if (!strip) return;
    const d = item && item.doctor;
    if (!d || !d.name) {
        strip.hidden = true;
        strip.innerHTML = '';
        return;
    }
    const esc = medbeafgalleryEscapeAttr;
    const photo = d.photo
        ? `<img class="medbeafgallery-doctor-photo" src="${esc(d.photo)}" alt="" loading="lazy" decoding="async">`
        : `<span class="medbeafgallery-doctor-photo medbeafgallery-doctor-initials" aria-hidden="true">${esc(String(d.name).replace(/^(dr\.?\s+)/i, '').charAt(0).toUpperCase())}</span>`;
    const name = d.url
        ? `<a class="medbeafgallery-doctor-name" href="${esc(d.url)}">${esc(d.name)}</a>`
        : `<span class="medbeafgallery-doctor-name">${esc(d.name)}</span>`;
    strip.innerHTML = `
        ${photo}
        <div class="medbeafgallery-doctor-text">
            <span class="medbeafgallery-doctor-label">${esc((typeof medbeafgalleryGalleryConfig !== 'undefined' && medbeafgalleryGalleryConfig.treatedByText) || 'Treated by')}</span>
            ${name}
            ${d.credentials ? `<span class="medbeafgallery-doctor-credentials">${esc(d.credentials)}</span>` : ''}
            ${d.location ? `<span class="medbeafgallery-doctor-location">${esc(d.location)}</span>` : ''}
        </div>`;
    strip.hidden = false;
}

// Point the case window's blurred backdrop at a photo (CSS custom property read
// by .medbeafgallery-backdrop-blur .medbeafgallery-before-after-wrapper::before).
function medbeafgallerySetBackdrop(el, url) {
    if (!el) return;
    if (!url) {
        el.style.removeProperty('--medbeafgallery-backdrop');
        return;
    }
    const safe = String(url).replace(/[\r\n]/g, '').replace(/"/g, '%22').replace(/\\/g, '%5C');
    el.style.setProperty('--medbeafgallery-backdrop', 'url("' + safe + '")');
}

// Create a new image pair wrapper (also needed globally)
function createImagePairWrapper(pairId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'medbeafgallery-before-after-wrapper';
    wrapper.setAttribute('data-pair-id', pairId);
    // Content is populated dynamically by showImagePair using Cocoen
    return wrapper;
}

// Initialize before-after slider using Cocoen (needed globally)
function initBeforeAfterSlider(wrapper = null) {
    // If no wrapper is provided, use the active one
    if (!wrapper) {
        wrapper = document.querySelector('.medbeafgallery-before-after-wrapper.active');
    }
    if (!wrapper) return;

    // Check if Cocoen component already exists (already initialized)
    if (wrapper.querySelector('cocoen-component')) {
        // Already initialized - just trigger a resize to recalculate
        fitCocoenToContainer(wrapper);
        window.dispatchEvent(new Event('resize'));
        return;
    }

    // Find the .cocoen div that hasn't been converted yet
    const cocoenDiv = wrapper.querySelector('.cocoen');
    if (!cocoenDiv) return;

    // Ensure the div has two images before creating
    const imgs = cocoenDiv.querySelectorAll('img');
    if (imgs.length < 2) {
        return;
    }

    // Initialize Cocoen - this replaces the .cocoen div with a <cocoen-component>
    try {
        if (typeof Cocoen !== 'undefined' && Cocoen.create) {
            Cocoen.create(cocoenDiv);

            // Force Cocoen to recalculate dimensions after the next paint,
            // then fit the component within the available container height
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
                requestAnimationFrame(() => {
                    fitCocoenToContainer(wrapper);
                });
            });
        } else {
        }
    } catch (e) {
        console.error('Cocoen initialization error:', e);
    }
}

// Fit the Cocoen component within its container so the full image is visible
function fitCocoenToContainer(wrapper) {
    const cocoenEl = wrapper.querySelector('cocoen-component');
    if (!cocoenEl) return;

    // Reset any previous width adjustment
    cocoenEl.style.width = '';
    cocoenEl.style.margin = '';

    // Let the browser recalculate
    const containerHeight = wrapper.clientHeight;
    const containerWidth = wrapper.clientWidth;
    const componentHeight = cocoenEl.scrollHeight || cocoenEl.clientHeight;

    if (containerHeight > 0 && componentHeight > containerHeight) {
        // Image is taller than the container — scale the component width down
        // so that the resulting image height fits within the available space
        const ratio = containerHeight / componentHeight;
        const newWidth = Math.floor(containerWidth * ratio);
        cocoenEl.style.width = newWidth + 'px';
        cocoenEl.style.margin = '0 auto';
        // Tell Cocoen to recalculate its internal dimensions
        window.dispatchEvent(new Event('resize'));
    }
}
// Set view mode (split, before, after) - needed globally
function setViewMode(mode) {
    currentViewMode = mode;

    // Get the active wrapper
    const wrapper = document.querySelector('.medbeafgallery-before-after-wrapper.active');
    if (!wrapper) return;

    // Get the comparison container that contains the labels
    const comparisonContainer = document.querySelector('.medbeafgallery-comparison-container');

    // Get Cocoen component and standalone images
    const cocoenEl = wrapper.querySelector('cocoen-component') || wrapper.querySelector('.cocoen');
    const standaloneBefore = wrapper.querySelector('.medbeafgallery-standalone-before');
    const standaloneAfter = wrapper.querySelector('.medbeafgallery-standalone-after');

    // Get control buttons
    const splitViewBtn = document.querySelector('.medbeafgallery-split-view');
    const beforeViewBtn = document.querySelector('.medbeafgallery-before-view');
    const afterViewBtn = document.querySelector('.medbeafgallery-after-view');

    // Remove all view classes from both wrapper and comparison container
    wrapper.classList.remove('view-split', 'view-before', 'view-after');
    if (comparisonContainer) {
        comparisonContainer.classList.remove('view-split', 'view-before', 'view-after');
    }

    // Add appropriate class to both elements
    wrapper.classList.add(`view-${mode}`);
    if (comparisonContainer) {
        comparisonContainer.classList.add(`view-${mode}`);
    }

    // Update active button
    splitViewBtn?.classList.toggle('active', mode === 'split');
    beforeViewBtn?.classList.toggle('active', mode === 'before');
    afterViewBtn?.classList.toggle('active', mode === 'after');

    // Keep the blurred backdrop in step with the photo on show.
    if (wrapper.dataset.backdropAfter || wrapper.dataset.backdropBefore) {
        medbeafgallerySetBackdrop(wrapper, mode === 'before'
            ? (wrapper.dataset.backdropBefore || wrapper.dataset.backdropAfter)
            : (wrapper.dataset.backdropAfter || wrapper.dataset.backdropBefore));
    }

    // Update visibility based on view mode
    if (mode === 'split') {
        // Hide standalone images first so the slider isn't overlapped.
        if (standaloneBefore) standaloneBefore.style.display = 'none';
        if (standaloneAfter) standaloneAfter.style.display = 'none';

        const existingComponent = wrapper.querySelector('cocoen-component');
        const cocoenDiv = wrapper.querySelector('.cocoen');

        if (!existingComponent && cocoenDiv) {
            // First time split view is shown — initialize Cocoen now, while it
            // is visible, so the slider geometry is calculated correctly. (When
            // the default view is "before"/"after", init was deferred to here.)
            cocoenDiv.style.display = '';
            initBeforeAfterSlider(wrapper);
        } else if (existingComponent) {
            // Already initialized — ensure it is visible and recalculate, in
            // case it was hidden when its dimensions were last computed.
            existingComponent.style.display = '';
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
                requestAnimationFrame(() => {
                    if (typeof fitCocoenToContainer === 'function') {
                        fitCocoenToContainer(wrapper);
                    }
                });
            });
        }
    } else if (mode === 'before') {
        // Hide Cocoen slider, show before image only
        if (cocoenEl) cocoenEl.style.display = 'none';
        if (standaloneBefore) standaloneBefore.style.display = 'block';
        if (standaloneAfter) standaloneAfter.style.display = 'none';
    } else if (mode === 'after') {
        // Hide Cocoen slider, show after image only
        if (cocoenEl) cocoenEl.style.display = 'none';
        if (standaloneBefore) standaloneBefore.style.display = 'none';
        if (standaloneAfter) standaloneAfter.style.display = 'block';
    }
}

// updateSliderPosition - no longer needed (Cocoen handles slider positioning)
function updateSliderPosition(position, slider, afterImage) {
    // Kept as empty stub for backward compatibility
    // Cocoen handles all slider positioning internally
}

// Helper function to capitalize first letter of each word
function capitalizeSentence(str) {
    if (!str) return '';
    return str.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Function to navigate between image pairs
function navigateImagePairs(direction) {
    const item = galleryConfig.filteredItems.find(item => item.id === currentItemId);
    if (!item) return;

    // Calculate total number of pairs (main pair + additional pairs)
    let totalPairs = (item.beforeImg && item.afterImg ? 1 : 0) +
                     (item.imagePairs && item.imagePairs.length > 0 ? item.imagePairs.length : 0);

    if (totalPairs <= 1) return;

    // Calculate new index
    let newIndex;
    if (direction === 'prev') {
        newIndex = currentPairIndex - 1;
        if (newIndex < 0) newIndex = totalPairs - 1;
    } else {
        newIndex = currentPairIndex + 1;
        if (newIndex >= totalPairs) newIndex = 0;
    }

    // Update current pair index
    currentPairIndex = newIndex;

    // Show the selected image pair
    showImagePair(item, currentPairIndex);

    // Update indicator dots
    updatePairIndicators(totalPairs, currentPairIndex);
}

// Update the counter display in the openModal function
function updateModalCounter(currentIndex, totalItems) {
    const currentItemCounter = document.getElementById('medbeafgallery-current-item');
    const totalItemsCounter = document.getElementById('medbeafgallery-total-items');

    if (currentItemCounter && totalItemsCounter) {
        // Add a small animation effect when changing numbers
        currentItemCounter.style.transform = "translateY(-10px)";
        currentItemCounter.style.opacity = "0";

        setTimeout(() => {
            currentItemCounter.textContent = currentIndex;
            currentItemCounter.style.transform = "translateY(0)";
            currentItemCounter.style.opacity = "1";
        }, 200);

        totalItemsCounter.textContent = totalItems;
    }
}

// Decode HTML entities (e.g. WordPress encodes "&" in titles as "&#038;").
// Reading such a value back through textContent would print the raw entity, so
// decode it first. A <textarea> decodes without executing any markup.
function medbeafgalleryDecodeEntities(str) {
    if (str === null || str === undefined) return '';
    const t = document.createElement('textarea');
    t.innerHTML = String(str);
    return t.value;
}

// Open modal and display case details - now a global function
function openModal(id) {
    const item = galleryData.find(item => item.id === id);
    if (!item) return;

    // Log found item for debugging

    currentItemId = id;
    currentPairIndex = 0; // Reset to first pair when opening a new case

    // Get modal elements
    const modal = document.getElementById('medbeafgallery-modal');
    const caseTitle = document.getElementById('medbeafgallery-case-title');
    const caseDesc = document.getElementById('medbeafgallery-case-description');
    const caseCategory = document.getElementById('medbeafgallery-case-category');
    const caseGender = document.getElementById('medbeafgallery-case-gender');
    const caseAge = document.getElementById('medbeafgallery-case-age');
    const caseRecovery = document.getElementById('medbeafgallery-case-recovery');
    const caseDuration = document.getElementById('medbeafgallery-case-duration');
    const caseResults = document.getElementById('medbeafgallery-case-results');
    const caseProcedure = document.getElementById('medbeafgallery-case-procedure');
    const procedureDescription = document.getElementById('medbeafgallery-procedure-description');
    const prevButton = document.querySelector('.medbeafgallery-modal-prev');
    const nextButton = document.querySelector('.medbeafgallery-modal-next');
    const imagePairsContainer = document.querySelector('.medbeafgallery-image-sets-container');
    const pairIndicators = document.querySelector('.medbeafgallery-pair-indicators');
    const pairInfoText = document.querySelector('.medbeafgallery-pair-description');
    const imagePairsNav = document.querySelector('.medbeafgallery-image-pairs-nav');
    const tabs = document.querySelectorAll('.medbeafgallery-tab');
    const tabContents = document.querySelectorAll('.medbeafgallery-tab-content');

    // Check if modal element exists
    if (modal) {


    }

    // Safely set modal content with null checks
    if (caseTitle) caseTitle.textContent = medbeafgalleryDecodeEntities(item.title) || 'Case Study';
    if (caseDesc) caseDesc.innerHTML = item.description || '';
    if (caseCategory) caseCategory.textContent = medbeafgalleryDecodeEntities(item.categoryName || item.category) || 'Uncategorized';

    medbeafgalleryRenderDoctorStrip(item);

    if (caseGender && item.gender) caseGender.textContent = capitalizeSentence(item.gender);
    if (caseAge && item.age) caseAge.textContent = item.age;
    if (caseRecovery && item.recovery) caseRecovery.textContent = capitalizeSentence(item.recovery);

    // Add new field values with null checks
    if (caseDuration && item.duration) caseDuration.textContent = capitalizeSentence(item.duration);
    if (caseResults && item.results) caseResults.textContent = capitalizeSentence(item.results);

    // Fix procedure type display - show actual procedure type instead of generic text
    if (caseProcedure && item.procedureType) {
        caseProcedure.textContent = capitalizeSentence(item.procedureType);
    } else if (caseProcedure && item.procedure) {
        caseProcedure.textContent = capitalizeSentence(item.procedure);
    }

    // Show/hide detail items based on data availability AND enabled filters
    const enabledDetails = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.enabledDetails) || null;
    const detailVisibility = {
        'medbeafgallery-detail-category': !!(item.categoryName || item.category),
        'medbeafgallery-detail-gender': !!item.gender,
        'medbeafgallery-detail-age': !!item.age,
        'medbeafgallery-detail-recovery': !!item.recovery,
        'medbeafgallery-detail-duration': !!item.duration,
        'medbeafgallery-detail-results': !!item.results,
        'medbeafgallery-detail-procedure': !!(item.procedureType || item.procedure)
    };
    Object.entries(detailVisibility).forEach(([id, hasData]) => {
        const el = document.getElementById(id);
        if (!el) return;
        // Extract the detail key from the element ID (e.g. 'medbeafgallery-detail-gender' → 'gender')
        const detailKey = id.replace('medbeafgallery-detail-', '');
        // If enabledDetails exists (Pro active), only show if the detail is enabled AND has data
        const isEnabled = enabledDetails ? enabledDetails.includes(detailKey) : true;
        el.style.display = (hasData && isEnabled) ? '' : 'none';
    });

    // Reset to first tab if tabs exist
    if (tabs && tabs.length > 0 && tabContents && tabContents.length > 0) {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Check if the first tab and content exist before accessing
        if (tabs[0] && tabContents[0]) {
            tabs[0].classList.add('active');
            tabContents[0].classList.add('active');
        }
    }

    // Reset to the configured default view mode (Pro add-on may override; defaults to 'split')
    currentViewMode = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.defaultViewMode) || 'split';

    // Clear image pairs container
    if (imagePairsContainer) {
        imagePairsContainer.innerHTML = '';
    }

    // Determine if we have multiple image pairs or just single before/after
    let imagePairs = [];

    // IMPORTANT CHANGE: Always add the main before/after images as the first pair
    if (item.beforeImg && item.afterImg) {
        imagePairs.push({
            beforeImg: item.beforeImg,
            afterImg: item.afterImg,
            beforeAlt: item.beforeAlt || `Before - ${item.title}`,
            afterAlt: item.afterAlt || `After - ${item.title}`,
            description: "Main View"
        });
    }

    // Then add any additional pairs if they exist
    if (item.imagePairs && item.imagePairs.length > 0) {
        // New format with multiple pairs - add them after the main pair
        imagePairs = imagePairs.concat(item.imagePairs);
    }



    // Create indicators for image pairs if element exists
    if (pairIndicators) {
        createPairIndicators(imagePairs.length);
    }

    // Update navigation visibility if navigation exists
    if (imagePairsNav) {
        updatePairNavigation(imagePairs.length);
    }

    // Hide the per-pair label ("Main View") when there are no additional images —
    // it only carries meaning when the viewer can move between multiple pairs.
    if (pairInfoText) {
        pairInfoText.style.display = imagePairs.length > 1 ? '' : 'none';
    }

    // Update counter with animation
    const currentIndex = galleryConfig.filteredItems.findIndex(i => i.id === item.id) + 1;
    updateModalCounter(currentIndex, galleryConfig.filteredItems.length);

    // Update navigation buttons if they exist
    if (prevButton && nextButton) {
        updateNavigationButtons();
    }

    // Move modal to portal before displaying. A close that is still finishing
    // must not move it back out afterwards.
    clearTimeout(medbeafgalleryModalRestoreTimer);
    medbeafgalleryModalRestoreTimer = null;
    moveModalToPortal();

    // Show modal FIRST so Cocoen can calculate dimensions
    if (modal) {
        // Remember the trigger so focus can go back there on close. Only record
        // it on a fresh open, not when stepping between cases in an open modal.
        if (!modal.classList.contains('active')) {
            medbeafgalleryLastFocused = document.activeElement;
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Move focus into the dialog. Close is the safest landing point: it is
        // always present and gives an immediate way out.
        const closeBtn = modal.querySelector('.medbeafgallery-modal-close');
        (closeBtn || modal).focus();
    }

    // Show the first image pair AFTER modal is visible
    if (imagePairs.length > 0) {
        showImagePair(item, 0);
    }
}

// Function to update pair indicators
function updatePairIndicators(count, activeIndex) {
    const indicators = document.querySelectorAll('.medbeafgallery-pair-indicator');
    indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index === activeIndex);
    });
}

// Social sharing functionality
function shareOnSocial(platform) {
    const currentItem = galleryConfig.filteredItems.find(item => item.id === currentItemId);
    if (!currentItem) return;

    const pageUrl = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(`${currentItem.title} - Before & After Gallery`);
    const description = encodeURIComponent(currentItem.description || '');

    let shareUrl;

    switch (platform) {
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${title}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${title}`;
            break;
        case 'email':
            shareUrl = `mailto:?subject=${title}&body=${description}%0A%0A${pageUrl}`;
            break;
    }

    if (shareUrl) {
        window.open(shareUrl, '_blank', 'width=600,height=400');
    }
}

// Add visual feedback when loading content
function showLoadingState(container) {
    // Create or show loading indicator
    let loader = container.querySelector('.medbeafgallery-loading-indicator');

    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'medbeafgallery-loading-indicator';
        loader.innerHTML = `
            <div class="medbeafgallery-spinner-container">
                <svg viewBox="0 0 50 50" class="medbeafgallery-spinner">
                    <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
            </div>
            <p>Loading...</p>
        `;
        container.appendChild(loader);
    }

    loader.style.display = 'flex';
    container.classList.add('medbeafgallery-loading');
}

function hideLoadingState(container) {
    const loader = container.querySelector('.medbeafgallery-loading-indicator');
    if (loader) {
        loader.style.display = 'none';
    }
    container.classList.remove('medbeafgallery-loading');
}

// Update the updateFilterTags function to show child category tags
function updateFilterTags() {
    const tagsContainer = document.getElementById('medbeafgallery-filter-tags');
    if (!tagsContainer) return;

    // Clear existing tags
    tagsContainer.innerHTML = '';

    // Add category tag if not "all"
    if (galleryConfig.currentCategory !== 'all' && galleryConfig.currentCategory !== 'ba_category_all') {
        const categoryItem = document.querySelector(`.medbeafgallery-carousel-item[data-id="${galleryConfig.currentCategory}"]`);
        const categoryName = categoryItem ? categoryItem.querySelector('.medbeafgallery-category-name').textContent : galleryConfig.currentCategory;

        addFilterTag(tagsContainer, 'category', categoryName, function() {
            // Reset to All category
            galleryConfig.currentCategory = 'all';

            // CRITICAL FIX: Also clear child category filter when removing parent category
            galleryConfig.currentChildCategory = '';

            // Also uncheck any child category checkboxes that might be selected
            document.querySelectorAll('input[name="child_category"]').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Hide child categories section since we're clearing the parent
            hideChildCategoriesSection();

            // Update carousel UI
            document.querySelectorAll('.medbeafgallery-carousel-item').forEach(item => {
                const isAll = item.getAttribute('data-id') === 'all' ||
                             item.getAttribute('data-id') === 'ba_category_all';
                item.classList.toggle('active', isAll);
            });

            // Apply filters to refresh the gallery
            renderGalleryItems();
        });
    }

    // Add child category tag if one is selected
    if (galleryConfig.currentChildCategory) {
        // Find the child category label to get its text
        const childLabel = Array.from(document.querySelectorAll('input[name="child_category"]'))
            .find(input => input.value === galleryConfig.currentChildCategory)?.parentElement;

        const childName = childLabel ? childLabel.textContent.trim().split('(')[0].trim() : galleryConfig.currentChildCategory;

        // Add a tag for the child category
        addFilterTag(tagsContainer, 'child-category', `Sub: ${childName}`, function() {
            // Clear child category filter
            galleryConfig.currentChildCategory = '';

            // Uncheck all child category checkboxes
            document.querySelectorAll('input[name="child_category"]').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Apply filters
            renderGalleryItems();
        });
    }

    // Add other filter tags
    addFilterTagsFromInputs(tagsContainer, 'gender', 'Gender');
    addFilterTagsFromInputs(tagsContainer, 'age', 'Age');
    addFilterTagsFromInputs(tagsContainer, 'recovery', 'Recovery');
    addFilterTagsFromInputs(tagsContainer, 'duration', 'Duration');
    addFilterTagsFromInputs(tagsContainer, 'results', 'Results');
    addFilterTagsFromInputs(tagsContainer, 'procedure', 'Procedure');

    // Hide/show the active filters section based on if there are any tags
    const activeFiltersSection = document.querySelector('.medbeafgallery-active-filters');
    const clearAllButton = document.getElementById('medbeafgallery-clear-filters');

    if (activeFiltersSection) {
        const hasActiveTags = tagsContainer.children.length > 0;
        activeFiltersSection.style.display = hasActiveTags ? 'flex' : 'none';

        // Make sure Clear All button is visible when there are tags
        if (clearAllButton) {
            clearAllButton.style.display = hasActiveTags ? 'inline-block' : 'none';
        }
    }
}

function addFilterTag(container, id, text, onRemove) {
    const tag = document.createElement('span');
    tag.className = 'medbeafgallery-filter-tag';
    tag.dataset.filterId = id;

    tag.innerHTML = `
        ${text}
        <span class="medbeafgallery-filter-tag-remove">×</span>
    `;

    container.appendChild(tag);

    // Add event handler to the remove button
    const removeButton = tag.querySelector('.medbeafgallery-filter-tag-remove');
    if (removeButton && typeof onRemove === 'function') {
        removeButton.addEventListener('click', function(event) {
            // Prevent event bubbling
            event.preventDefault();
            event.stopPropagation();

            // Call the provided remove callback
            onRemove();
        });
    }
}

function addFilterTagsFromInputs(container, name, label) {
    document.querySelectorAll(`input[name="${name}"]:checked`).forEach(input => {
        const value = input.value;
        const text = input.parentElement.textContent.trim();
        addFilterTag(container, `${name}-${value}`, text, () => {
            input.checked = false;
            renderGalleryItems();
        });
    });
}

// Add smooth scroll to gallery when category/filter changes
function scrollToGallery() {
    const galleryGrid = document.getElementById('medbeafgallery-gallery-grid');
    if (!galleryGrid) return;

    const headerOffset = 20;
    const galleryPosition = galleryGrid.getBoundingClientRect().top;
    const offsetPosition = galleryPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}

// Update the initClearAllButton function
function initClearAllButton() {
    const clearAllBtn = document.getElementById('medbeafgallery-clear-filters');
    if (!clearAllBtn) return;

    // Initially hide the button until filters are applied
    clearAllBtn.style.display = 'none';

    clearAllBtn.addEventListener('click', function() {
        // Reset all filter checkboxes
        document.querySelectorAll('.medbeafgallery-filter-options input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Reset other form elements if they exist
        document.querySelectorAll('.medbeafgallery-filter-options select').forEach(select => {
            select.selectedIndex = 0;
        });

        document.querySelectorAll('.medbeafgallery-filter-options input[type="radio"]').forEach(radio => {
            radio.checked = false;
        });

        // Reset to "All" category in carousel
        document.querySelectorAll('.medbeafgallery-carousel-item').forEach(item => {
            const isAll = item.getAttribute('data-id') === 'all' ||
                         item.getAttribute('data-id') === 'ba_category_all';
            item.classList.toggle('active', isAll);
        });

        // Reset currentCategory to 'all'
        galleryConfig.currentCategory = 'all';

        // CRITICAL FIX: Also reset currentChildCategory
        galleryConfig.currentChildCategory = '';

        // Hide child categories section
        hideChildCategoriesSection();

        // Apply reset filters
        renderGalleryItems();
    });
}

// Debug helper function
function debugCategoryStructure() {
    fetch(`${medbeafgalleryRestBase}/categories`)
        .then(response => response.json())
        .then(categories => {


            // Find all parent categories
            const parentCategories = categories.filter(cat => cat.parent === 0 && cat.slug !== 'all');


            parentCategories.forEach(parent => {

                // Find children
                const children = categories.filter(cat => cat.parent === parent.id);


            });


        });
}

// Initialize category carousel click handlers after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Re-initialize carousel clicks after DOM is fully loaded
        setTimeout(() => {
            initCarouselInteractions();
        }, 100);
    });
} else {
    // DOM is already loaded, initialize immediately
    setTimeout(() => {
        initCarouselInteractions();
    }, 100);
}
