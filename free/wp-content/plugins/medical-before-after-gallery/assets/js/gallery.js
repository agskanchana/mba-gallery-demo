let galleryData = []; // This will be populated from the API
// Global REST API base URL for MEDBEAFGALLERY Gallery
const medbeafgalleryRestBase = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.restBase)
    ? window.medbeafgalleryGalleryConfig.restBase
    : `${window.location.origin}/wp-json/medical-before-after-gallery/v1`;// Add these global variables and functions at the top of your script
let modalPortal = null;
let originalModalContainer = null;

// Add this variable to store category relationships
let categoryRelationships = {};

// Global modal state variables
let currentItemId = null;
let currentViewMode = 'split'; // 'split', 'before', or 'after'
let currentPairIndex = 0; // Track which image pair is currently displayed

/**
 * MEDBEAFGALLERY Gallery Modal Manager Class
 * Consolidates all modal-related functionality
 */
class MedBeAfGalleryModalManager {
    constructor() {
        this.currentItemId = null;
        this.currentPairIndex = 0;
        this.currentViewMode = 'split';
        this.isOpen = false;
        this.portal = null;
        this.originalContainer = null;

        this.init();
    }

    init() {
        this.createPortal();
        this.bindEvents();
    }

    createPortal() {
        // Check if portal already exists
        if (document.getElementById('medbeafgallery-modal-portal')) {
            this.portal = document.getElementById('medbeafgallery-modal-portal');
            return;
        }

        // Create new portal element
        this.portal = document.createElement('div');
        this.portal.id = 'medbeafgallery-modal-portal';
        this.portal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            display: none;
        `;

        // Append to body
        document.body.appendChild(this.portal);
    }

    bindEvents() {
        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Arrow keys for navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            if (e.key === 'ArrowLeft') {
                this.navigate(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigate(1);
            }
        });
    }

    open(itemId) {
        try {
            const item = galleryData.find(case_item => case_item.id == itemId);
            if (!item) {
                console.error('Case not found:', itemId);
                return;
            }

            this.currentItemId = itemId;
            this.currentPairIndex = 0;
            this.isOpen = true;

            this.moveToPortal();
            this.renderModal(item);
            this.portal.style.display = 'block';
            document.body.style.overflow = 'hidden';

        } catch (error) {
            console.error('Error opening modal:', error);
        }
    }

    close() {
        this.isOpen = false;
        this.portal.style.display = 'none';
        document.body.style.overflow = '';
        this.restoreToOriginal();
    }

    moveToPortal() {
        const modal = document.getElementById('medbeafgallery-modal');
        if (modal && !this.originalContainer) {
            this.originalContainer = modal.parentNode;
            this.portal.appendChild(modal);
        }
    }

    restoreToOriginal() {
        const modal = document.getElementById('medbeafgallery-modal');
        if (modal && this.originalContainer) {
            this.originalContainer.appendChild(modal);
        }
    }

    navigate(direction) {
        const currentIndex = galleryData.findIndex(item => item.id == this.currentItemId);
        const newIndex = currentIndex + direction;

        if (newIndex >= 0 && newIndex < galleryData.length) {
            this.open(galleryData[newIndex].id);
        }
    }

    renderModal(item) {
        // Implementation would go here - keeping existing modal rendering logic
        // This would replace the existing openModal function content
    }
}

// Global modal manager instance
let modalManager = null;

// Create portal container for modal (Legacy function for compatibility)
function createModalPortal() {
    if (!modalManager) {
        modalManager = new MedBeAfGalleryModalManager();
    }
    return modalManager.portal;
    portal.style.top = '0';
    portal.style.left = '0';
    portal.style.width = '100%';
    portal.style.height = '100%';
    portal.style.zIndex = '9999';
    portal.style.display = 'none';

    // Append to body
    document.body.appendChild(portal);

    return portal;
}

// Move modal to portal when opening
function moveModalToPortal() {
    // Create portal if it doesn't exist
    if (!modalPortal) {
        modalPortal = createModalPortal();
    }

    // Get the original modal
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal) return;

    // Store the original parent for later restoration
    originalModalContainer = modal.parentNode;

    // Move modal to portal
    modalPortal.appendChild(modal);
    modalPortal.style.display = 'block';
}

// Restore modal to original position when closing
function restoreModalPosition() {
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal || !originalModalContainer || !modalPortal) return;

    // Move modal back to original container
    originalModalContainer.appendChild(modal);

    // Hide portal
    modalPortal.style.display = 'none';
}

// Add this helper function near the top of your gallery.js file
function capitalizeSentence(str) {
    if (!str) return '';

    // Handle kebab-case (hyphenated words)
    const words = str.replace(/-/g, ' ').split(' ');

    // Capitalize first letter of each word
    return words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Add this function to load category data
function loadCategoryRelationships() {
// Get the correct REST API base URL
const medbeafgalleryRestBase = (window.medbeafgalleryGalleryConfig && window.medbeafgalleryGalleryConfig.restBase) ? window.medbeafgalleryGalleryConfig.restBase : `${window.location.origin}/wp-json/medical-before-after-gallery/v1`;

return fetch(`${medbeafgalleryRestBase}/categories.json`)
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

    // Get configuration from the container
    const galleryContainer = document.querySelector('.medbeafgallery-container');
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
        console.log('MEDBEAFGALLERY Gallery: Gallery initialized successfully');

        // Initialize the Clear All button
        initClearAllButton();

        // Initialize modal functionality
        initModal();

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

    // Check if CTA button should be hidden based on config
    if (medbeafgalleryGalleryConfig && medbeafgalleryGalleryConfig.showCta === 'false') {
        const ctaButton = document.getElementById('medbeafgallery-cta-button');
        if (ctaButton) {
            ctaButton.style.display = 'none';
        }
    }

    // Debug category structure
    debugCategoryStructure();

    // Load category relationships
    loadCategoryRelationships().then(() => {
    });
});

// Modify the fetchGalleryData function to not recreate the carousel

async function fetchGalleryData() {
    try {
        // Fetch categories (we still need this data)
        const categoriesResponse = await fetch(`${medbeafgalleryRestBase}/categories.json`);
        const categories = await categoriesResponse.json();

        // Add this after fetching categories
        fetch(`${medbeafgalleryRestBase}/categories.json`)
            .then(response => response.json())
            .then(categories => {
                // Rest of your code...
            });

        // Fetch gallery items
        const galleryResponse = await fetch(`${medbeafgalleryRestBase}/gallery-data.json`);
        const galleryResult = await galleryResponse.json();

        // Debug logging for gallery data

        if (galleryResult.cases && galleryResult.cases.length > 0) {

            if (galleryResult.cases[0].imagePairs) {

            }
        }

        // DON'T re-create the carousel, just add events to existing elements
        initCarouselInteractions();

        // Process gallery data
        galleryData = galleryResult.cases.map(item => {
            // Find the category information
            const category = categories.find(cat => cat.slug === item.category) || {};

            // Add the category name to each item
            return {
                ...item,
                categoryName: category.name || 'Uncategorized'
            };
        });

        // Initialize items with all items from the selected category
        galleryConfig.filteredItems = [...galleryData];
        galleryConfig.totalPages = Math.ceil(galleryConfig.filteredItems.length / galleryConfig.itemsPerPage);

        // Render initial gallery items
        renderGalleryItems();


        return galleryData;
    } catch (error) {
        console.error("Error fetching gallery data:", error);
        document.querySelector('.medbeafgallery-loading-indicator').innerHTML =
            '<p>Error loading gallery. Please refresh the page and try again.</p>';
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
            console.log('MEDBEAFGALLERY Gallery: Category changed, rendering items');
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
    console.group('Applying Filters');
    console.log('Current category:', galleryConfig.currentCategory);
    console.log('Current child category:', galleryConfig.currentChildCategory);

    // Reset pagination
    galleryConfig.currentPage = 1;

    // Start with all items
    let filteredItems = [...galleryData];

    console.log('Total items before filtering:', filteredItems.length);

    // Filter by category
    if (galleryConfig.currentCategory !== 'all' && galleryConfig.currentCategory !== 'ba_category_all') {
        filteredItems = filteredItems.filter(item => {
            // Check if item belongs to the selected category
            if (item.categories && item.categories.length > 0) {
                return item.categories.some(cat => cat.slug === galleryConfig.currentCategory);
            }
            // Fallback to checking item.category property
            return item.category === galleryConfig.currentCategory;
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

    console.log('Items after filtering:', filteredItems.length);

    // Update filtered items
    galleryConfig.filteredItems = filteredItems;
    galleryConfig.totalPages = Math.ceil(filteredItems.length / galleryConfig.itemsPerPage);

    // Update filter tags
    updateFilterTags();

    console.groupEnd();
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
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

    // Create the gallery item HTML
    galleryItem.innerHTML = `
        <div class="medbeafgallery-gallery-image-container">
            ${multiViewBadge}
            <div class="medbeafgallery-preview-container">
                <img src="${item.beforeImg}" alt="Before image" class="medbeafgallery-preview-before" loading="lazy">
                <div class="medbeafgallery-preview-divider"></div>
                <img src="${item.afterImg}" alt="After image" class="medbeafgallery-preview-after" loading="lazy">
            </div>
            <button class="medbeafgallery-gallery-view-btn" data-id="${item.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                View Details
            </button>
        </div>
        <div class="medbeafgallery-gallery-item-info">
            <span class="medbeafgallery-gallery-category">${item.categoryName || item.category}</span>
            <h3>${item.title}</h3>

        </div>
    `;

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

// Close the modal - now a global function
function closeModal() {
    const modal = document.getElementById('medbeafgallery-modal');
    if (!modal) return;

    // Hide modal
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // Reset global state
    currentItemId = null;
    currentPairIndex = 0;

    // After transition completes, restore modal position
    setTimeout(() => {
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

// Initialize modal functionality with enhanced features
function initModal() {
    const modal = document.getElementById('medbeafgallery-modal');
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
    const ctaButton = document.getElementById('medbeafgallery-cta-button');

    // Image view control buttons
    const splitViewBtn = document.querySelector('.medbeafgallery-split-view');
    const beforeViewBtn = document.querySelector('.medbeafgallery-before-view');
    const afterViewBtn = document.querySelector('.medbeafgallery-after-view');

    // Tab navigation
    const tabs = document.querySelectorAll('.medbeafgallery-tab');
    const tabContents = document.querySelectorAll('.medbeafgallery-tab-content');

    // Social share buttons
    const shareButtons = {
        facebook: document.querySelector('.medbeafgallery-share-facebook'),
        twitter: document.querySelector('.medbeafgallery-share-twitter'),
        email: document.querySelector('.medbeafgallery-share-email')
    };

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

    // Social sharing
    shareButtons.facebook?.addEventListener('click', function() {
        shareOnSocial('facebook');
    });

    shareButtons.twitter?.addEventListener('click', function() {
        shareOnSocial('twitter');
    });

    shareButtons.email?.addEventListener('click', function() {
        shareOnSocial('email');
    });

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

// Close the modal - now a global function
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

    // Remove any existing loading spinners first
    const existingSpinner = wrapper.querySelector('.medbeafgallery-loading-spinner');
    if (existingSpinner) {
        wrapper.removeChild(existingSpinner);
    }

    // Reset loading state
    wrapper.classList.remove('loading');

    // Add loading indicators if images need to be loaded
    if (pair) {
        // Check if images are already loaded
        const beforeImg = wrapper.querySelector('.medbeafgallery-before-img');
        const afterImg = wrapper.querySelector('.medbeafgallery-after-img');

        const beforeImgLoaded = beforeImg && beforeImg.complete && beforeImg.naturalHeight !== 0;
        const afterImgLoaded = afterImg && afterImg.complete && afterImg.naturalHeight !== 0;

        // Only add loading spinner if at least one image is not loaded yet
        if (!beforeImgLoaded || !afterImgLoaded) {
            wrapper.classList.add('loading');

            // Create loading spinner
            const spinner = document.createElement('div');
            spinner.className = 'medbeafgallery-loading-spinner';
            spinner.innerHTML = `
                <svg viewBox="0 0 50 50" class="spinner">
                    <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
            `;
            wrapper.appendChild(spinner);

            // Image load handling
            let loadedImages = 0;
            const totalImages = (beforeImg && afterImg) ? 2 : 1;

            const checkAllLoaded = () => {
                loadedImages++;
                if (loadedImages >= totalImages) {
                    wrapper.classList.remove('loading');
                    // Remove the spinner after images load
                    const spinnerToRemove = wrapper.querySelector('.medbeafgallery-loading-spinner');
                    if (spinnerToRemove) {
                        wrapper.removeChild(spinnerToRemove);
                    }
                }
            };

            if (beforeImg) {
                if (beforeImgLoaded) {
                    // Image is already loaded
                    loadedImages++;
                } else {
                    // Set up event listeners
                    beforeImg.onload = checkAllLoaded;
                    beforeImg.onerror = checkAllLoaded;
                }
                beforeImg.src = pair.beforeImg || '';
                beforeImg.alt = pair.beforeAlt || `Before - ${item.title}`; // Set alt text
            }

            if (afterImg) {
                if (afterImgLoaded) {
                    // Image is already loaded
                    loadedImages++;
                } else {
                    // Set up event listeners
                    afterImg.onload = checkAllLoaded;
                    afterImg.onerror = checkAllLoaded;
                }
                afterImg.src = pair.afterImg || '';
                afterImg.alt = pair.afterAlt || `After - ${item.title}`; // Set alt text
            }

            // If both images are already loaded, remove loading state immediately
            if (loadedImages >= totalImages) {
                wrapper.classList.remove('loading');
                const spinnerToRemove = wrapper.querySelector('.medbeafgallery-loading-spinner');
                if (spinnerToRemove) {
                    wrapper.removeChild(spinnerToRemove);
                }
            }
        } else {
            // Both images are already loaded
            if (beforeImg) {
                beforeImg.src = pair.beforeImg || '';
                beforeImg.alt = pair.beforeAlt || `Before - ${item.title}`; // Set alt text
            }
            if (afterImg) {
                afterImg.src = pair.afterImg || '';
                afterImg.alt = pair.afterAlt || `After - ${item.title}`; // Set alt text
            }
        }
    }

    // Show this wrapper
    wrapper.classList.add('active');

    // Update pair info text
    if (pairInfoText) {
        pairInfoText.textContent = pair?.description || `View ${index + 1}`;
    }

    // Initialize slider for this pair
    initBeforeAfterSlider(wrapper);

    // IMPORTANT FIX: Apply the saved view mode instead of defaulting to 'split'
    setViewMode(previousViewMode);
}

// Create a new image pair wrapper (also needed globally)
function createImagePairWrapper(pairId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'medbeafgallery-before-after-wrapper';
    wrapper.setAttribute('data-pair-id', pairId);

    wrapper.innerHTML = `
        <img id="medbeafgallery-before-img-${pairId}" src="" alt="" class="medbeafgallery-before-img">
        <img id="medbeafgallery-after-img-${pairId}" src="" alt="" class="medbeafgallery-after-img">
        <div class="medbeafgallery-slider-handle">
            <div class="medbeafgallery-slider-line"></div>
            <div class="medbeafgallery-slider-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        </div>
    `;

    return wrapper;
}

// Initialize before-after slider (needed globally)
function initBeforeAfterSlider(wrapper = null) {
    // If no wrapper is provided, use the active one
    if (!wrapper) {
        wrapper = document.querySelector('.medbeafgallery-before-after-wrapper.active');
    }
    if (!wrapper) return;

    const slider = wrapper.querySelector('.medbeafgallery-slider-handle');
    const afterImage = wrapper.querySelector('.medbeafgallery-after-img');

    if (!slider || !afterImage) return;

    let isDragging = false;

    // Set initial position
    updateSliderPosition(50, slider, afterImage);

    // Mouse events
    slider.addEventListener('mousedown', function(e) {
        startDrag(e, slider, afterImage);
    });

    // Touch events
    slider.addEventListener('touchstart', function(e) {
        startDrag(e, slider, afterImage);
    });

    // Click on wrapper to move slider
    wrapper.addEventListener('click', function(e) {
        if (e.target === slider || currentViewMode !== 'split') return;

        const rect = wrapper.getBoundingClientRect();
        const position = ((e.clientX - rect.left) / rect.width) * 100;
        updateSliderPosition(position, slider, afterImage);
    });

    function startDrag(e, slider, afterImage) {
        if (currentViewMode !== 'split') return;
        e.preventDefault();
        isDragging = true;

        // Use a unique identifier for this slider's drag operations
        const sliderId = slider.getAttribute('data-slider-id') ||
                         `slider-${Math.random().toString(36).substr(2, 9)}`;
        slider.setAttribute('data-slider-id', sliderId);

        // Store the current active slider ID globally
        document.body.setAttribute('data-active-slider', sliderId);

        // Add mousemove and mouseup listeners
        window.addEventListener('mousemove', handleDrag);
        window.addEventListener('touchmove', handleDrag);
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);

        function handleDrag(e) {
            const activeId = document.body.getAttribute('data-active-slider');
            // Only process events for the active slider
            if (!isDragging || currentViewMode !== 'split' || activeId !== sliderId) return;

            e.preventDefault();
            const rect = wrapper.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const position = ((clientX - rect.left) / rect.width) * 100;
            updateSliderPosition(position, slider, afterImage);
        }

        function endDrag() {
            const activeId = document.body.getAttribute('data-active-slider');
            if (activeId === sliderId) {
                isDragging = false;
                document.body.removeAttribute('data-active-slider');

                // Remove event listeners
                window.removeEventListener('mousemove', handleDrag);
                window.removeEventListener('touchmove', handleDrag);
                window.removeEventListener('mouseup', endDrag);
                window.removeEventListener('touchend', endDrag);
            }
        }
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

    const beforeImage = wrapper.querySelector('.medbeafgallery-before-img');
    const afterImage = wrapper.querySelector('.medbeafgallery-after-img');
    const slider = wrapper.querySelector('.medbeafgallery-slider-handle');

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

    // Update image visibility and clip-path
    if (mode === 'before') {
        beforeImage.style.opacity = '1';
        afterImage.style.opacity = '0';
        // Ensure slider is hidden
        slider.style.display = 'none';
    } else if (mode === 'after') {
        beforeImage.style.opacity = '0';
        afterImage.style.opacity = '1';
        // Remove clip-path when in after-only view
        afterImage.style.clipPath = 'none';
        // Ensure slider is hidden
        slider.style.display = 'none';
    } else {
        // Split view
        beforeImage.style.opacity = '1';
        afterImage.style.opacity = '1';
        afterImage.style.clipPath = `inset(0 0 0 50%)`;
        // Show slider and position it at 50%
        slider.style.display = 'flex';
        slider.style.left = '50%';
    }
}

// Update slider position function (needed globally)
function updateSliderPosition(position, slider, afterImage) {
    // Constrain position between 0 and 100
    position = Math.max(0, Math.min(position, 100));

    // Update slider position
    if (slider) {
        slider.style.left = `${position}%`;
    }

    // Update clip-path on after image
    if (afterImage) {
        afterImage.style.clipPath = `inset(0 0 0 ${position}%)`;
    }
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
    const ctaButton = document.getElementById('medbeafgallery-cta-button');
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
    if (caseTitle) caseTitle.textContent = item.title || 'Case Study';
    if (caseDesc) caseDesc.innerHTML = item.description || '';
    if (caseCategory) caseCategory.textContent = item.categoryName || item.category || 'Uncategorized';

    if (caseGender && item.gender) caseGender.textContent = capitalizeSentence(item.gender);
    if (caseAge && item.age) caseAge.textContent = `${item.age} years`;
    if (caseRecovery && item.recovery) caseRecovery.textContent = capitalizeSentence(item.recovery) + ' Recovery';

    // Add new field values with null checks
    if (caseDuration && item.duration) caseDuration.textContent = capitalizeSentence(item.duration) + ' Session';
    if (caseResults && item.results) caseResults.textContent = capitalizeSentence(item.results) + ' Results';

    // Fix procedure type display - show actual procedure type instead of generic text
    if (caseProcedure && item.procedureType) {
        caseProcedure.textContent = capitalizeSentence(item.procedureType);
    } else if (caseProcedure && item.procedure) {
        caseProcedure.textContent = capitalizeSentence(item.procedure);
    }

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

    // Reset to split view
    currentViewMode = 'split';

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

    // Show the first image pair if available
    if (imagePairs.length > 0) {
        showImagePair(item, 0);
    }

    // Update counter with animation
    const currentIndex = galleryConfig.filteredItems.findIndex(i => i.id === item.id) + 1;
    updateModalCounter(currentIndex, galleryConfig.filteredItems.length);

    // Update navigation buttons if they exist
    if (prevButton && nextButton) {
        updateNavigationButtons();
    }

    // Move modal to portal before displaying
    moveModalToPortal();

    // Show modal
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
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
    fetch(`${medbeafgalleryRestBase}/categories.json`)
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
