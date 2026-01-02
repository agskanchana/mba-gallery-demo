/**
 * Category Carousel JavaScript
 *
 * Handles the Swiper carousel initialization for the MBA Gallery category carousel shortcode.
 * Modal functionality is handled by the main gallery.js file.
 */

(function($) {
    'use strict';

    // Initialize when DOM is ready
    $(document).ready(function() {
        console.log('MBA Gallery: DOM ready, initializing carousels');
        initializeCategoryCarousels();
        bindCarouselEvents();
        
        // Clean up any old carousel modal elements on page load
        cleanupOldCarouselModal();

        // Test if carousel items exist
        setTimeout(function() {
            const carouselItems = $('.mba-category-carousel-container .mba-gallery-item');
            console.log('MBA Gallery: Found', carouselItems.length, 'carousel items');
            carouselItems.each(function(index) {
                console.log('MBA Gallery: Item', index, 'has case-id:', $(this).data('case-id'));
            });
        }, 1000);
    });
    
    /**
     * Clean up old carousel modal elements that might cause conflicts
     */
    function cleanupOldCarouselModal() {
        // Remove any old carousel modal elements from the DOM
        $('.mba-carousel-modal').remove();
        $('body').removeClass('mba-carousel-modal-open');
    }

    /**
     * Initialize all category carousels on the page
     */
    function initializeCategoryCarousels() {
        $('.mba-category-carousel-container').each(function() {
            const container = $(this);
            const carouselId = container.data('carousel-id');

            if (!carouselId) {
                console.warn('MBA Gallery: Carousel ID not found');
                return;
            }

            // Extract case data from carousel items and add to global galleryData
            populateGalleryDataFromCarousel(container);

            initializeSwiper(carouselId);
        });
    }

    /**
     * Extract case data from carousel and add to global galleryData for main modal system
     */
    function populateGalleryDataFromCarousel(container) {
        // Initialize global galleryData if it doesn't exist
        if (typeof window.galleryData === 'undefined') {
            window.galleryData = [];
        }

        container.find('.mba-gallery-item').each(function() {
            const $item = $(this);
            const caseId = parseInt($item.data('case-id'));

            if (!caseId) return;

            // Check if this case is already in galleryData (check both number and string)
            const existingItem = window.galleryData.find(item => item.id == caseId);
            if (existingItem) {
                return; // Skip if already added
            }

            // Extract data from the DOM element
            const title = $item.find('h3').text() || '';
            const category = $item.find('.mba-gallery-category').text() || '';
            const beforeImg = $item.find('.mba-preview-before img').attr('src') || '';
            const afterImg = $item.find('.mba-preview-after img').attr('src') || '';

            // Extract metadata if available
            const metaItems = $item.find('.mba-meta-item');
            let gender = '', ageRange = '', procedureType = '';

            metaItems.each(function() {
                const text = $(this).text();
                if (text.includes('Female') || text.includes('Male')) {
                    gender = text.toLowerCase();
                } else if (text.includes('years') || text.includes('-')) {
                    ageRange = text.replace(' years', '');
                } else {
                    procedureType = text;
                }
            });

            // Create a gallery data item compatible with the main modal system
            // NOTE: Use camelCase to match the format expected by gallery.js openModal function
            const galleryItem = {
                id: caseId,
                title: title,
                description: '', // Will be fetched when modal opens
                category: category,
                categoryName: category,
                gender: gender,
                age: ageRange,
                recovery: '',
                duration: '',
                results: '',
                procedureType: procedureType,
                mainBeforeImage: beforeImg,
                mainAfterImage: afterImg,
                imagePairs: [
                    {
                        before: beforeImg,
                        after: afterImg,
                        description: 'Main View'
                    }
                ]
            };

            window.galleryData.push(galleryItem);
            console.log('MBA Gallery: Added carousel case to galleryData:', caseId, galleryItem);
        });
    }

    /**
     * Bind carousel-specific events
     */
    function bindCarouselEvents() {
        console.log('MBA Gallery: Binding carousel events');

        // Handle carousel item clicks for modal
        $(document).on('click', '.mba-category-carousel-container .mba-gallery-item', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const $item = $(this);
            const caseId = $item.data('case-id');
            console.log('MBA Gallery: Carousel item clicked, case ID:', caseId);

            if (caseId) {
                // Initialize carousel context BEFORE opening modal
                const carouselContainer = $item.closest('.mba-category-carousel-container');
                const carouselItems = carouselContainer.find('.mba-gallery-item');
                const carouselCaseIds = [];

                carouselItems.each(function() {
                    const id = parseInt($(this).data('case-id'));
                    if (id) carouselCaseIds.push(id);
                });

                const currentIndex = carouselCaseIds.findIndex(id => id == caseId);

                console.log('MBA Gallery: Setting up carousel context');
                console.log('MBA Gallery: Carousel case IDs:', carouselCaseIds);
                console.log('MBA Gallery: Current index:', currentIndex);

                // Set up carousel context
                carouselModalContext = {
                    isCarouselModal: true,
                    carouselItems: carouselCaseIds,
                    currentIndex: currentIndex >= 0 ? currentIndex : 0
                };
                window.carouselModalContext = carouselModalContext;

                // Clean up any old carousel modal before opening
                cleanupOldCarouselModal();

                // Try to use the main gallery modal system
                if (typeof window.openModal === 'function') {
                    console.log('MBA Gallery: Using main gallery modal system');
                    try {
                        window.openModal(caseId);
                        
                        // Apply carousel-specific settings after modal opens
                        setTimeout(() => {
                            updateCarouselModalCounter(caseId);
                            overrideModalNavigation();
                            
                            if (typeof window.manageViewControls === 'function') {
                                window.manageViewControls();
                            }
                            if (typeof window.manageCaseDetailsVisibility === 'function') {
                                window.manageCaseDetailsVisibility();
                            }
                        }, 300);
                    } catch (error) {
                        console.error('MBA Gallery: Error with main gallery modal:', error);
                        // Don't fall back to old carousel modal - it causes issues
                        console.error('MBA Gallery: Modal failed to open');
                    }
                } else {
                    console.log('MBA Gallery: Main gallery modal not available');
                    // Don't use old carousel modal - it interferes with navigation
                    console.error('MBA Gallery: Main modal system is required');
                }
            } else {
                console.warn('MBA Gallery: Case ID missing');
            }
        });

        // Handle view button clicks specifically
        $(document).on('click', '.mba-category-carousel-container .mba-gallery-view-btn', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const galleryItem = $(this).closest('.mba-gallery-item');
            const caseId = galleryItem.data('case-id');
            console.log('MBA Gallery: View button clicked, case ID:', caseId);

            if (caseId) {
                // Initialize carousel context immediately
                const carouselContainer = $(this).closest('.mba-category-carousel-container');
                const carouselItems = carouselContainer.find('.mba-gallery-item');
                const carouselCaseIds = [];

                carouselItems.each(function() {
                    const id = parseInt($(this).data('case-id'));
                    if (id) carouselCaseIds.push(id);
                });

                const currentIndex = carouselCaseIds.findIndex(id => id == caseId);

                console.log('MBA Gallery: Initializing carousel context');
                console.log('MBA Gallery: Carousel case IDs:', carouselCaseIds);
                console.log('MBA Gallery: Current case ID:', caseId, 'Index:', currentIndex);

                // Set up carousel context before opening modal
                carouselModalContext = {
                    isCarouselModal: true,
                    carouselItems: carouselCaseIds,
                    currentIndex: currentIndex
                };

                // Try to use the main gallery modal system first
                // Clean up any old carousel modal before opening
                cleanupOldCarouselModal();

                if (typeof window.openModal === 'function') {
                    console.log('MBA Gallery: Using main gallery modal system');

                    // Check if the case exists in galleryData
                    if (window.galleryData && Array.isArray(window.galleryData)) {
                        const foundCase = window.galleryData.find(item => item.id == caseId);
                        console.log('MBA Gallery: Found case in galleryData:', foundCase);
                    }

                    // Check if main gallery modal DOM elements exist
                    const mainModalPortal = document.getElementById('mba-modal-portal');
                    let mainModal = document.getElementById('mba-modal');

                    if (!mainModalPortal) {
                        console.log('MBA Gallery: Main gallery modal portal not found');
                        return;
                    }

                    if (!mainModal) {
                        console.log('MBA Gallery: Main gallery modal not initialized, attempting to initialize...');

                        // Try to initialize the main modal
                        if (typeof window.initMainModal === 'function') {
                            try {
                                window.initMainModal();
                                mainModal = document.getElementById('mba-modal');
                            } catch (error) {
                                console.warn('MBA Gallery: Failed to initialize main modal:', error);
                            }
                        }

                        // If still no modal, create a basic one for the carousel
                        if (!mainModal) {
                            console.log('MBA Gallery: Creating main modal for carousel use');
                            createMainModalForCarousel();
                            mainModal = document.getElementById('mba-modal');
                        }

                        if (!mainModal) {
                            console.log('MBA Gallery: Unable to create main modal');
                            return;
                        }
                    }
                    
                    try {
                        window.openModal(caseId);
                        console.log('MBA Gallery: openModal called successfully');

                        // Update modal counter to reflect carousel items only
                        // Increased delay to ensure modal is fully rendered
                        setTimeout(() => {
                            updateCarouselModalCounter(caseId);
                            overrideModalNavigation();
                            
                            // Apply display settings (side-by-side, hide case details)
                            if (typeof window.manageViewControls === 'function') {
                                window.manageViewControls();
                            }
                            if (typeof window.manageCaseDetailsVisibility === 'function') {
                                window.manageCaseDetailsVisibility();
                            }
                        }, 300);
                    } catch (error) {
                        console.error('MBA Gallery: Error with main gallery modal:', error);
                        // Don't fall back to old carousel modal
                        console.error('MBA Gallery: Modal failed to open');
                    }
                } else {
                    console.log('MBA Gallery: Main gallery modal not available');
                    // Don't use old carousel modal
                    console.error('MBA Gallery: Main modal system is required');
                }
            } else {
                console.warn('MBA Gallery: Case ID missing');
            }
        });

        // Handle modal close to restore counter for main gallery
        $(document).on('click', '.mba-modal-close', function() {
            // Clean up carousel modal state when modal is closed
            setTimeout(() => {
                restoreModalCounter();
            }, 100);
        });
    }

    /**
     * Restore modal counter when carousel modal is closed
     */
    function restoreModalCounter() {
        const modal = document.getElementById('mba-modal');
        if (modal && modal.classList.contains('mba-carousel-modal-active')) {
            modal.classList.remove('mba-carousel-modal-active');

            // Remove the custom CSS
            const customStyle = document.head.querySelector('[data-carousel-counter-hide]');
            if (customStyle) {
                customStyle.remove();
            }

            // Restore counter visibility
            const counterWrapper = document.querySelector('.mba-modal-counter-wrapper');
            const modalCounter = document.querySelector('.mba-modal-counter');

            if (counterWrapper) {
                counterWrapper.style.display = '';
                counterWrapper.style.visibility = '';
            }

            if (modalCounter) {
                modalCounter.style.display = '';
                modalCounter.style.visibility = '';
            }

            // Reset carousel context
            carouselModalContext = {
                isCarouselModal: false,
                carouselItems: [],
                currentIndex: 0
            };

            console.log('MBA Gallery: Restored modal counter for main gallery');
        }
    }

    /**
     * Create basic main modal structure for carousel use
     */
    function createMainModalForCarousel() {
        console.log('MBA Gallery: Creating main modal structure for carousel');

        const modalPortal = document.getElementById('mba-modal-portal');
        if (!modalPortal) {
            console.error('MBA Gallery: Modal portal not found');
            return;
        }

        // Create the exact modal structure that gallery.js expects
        const modalHTML = `
            <div id="mba-modal" class="mba-modal">
                <div class="mba-modal-content">
                    <div class="mba-modal-header">
                        <h2 id="mba-case-title">Case Study Title</h2>

                        <!-- Image Controls -->
                        <div class="mba-image-controls">
                            <button class="mba-control-btn mba-split-view active" title="Split view">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"></line><path d="M8 8l-4 4 4 4"></path><path d="M16 16l4-4-4-4"></path></svg>
                            </button>
                            <button class="mba-control-btn mba-before-view" title="Before view">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"></rect><rect x="8" y="9" width="8" height="8"></rect></svg>
                            </button>
                            <button class="mba-control-btn mba-after-view" title="After view">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"></rect><rect x="8" y="9" width="8" height="8"></rect><circle cx="12" cy="13" r="2"></circle></svg>
                            </button>
                        </div>

                        <!-- Image Pair Info -->
                        <div class="mba-pair-info">
                            <span class="mba-pair-description">Front View</span>
                        </div>

                        <button class="mba-modal-close" aria-label="Close modal">&times;</button>
                    </div>

                    <div class="mba-modal-body">
                        <div class="mba-comparison-container">
                            <!-- Image Pairs Navigation -->
                            <div class="mba-image-pairs-nav">
                                <button class="mba-pair-nav mba-pair-prev" title="Previous image pair">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <div class="mba-pair-indicators">
                                    <!-- Will be populated dynamically -->
                                </div>
                                <button class="mba-pair-nav mba-pair-next" title="Next image pair">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>

                            <!-- Image Sets Container -->
                            <div class="mba-image-sets-container">
                                <div class="mba-before-after-wrapper active" data-pair-id="1">
                                    <img id="mba-before-img-1" src="" alt="Before" class="mba-before-img">
                                    <img id="mba-after-img-1" src="" alt="After" class="mba-after-img">
                                    <div class="mba-slider-handle">
                                        <div class="mba-slider-line"></div>
                                        <div class="mba-slider-button">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="15 18 9 12 15 6"></polyline>
                                            </svg>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Image View Labels -->
                            <div class="mba-labels">
                                <div class="mba-before-label">Before</div>
                                <div class="mba-after-label">After</div>
                            </div>
                        </div>

                        <div class="mba-case-details">
                            <div class="mba-case-tabs">
                                <button class="mba-tab active" data-tab="description">Description</button>
                                <button class="mba-tab" data-tab="details">Details</button>
                            </div>

                            <div class="mba-tab-content active" data-tab="description">
                                <div id="mba-case-description">Case study description will appear here.</div>
                            </div>

                            <div class="mba-tab-content" data-tab="details">
                                <div class="mba-detail-grid">
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Category</span>
                                        <span id="mba-case-category" class="mba-detail-value">Category</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Gender</span>
                                        <span id="mba-case-gender" class="mba-detail-value">Gender</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Age</span>
                                        <span id="mba-case-age" class="mba-detail-value">Age</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Recovery</span>
                                        <span id="mba-case-recovery" class="mba-detail-value">Recovery</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Duration</span>
                                        <span id="mba-case-duration" class="mba-detail-value">Duration</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Results</span>
                                        <span id="mba-case-results" class="mba-detail-value">Results</span>
                                    </div>
                                    <div class="mba-detail-item">
                                        <span class="mba-detail-label">Type</span>
                                        <span id="mba-case-procedure" class="mba-detail-value">Type</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Modal Navigation -->
                    <div class="mba-modal-nav">
                        <div class="mba-modal-nav-container">
                            <button class="mba-modal-prev" title="Previous case">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                            <div class="mba-modal-counter-wrapper">
                                <div class="mba-modal-counter">
                                    <span id="mba-current-item">1</span>
                                    <span class="mba-counter-separator"> / </span>
                                    <span id="mba-total-items">1</span>
                                </div>
                            </div>
                            <button class="mba-modal-next" title="Next case">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalPortal.innerHTML = modalHTML;

        // Add modal event handlers to make controls work
        setupModalEventHandlers(modalPortal);

        console.log('MBA Gallery: Main modal structure created successfully');
    }

    /**
     * Set up event handlers for modal controls
     */
    function setupModalEventHandlers(modalPortal) {
        console.log('MBA Gallery: Setting up modal event handlers');

        // Tab navigation
        const tabs = modalPortal.querySelectorAll('.mba-tab');
        const tabContents = modalPortal.querySelectorAll('.mba-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');

                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Add active class to selected tab and content
                this.classList.add('active');
                modalPortal.querySelector(`.mba-tab-content[data-tab="${tabId}"]`).classList.add('active');
            });
        });

        // Image view controls
        const splitViewBtn = modalPortal.querySelector('.mba-split-view');
        const beforeViewBtn = modalPortal.querySelector('.mba-before-view');
        const afterViewBtn = modalPortal.querySelector('.mba-after-view');

        splitViewBtn?.addEventListener('click', function() {
            // Try to use main gallery function first
            if (typeof window.setViewMode === 'function') {
                window.setViewMode('split');
            } else {
                setModalViewMode('split', modalPortal);
            }
        });

        beforeViewBtn?.addEventListener('click', function() {
            // Try to use main gallery function first
            if (typeof window.setViewMode === 'function') {
                window.setViewMode('before');
            } else {
                setModalViewMode('before', modalPortal);
            }
        });

        afterViewBtn?.addEventListener('click', function() {
            // Try to use main gallery function first
            if (typeof window.setViewMode === 'function') {
                window.setViewMode('after');
            } else {
                setModalViewMode('after', modalPortal);
            }
        });

        // Image pair navigation
        const pairPrevBtn = modalPortal.querySelector('.mba-pair-prev');
        const pairNextBtn = modalPortal.querySelector('.mba-pair-next');

        pairPrevBtn?.addEventListener('click', function() {
            // Try to use main gallery function first
            if (typeof window.navigateImagePairs === 'function') {
                window.navigateImagePairs('prev');
            } else {
                navigateModalImagePairs('prev', modalPortal);
            }
        });

        pairNextBtn?.addEventListener('click', function() {
            // Try to use main gallery function first
            if (typeof window.navigateImagePairs === 'function') {
                window.navigateImagePairs('next');
            } else {
                navigateModalImagePairs('next', modalPortal);
            }
        });        // Modal close functionality
        const closeBtn = modalPortal.querySelector('.mba-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                if (typeof window.closeModal === 'function') {
                    window.closeModal();
                } else {
                    modalPortal.style.display = 'none';
                    document.body.style.overflow = '';
                }
            });
        }
    }

    /**
     * Set view mode for modal images
     */
    function setModalViewMode(mode, modalPortal) {
        console.log('MBA Gallery: Setting view mode to', mode);

        // Get the active wrapper
        const wrapper = modalPortal.querySelector('.mba-before-after-wrapper.active');
        if (!wrapper) {
            console.warn('MBA Gallery: No active wrapper found');
            return;
        }

        // Get the comparison container that contains the labels
        const comparisonContainer = modalPortal.querySelector('.mba-comparison-container');

        // Get control buttons
        const splitViewBtn = modalPortal.querySelector('.mba-split-view');
        const beforeViewBtn = modalPortal.querySelector('.mba-before-view');
        const afterViewBtn = modalPortal.querySelector('.mba-after-view');

        // Remove active class from all control buttons
        [splitViewBtn, beforeViewBtn, afterViewBtn].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });

        // Add active class to the clicked button
        const activeBtn = modalPortal.querySelector(`.mba-${mode}-view`);
        if (activeBtn) activeBtn.classList.add('active');

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

        console.log('MBA Gallery: View mode applied:', mode);
    }    /**
     * Navigate between image pairs in modal
     */
    function navigateModalImagePairs(direction, modalPortal) {
        console.log('MBA Gallery: Navigating image pairs', direction);

        // This is a basic implementation - you might need to enhance based on your data
        const pairIndicators = modalPortal.querySelector('.mba-pair-indicators');
        const currentDots = pairIndicators?.querySelectorAll('.active');

        if (currentDots && currentDots.length > 0) {
            const currentIndex = Array.from(pairIndicators.children).indexOf(currentDots[0]);
            const totalDots = pairIndicators.children.length;

            let newIndex;
            if (direction === 'prev') {
                newIndex = currentIndex > 0 ? currentIndex - 1 : totalDots - 1;
            } else {
                newIndex = currentIndex < totalDots - 1 ? currentIndex + 1 : 0;
            }

            // Trigger click on the new dot
            pairIndicators.children[newIndex]?.click();
        }
    }

    /**
     * Store carousel context for modal navigation
     */
    let carouselModalContext = {
        isCarouselModal: false,
        carouselItems: [],
        currentIndex: 0
    };

    // Also store globally for access across different scopes
    window.carouselModalContext = carouselModalContext;

    /**
     * Update modal counter to reflect carousel items only
     */
    function updateCarouselModalCounter(currentCaseId) {
        console.log('MBA Gallery: Updating carousel modal counter for case ID:', currentCaseId);

        // Get carousel items from the DOM - be more specific about which carousel
        const carouselContainer = document.querySelector('.mba-category-carousel-container');
        if (!carouselContainer) {
            console.warn('MBA Gallery: No carousel container found - this may not be a carousel modal');
            return;
        }

        console.log('MBA Gallery: Found carousel container:', carouselContainer);

        const carouselItems = Array.from(carouselContainer.querySelectorAll('.mba-gallery-item'));
        console.log('MBA Gallery: Found', carouselItems.length, 'carousel items in container');

        const carouselCaseIds = carouselItems.map((item, index) => {
            const id = parseInt(item.getAttribute('data-case-id'));
            console.log('MBA Gallery: Carousel item', index, 'has case ID:', id, 'element:', item);
            return id;
        }).filter(id => !isNaN(id));

        console.log('MBA Gallery: Final carousel case IDs:', carouselCaseIds);
        console.log('MBA Gallery: Looking for case ID:', currentCaseId, 'Type:', typeof currentCaseId);

        // Check if there might be other gallery items on the page confusing things
        const allGalleryItems = document.querySelectorAll('.mba-gallery-item');
        console.log('MBA Gallery: Total gallery items on page:', allGalleryItems.length);
        console.log('MBA Gallery: Carousel items count:', carouselItems.length);

        // Find current index in carousel items
        const currentIndex = carouselCaseIds.findIndex(id => id == currentCaseId);
        const totalItems = carouselCaseIds.length;

        console.log('MBA Gallery: Current index:', currentIndex, 'Total items:', totalItems);

        // Update carousel context
        carouselModalContext = {
            isCarouselModal: true,
            carouselItems: carouselCaseIds,
            currentIndex: currentIndex
        };

        // Hide the modal counter for carousel modals instead of trying to fix numbers
        function hideModalCounter() {
            const counterWrapper = document.querySelector('.mba-modal-counter-wrapper');
            const modalCounter = document.querySelector('.mba-modal-counter');

            if (counterWrapper) {
                counterWrapper.style.display = 'none';
                counterWrapper.style.visibility = 'hidden';
                console.log('MBA Gallery: Hid modal counter wrapper for carousel');
            }

            if (modalCounter) {
                modalCounter.style.display = 'none';
                modalCounter.style.visibility = 'hidden';
                console.log('MBA Gallery: Hid modal counter for carousel');
            }

            // Add a class to the modal to indicate it's a carousel modal
            const modal = document.getElementById('mba-modal');
            if (modal) {
                modal.classList.add('mba-carousel-modal-active');

                // Add inline CSS to ensure counter stays hidden
                const style = document.createElement('style');
                style.textContent = `
                    .mba-carousel-modal-active .mba-modal-counter-wrapper,
                    .mba-carousel-modal-active .mba-modal-counter {
                        display: none !important;
                        visibility: hidden !important;
                    }
                `;
                if (!document.head.querySelector('[data-carousel-counter-hide]')) {
                    style.setAttribute('data-carousel-counter-hide', 'true');
                    document.head.appendChild(style);
                }

                console.log('MBA Gallery: Added carousel modal class and CSS');
            }
        }

        // Hide immediately and then again after delays to ensure it sticks
        hideModalCounter();
        setTimeout(hideModalCounter, 50);
        setTimeout(hideModalCounter, 100);
        setTimeout(hideModalCounter, 200);
    }    /**
     * Override modal navigation to use carousel items only
     */
    function overrideModalNavigation() {
        console.log('MBA Gallery: Overriding modal navigation for carousel');

        const prevBtn = document.querySelector('.mba-modal-prev');
        const nextBtn = document.querySelector('.mba-modal-next');

        if (!prevBtn || !nextBtn) {
            console.warn('MBA Gallery: Navigation buttons not found');
            return;
        }

        if (!carouselModalContext.isCarouselModal || carouselModalContext.carouselItems.length === 0) {
            console.warn('MBA Gallery: No carousel context available');
            return;
        }

        // Store carousel context globally to prevent it from being lost
        window.carouselModalContext = carouselModalContext;

        // Remove ALL existing event listeners by cloning the elements
        const newPrevBtn = prevBtn.cloneNode(true);
        const newNextBtn = nextBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);

        // Add new event listeners for carousel navigation with capture phase
        newPrevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log('MBA Gallery: Previous button clicked in carousel modal');
            navigateCarouselModal('prev');
        }, true);

        newNextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log('MBA Gallery: Next button clicked in carousel modal');
            navigateCarouselModal('next');
        }, true);

        // Also add regular phase listeners as backup
        newPrevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            navigateCarouselModal('prev');
        });

        newNextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            navigateCarouselModal('next');
        });

        // Set up counter protection to prevent main gallery from overwriting
        setupCounterProtection();

        console.log('MBA Gallery: Modal navigation overridden for', carouselModalContext.carouselItems.length, 'carousel items');
    }

    /**
     * Set up counter hiding for carousel modals
     */
    function setupCounterProtection() {
        if (!carouselModalContext.isCarouselModal) return;

        // Hide the counter elements for carousel modals
        const counterWrapper = document.querySelector('.mba-modal-counter-wrapper');
        const modalCounter = document.querySelector('.mba-modal-counter');

        if (counterWrapper) {
            counterWrapper.style.display = 'none';
            console.log('MBA Gallery: Counter wrapper hidden for carousel modal');
        }

        if (modalCounter) {
            modalCounter.style.display = 'none';
            console.log('MBA Gallery: Counter hidden for carousel modal');
        }

        // Add a class to the modal to indicate it's a carousel modal
        const modal = document.getElementById('mba-modal');
        if (modal) {
            modal.classList.add('mba-carousel-modal-active');
        }

        console.log('MBA Gallery: Counter hidden for carousel modal');
    }    /**
     * Navigate between carousel items in modal
     */
    function navigateCarouselModal(direction) {
        console.log('MBA Gallery: Navigating carousel modal', direction);

        // Use global carousel context if local one is not available
        const context = carouselModalContext.isCarouselModal ? carouselModalContext : window.carouselModalContext;

        if (!context || !context.isCarouselModal || context.carouselItems.length === 0) {
            console.warn('MBA Gallery: No carousel context for navigation');
            return;
        }

        const currentIndex = context.currentIndex;
        const totalItems = context.carouselItems.length;
        let newIndex;

        if (direction === 'prev') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        } else {
            newIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        }

        const newCaseId = context.carouselItems[newIndex];
        console.log('MBA Gallery: Navigating from index', currentIndex, 'to index', newIndex, 'case ID:', newCaseId);

        // Update both local and global context BEFORE navigation
        context.currentIndex = newIndex;
        carouselModalContext.currentIndex = newIndex;
        if (window.carouselModalContext) {
            window.carouselModalContext.currentIndex = newIndex;
        }

        // Set flag to prevent modal restoration during navigation
        if (typeof window.setCarouselNavigating === 'function') {
            window.setCarouselNavigating(true);
        }

        // Get current modal state
        const modal = document.getElementById('mba-modal');
        
        // Don't close the modal - just update the content directly
        if (typeof window.openModal === 'function') {
            // Open the new case (this will update the modal content)
            window.openModal(newCaseId);

            // Update counter and navigation after modal opens
            setTimeout(() => {
                updateCarouselModalCounter(newCaseId);
                overrideModalNavigation();
                
                // Re-apply display settings after navigation
                if (typeof window.manageViewControls === 'function') {
                    window.manageViewControls();
                }
                if (typeof window.manageCaseDetailsVisibility === 'function') {
                    window.manageCaseDetailsVisibility();
                }
                
                // Reset the navigation flag
                if (typeof window.setCarouselNavigating === 'function') {
                    window.setCarouselNavigating(false);
                }
            }, 250);
        }
    }    /**
     * Initialize Swiper carousel
     * @param {string} carouselId - Unique identifier for the carousel
     */
    function initializeSwiper(carouselId) {
        if (typeof Swiper === 'undefined') {
            console.error('MBA Gallery: Swiper library not loaded');
            return;
        }

        // Get configuration from localized script using unique identifier
        const configVar = `mbaCarouselConfig_${carouselId.replace('mba-carousel-', '')}`;
        const config = window[configVar] || {};

        // Swiper configuration
        const swiperOptions = {
            slidesPerView: 1,
            spaceBetween: parseInt(config.spaceBetween) || 20,
            loop: config.loop !== false,

            // Navigation
            navigation: config.navigation !== false ? {
                nextEl: `.${carouselId} .swiper-button-next`,
                prevEl: `.${carouselId} .swiper-button-prev`,
            } : false,

            // Pagination
            pagination: config.dots !== false ? {
                el: `.${carouselId} .swiper-pagination`,
                clickable: true,
            } : false,

            // Autoplay
            autoplay: config.autoplay ? {
                delay: parseInt(config.autoplaySpeed) || 3000,
                disableOnInteraction: false,
            } : false,

            // Responsive breakpoints
            breakpoints: config.breakpoints !== false ? {
                // Mobile
                320: {
                    slidesPerView: 1,
                    spaceBetween: 10
                },
                // Tablet
                768: {
                    slidesPerView: Math.min(2, parseInt(config.itemsPerView) || 3),
                    spaceBetween: parseInt(config.spaceBetween) || 20
                },
                // Desktop
                1024: {
                    slidesPerView: parseInt(config.itemsPerView) || 3,
                    spaceBetween: parseInt(config.spaceBetween) || 20
                }
            } : {}
        };

        // Initialize Swiper
        try {
            const swiper = new Swiper(`.${carouselId}`, swiperOptions);
            console.log('MBA Gallery: Swiper carousel initialized successfully for', carouselId);
            console.log('MBA Gallery: Swiper configuration:', swiperOptions);

            // Log slide count for debugging
            setTimeout(() => {
                console.log('MBA Gallery: Total slides:', swiper.slides.length);
                console.log('MBA Gallery: Active slide index:', swiper.activeIndex);
            }, 100);

        } catch (error) {
            console.error('MBA Gallery: Error initializing Swiper carousel:', error);
        }
    }

    /**
     * Open modal for carousel item
     * @param {number} caseId - The case post ID
     */
    function openCarouselModal(caseId) {
        console.log('MBA Gallery: Opening carousel modal for case ID:', caseId);

        // Create modal if it doesn't exist
        if (!$('.mba-carousel-modal').length) {
            createModalContainer();
        }

        const modal = $('.mba-carousel-modal');
        const modalContent = modal.find('.mba-carousel-modal-content');

        // Show loading state
        modalContent.html(`
            <div class="mba-carousel-modal-loading">
                <div class="mba-loading-spinner"></div>
                <p>Loading case details...</p>
            </div>
        `);

        modal.addClass('active');
        $('body').addClass('mba-carousel-modal-open');

        // Fetch case data using WordPress AJAX
        fetchCaseDataAjax(caseId)
            .then(function(caseData) {
                renderCarouselModal(caseData);
            })
            .catch(function(error) {
                console.error('MBA Gallery: Error loading case data:', error);
                modalContent.html(`
                    <div class="mba-carousel-modal-error">
                        <h3>Error Loading Case</h3>
                        <p>Unable to load case details. Please try again.</p>
                        <button class="mba-carousel-modal-close" type="button">Close</button>
                    </div>
                `);
            });
    }

    /**
     * Create modal container
     */
    function createModalContainer() {
        const modalHtml = `
            <div class="mba-carousel-modal">
                <div class="mba-carousel-modal-overlay"></div>
                <div class="mba-carousel-modal-container">
                    <div class="mba-carousel-modal-content">
                        <!-- Content will be populated by JavaScript -->
                    </div>
                </div>
            </div>
        `;
        $('body').append(modalHtml);
    }

    /**
     * Fetch case data using WordPress AJAX
     * @param {number} caseId - The case post ID
     * @returns {Promise} Promise that resolves with case data
     */
    function fetchCaseDataAjax(caseId) {
        // Get the proper AJAX URL from configuration or fallback to site URL
        const ajaxUrl = (window.mbaGalleryConfig && window.mbaGalleryConfig.ajaxUrl)
            ? window.mbaGalleryConfig.ajaxUrl
            : `${window.location.origin}/wp-admin/admin-ajax.php`;

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: ajaxUrl,
                method: 'POST',
                data: {
                    action: 'mba_get_case_data',
                    case_id: caseId,
                    nonce: window.mbaGalleryConfig?.nonce || ''
                },
                success: function(response) {
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data || 'Failed to load case data'));
                    }
                },
                error: function(xhr, status, error) {
                    reject(new Error('Network error: ' + error));
                }
            });
        });
    }

    /**
     * Render case modal content
     * @param {Object} caseData - Case data from server
     */
    function renderCarouselModal(caseData) {
        if (!caseData) {
            throw new Error('No case data provided');
        }

        const modalContent = $('.mba-carousel-modal-content');

        // Build modal HTML
        let html = `
            <div class="mba-carousel-modal-header">
                <h2>${caseData.title || 'Case Details'}</h2>
                <button class="mba-carousel-modal-close" type="button" aria-label="Close modal">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="mba-carousel-modal-body">
        `;

        // Main before/after images
        if (caseData.main_before_image || caseData.main_after_image) {
            html += `
                <div class="mba-carousel-modal-main-images">
                    <div class="mba-before-after-container">
            `;

            if (caseData.main_before_image) {
                html += `
                    <div class="mba-before-image">
                        <img src="${caseData.main_before_image}" alt="Before - ${caseData.title}" />
                        <span class="mba-image-label">Before</span>
                    </div>
                `;
            }

            if (caseData.main_after_image) {
                html += `
                    <div class="mba-after-image">
                        <img src="${caseData.main_after_image}" alt="After - ${caseData.title}" />
                        <span class="mba-image-label">After</span>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        // Case details
        if (caseData.categories && caseData.categories.length > 0) {
            html += `
                <div class="mba-carousel-modal-categories">
                    <strong>Category:</strong> ${caseData.categories.map(cat => cat.name).join(', ')}
                </div>
            `;
        }

        // Meta information
        if (caseData.meta) {
            html += '<div class="mba-carousel-modal-meta">';
            if (caseData.meta.gender) {
                html += `<span class="mba-meta-item">Gender: ${caseData.meta.gender}</span>`;
            }
            if (caseData.meta.age_range) {
                html += `<span class="mba-meta-item">Age: ${caseData.meta.age_range}</span>`;
            }
            if (caseData.meta.procedure_type) {
                html += `<span class="mba-meta-item">Procedure: ${caseData.meta.procedure_type}</span>`;
            }
            html += '</div>';
        }

        if (caseData.content) {
            html += `
                <div class="mba-carousel-modal-description">
                    ${caseData.content}
                </div>
            `;
        }

        // Additional images gallery
        if (caseData.additional_images && caseData.additional_images.length > 0) {
            html += `
                <div class="mba-carousel-modal-additional-images">
                    <h3>Additional Images</h3>
                    <div class="mba-additional-gallery">
            `;

            caseData.additional_images.forEach(function(image, index) {
                html += `
                    <div class="mba-additional-item">
                        <img src="${image.url}" alt="${image.alt || `Additional image ${index + 1}`}" />
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>'; // Close modal-body

        modalContent.html(html);
    }

    /**
     * Close the carousel modal
     */
    function closeCarouselModal() {
        $('.mba-carousel-modal').removeClass('active');
        $('body').removeClass('mba-carousel-modal-open');

        // Clear modal content after animation
        setTimeout(function() {
            $('.mba-carousel-modal-content').empty();
        }, 300);
    }

})(jQuery);
