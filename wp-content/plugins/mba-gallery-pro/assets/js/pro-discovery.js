/* global galleryConfig, galleryData */
( function () {
    'use strict';

    const settings = window.mbaGalleryProDiscovery;
    if ( !settings || ( !settings.mapEnabled && !settings.guideEnabled ) ) {
        return;
    }
    const strings = settings.i18n;
    const regions = {};
    Object.keys( settings.figures ).forEach( function ( figure ) {
        Object.keys( settings.figures[figure].regions ).forEach( function ( id ) {
            if ( !regions[id] ) { regions[id] = settings.figures[figure].regions[id]; }
        } );
    } );
    let toolbar = null;
    let ready = false;
    let initialized = false;
    let receivedData = false;
    let activeArea = '';
    let activeAnswers = null;
    let baseItems = [];
    let transformRuns = 0;
    let dialog = null;
    let mapSerial = 0;

    function format( template, a, b ) {
        return template.replace( /%(?:([12])\$)?[sd]/g, function ( match, index ) { return String( index === '2' ? b : a ); } );
    }

    function countLabel( count, matching ) {
        return format( strings[matching ? ( count === 1 ? 'oneMatch' : 'matches' ) : ( count === 1 ? 'oneCase' : 'cases' )], count );
    }

    function element( tag, className, text ) {
        const node = document.createElement( tag );
        if ( className ) {
            node.className = className;
        }
        if ( text !== undefined ) {
            node.textContent = text;
        }
        return node;
    }

    function button( text, callback, className ) {
        const node = element( 'button', 'mba-pro-discovery-button' + ( className ? ' ' + className : '' ), text );
        node.type = 'button';
        node.addEventListener( 'click', callback );
        return node;
    }

    function applyTheme( root ) {
        const dark = settings.darkMode === 'on' || ( settings.darkMode === 'auto' && window.matchMedia && window.matchMedia( '(prefers-color-scheme: dark)' ).matches );
        root.classList.toggle( 'mba-pro-discovery-dark', !!dark );
        // The gallery's own colour, also for windows outside the gallery.
        if ( settings.accent ) { root.style.setProperty( '--mba-discovery-brand', settings.accent ); }
    }

    function state() {
        return typeof galleryConfig !== 'undefined' ? galleryConfig : null;
    }

    function allItems() {
        return typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ? galleryData : [];
    }

    function enabledRegion( id ) {
        return settings.mapEnabled && regions[id] && regions[id].categories.length && settings.showFigures.some( function ( figure ) {
            return Object.prototype.hasOwnProperty.call( settings.figures[figure].regions, id );
        } );
    }

    // Match category slugs, including the complete descendant tree supplied by
    // the gallery. A Set avoids counting a case twice when mappings overlap.
    function categoryMatcher( categories ) {
        const config = state() || window.medbeafgalleryGalleryConfig || {};
        const tree = config.categoryDescendants || {};
        const wanted = new Set();
        categories.forEach( function ( slug ) {
            wanted.add( slug );
            ( tree[slug] || [] ).forEach( function ( child ) { wanted.add( child ); } );
        } );
        return function ( item ) {
            if ( !categories.length ) {
                return true;
            }
            const cats = Array.isArray( item.categories ) ? item.categories : [];
            return cats.some( function ( cat ) { return wanted.has( cat.slug ); } ) || wanted.has( item.category );
        };
    }

    function filterValueMatches( item, name, expected ) {
        const values = item.proFilters || {};
        let value = Object.prototype.hasOwnProperty.call( values, name ) ? values[name] : item[name];
        if ( name === 'procedure' && ( value === undefined || value === '' ) ) {
            value = item.procedureType;
        }
        if ( Array.isArray( value ) ) {
            return value.some( function ( part ) { return String( part ) === expected; } );
        }
        if ( value === undefined || value === null || value === '' ) {
            return false;
        }
        if ( String( value ) === expected ) {
            return true;
        }
        // The built-in age filter stores either an age or a range. Match numeric
        // ages using the same boundaries as the free gallery (60+ means > 60).
        if ( name === 'age' && /^\d+(?:\.\d+)?$/.test( String( value ) ) ) {
            const age = Number( value );
            const range = expected.match( /^(\d+)\s*-\s*(\d+)$/ );
            if ( range ) {
                return age >= Number( range[1] ) && age <= Number( range[2] );
            }
            const minimum = expected.match( /^(\d+)\+$/ );
            return minimum ? age > Number( minimum[1] ) : false;
        }
        return false;
    }

    function discoveryMatches( items, area, answers ) {
        let result = items;
        if ( area && enabledRegion( area ) ) {
            result = result.filter( categoryMatcher( regions[area].categories ) );
        }
        if ( answers ) {
            settings.questions.forEach( function ( question, index ) {
                const answer = question.answers[answers[index]];
                if ( !answer ) {
                    return;
                }
                const matchesCategory = categoryMatcher( answer.categories );
                result = result.filter( function ( item ) {
                    return matchesCategory( item ) && Object.keys( answer.filters || {} ).every( function ( name ) {
                        return filterValueMatches( item, name, answer.filters[name] );
                    } );
                } );
            } );
        }
        return result;
    }

    function transform( items ) {
        transformRuns++;
        baseItems = items.slice();
        return discoveryMatches( items, activeArea, activeAnswers );
    }

    function registerTransform() {
        const transforms = window.medbeafgalleryItemTransforms = window.medbeafgalleryItemTransforms || [];
        const previous = transforms.indexOf( transform );
        if ( previous !== -1 ) {
            transforms.splice( previous, 1 );
        }
        transforms.push( transform );
    }

    function announceResults() {
        const config = state();
        const live = toolbar && toolbar.querySelector( '[data-mba-discovery-status]' );
        if ( live && config && ready ) {
            const message = countLabel( config.filteredItems.length, true );
            if ( live.textContent !== message ) {
                live.textContent = message;
            }
        }
    }

    // The gallery of an embedded map: only there while an area is chosen.
    function embedBox() { return settings.mapPlacement === 'embed' ? document.querySelector( '.mba-pro-map-cases' ) : null; }

    function syncEmbed() {
        const box = embedBox();
        if ( box ) { box.hidden = !activeArea; }
        document.querySelectorAll( '.mba-pro-live-shelf.is-always' ).forEach( function ( shelf ) { shelf.hidden = !activeArea; } );
    }

    function render() {
        syncEmbed(); // Before the cards: some layouts measure the grid.
        if ( ready && typeof window.renderGalleryItems === 'function' ) {
            window.renderGalleryItems();
        }
        syncTags();
        announceResults();
    }

    function syncUrl() {
        const url = new URL( window.location.href );
        url.searchParams.delete( 'mbarea' );
        url.searchParams.delete( 'mbguide' );
        if ( activeArea || activeAnswers ) {
            // Choosing an area or finishing the guide resets the category bar to
            // "All" (resetCategory), so drop a stale ?mbcat= written earlier.
            url.searchParams.delete( 'mbcat' );
        }
        if ( activeArea ) {
            url.searchParams.set( 'mbarea', activeArea );
        }
        if ( activeAnswers ) {
            url.searchParams.set( 'mbguide', activeAnswers.map( function ( value ) { return value === null ? 's' : value; } ).join( '-' ) );
        }
        try {
            window.history.replaceState( window.history.state, '', url.pathname + url.search + url.hash );
        } catch ( error ) {
            // Filtering still works in embeds that prohibit history changes.
        }
    }

    function resetCategory() {
        const config = state();
        if ( !config ) {
            return;
        }
        config.currentCategory = 'all';
        config.currentChildCategory = '';
        document.querySelectorAll( 'input[name="child_category"]' ).forEach( function ( input ) { input.checked = false; } );
        document.querySelectorAll( '.medbeafgallery-carousel-item' ).forEach( function ( item ) {
            const selected = [ 'all', 'ba_category_all' ].indexOf( item.getAttribute( 'data-id' ) ) !== -1;
            item.classList.toggle( 'active', selected );
            if ( item.hasAttribute( 'aria-selected' ) ) {
                item.setAttribute( 'aria-selected', String( selected ) );
            }
            if ( item.hasAttribute( 'aria-pressed' ) ) {
                item.setAttribute( 'aria-pressed', String( selected ) );
            }
        } );
        if ( typeof window.hideChildCategoriesSection === 'function' ) {
            window.hideChildCategoriesSection();
        }
    }

    function scrollToGrid() {
        const grid = document.getElementById( 'medbeafgallery-gallery-grid' );
        if ( grid ) {
            const reduced = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
            grid.scrollIntoView( { behavior: reduced ? 'auto' : 'smooth', block: 'start' } );
        }
    }

    function focusTrigger( type ) {
        const trigger = toolbar && toolbar.querySelector( '[data-mba-discovery="' + type + '"]' );
        if ( trigger ) {
            trigger.focus( { preventScroll: true } );
        }
    }

    function syncTags() {
        if ( openMap && openMap.mbaPaint ) { openMap.mbaPaint(); }
        const tags = document.getElementById( 'medbeafgallery-filter-tags' );
        if ( !tags ) {
            return;
        }
        tags.classList.add( 'mba-pro-discovery-tags' );
        applyTheme( tags );
        tags.querySelectorAll( '[data-mba-discovery-chip]' ).forEach( function ( chip ) { chip.remove(); } );
        function addChip( label, type, clear ) {
            const chip = button( label + ' ×', function () {
                clear();
                syncUrl();
                render();
                focusTrigger( type );
            }, 'mba-pro-discovery-chip' );
            chip.dataset.mbaDiscoveryChip = type;
            chip.setAttribute( 'aria-label', format( strings.remove, label ) );
            tags.appendChild( chip );
        }
        if ( activeArea ) {
            addChip( format( strings.areaChip, regions[activeArea].label ), 'map', function () { activeArea = ''; } );
        }
        if ( activeAnswers ) {
            addChip( strings.answersChip, 'guide', function () { activeAnswers = null; } );
        }
        const section = tags.closest( '.medbeafgallery-active-filters' );
        if ( section ) {
            section.classList.toggle( 'mba-pro-discovery-active', !!( activeArea || activeAnswers ) );
            const hasTags = tags.children.length > 0;
            section.style.display = hasTags ? 'flex' : 'none';
            const clear = section.querySelector( '#medbeafgallery-clear-filters' );
            if ( clear ) {
                clear.style.display = hasTags ? 'inline-block' : 'none';
            }
        }
    }

    function installGalleryHooks() {
        registerTransform();
        // Keep native category/checkbox/search/sort and pagination in charge.
        // Older free releases without the transform seam get the same fallback
        // as Pro's frontend-filters.js, without applying our predicate twice.
        if ( typeof window.applyAllFilters === 'function' && !window.applyAllFilters.mbaDiscoveryWrapped ) {
            const original = window.applyAllFilters;
            const wrapped = function () {
                const before = transformRuns;
                const result = original.apply( this, arguments );
                const config = state();
                if ( transformRuns === before && config && Array.isArray( config.filteredItems ) ) {
                    config.filteredItems = transform( config.filteredItems );
                    config.totalPages = Math.ceil( config.filteredItems.length / ( config.itemsPerPage || 1 ) );
                }
                syncTags();
                announceResults();
                return result;
            };
            wrapped.mbaDiscoveryWrapped = true;
            window.applyAllFilters = wrapped;
        }
        if ( typeof window.updateFilterTags === 'function' && !window.updateFilterTags.mbaDiscoveryWrapped ) {
            const original = window.updateFilterTags;
            const wrapped = function () {
                const result = original.apply( this, arguments );
                syncTags();
                return result;
            };
            wrapped.mbaDiscoveryWrapped = true;
            window.updateFilterTags = wrapped;
        }
    }

    function consentVisible() {
        const overlay = document.getElementById( 'medbeafgallery-consent-overlay' );
        return overlay && !overlay.hidden && window.getComputedStyle( overlay ).display !== 'none' && window.getComputedStyle( overlay ).visibility !== 'hidden';
    }

    function restoreUrl() {
        if ( !ready || consentVisible() ) {
            return;
        }
        const params = new URL( window.location.href ).searchParams;
        const area = params.get( 'mbarea' );
        activeArea = area && enabledRegion( area ) ? area : '';
        activeAnswers = null;
        const raw = params.get( 'mbguide' );
        if ( settings.guideEnabled && raw && raw.length < 16 ) {
            const parts = raw.split( '-' );
            if ( parts.length === settings.questions.length && parts.every( function ( part, index ) {
                return ( part === 's' && settings.questions[index].optional ) || ( /^[0-7]$/.test( part ) && !!settings.questions[index].answers[Number( part )] );
            } ) ) {
                activeAnswers = parts.map( function ( part ) { return part === 's' ? null : Number( part ); } );
            }
        }
        if ( activeArea ) {
            resetCategory();
        }
        render();
    }

    // "Find by area" and "Help me choose" share the row of the Filters button, when there is one.
    function dockToolbar() {
        const row = toolbar && toolbar.parentElement && toolbar.parentElement.querySelector( ':scope > .mba-pro-mtoolbar' );
        if ( row && toolbar.querySelector( '[data-mba-discovery]' ) ) {
            row.appendChild( toolbar );
            toolbar.classList.add( 'mba-pro-discovery-docked' );
        }
    }

    /*
     * Live map: the figure beside the results. Pointing at an area (or choosing it in the
     * list under the figure) shows its cases at once; "All areas" shows every case again.
     */
    function buildLiveMap( host ) {
        const prefix = 'mba-pro-discovery-live-' + ( ++mapSerial );
        const total = function ( id ) { return enabledRegion( id ) ? allItems().filter( categoryMatcher( regions[id].categories ) ).length : 0; };
        const areasOf = function ( figure ) { return Object.keys( settings.figures[figure].regions ).filter( total ); };
        const available = settings.showFigures.filter( function ( id ) { return settings.figures[id] && areasOf( id ).length; } );
        if ( !available.length ) { return false; }
        const bodies = available.filter( function ( id ) { return /^body-/.test( id ); } );
        const tabIds = available.filter( function ( id ) { return bodies.length < 2 || id !== bodies[1]; } );
        const canHover = window.matchMedia && window.matchMedia( '(hover: hover)' ).matches;
        let current = available[0];
        let timer = 0;
        const tabs = element( 'div', 'mba-pro-discovery-tabs' );
        tabs.setAttribute( 'role', 'group' );
        tabs.setAttribute( 'aria-label', strings.figures );
        tabs.hidden = tabIds.length < 2;
        const stage = element( 'div', 'mba-pro-discovery-stage' );
        const holder = element( 'div', 'mba-pro-discovery-figure-wrap' );
        const pill = element( 'p', 'mba-pro-live-label' );
        pill.setAttribute( 'role', 'status' );
        const flip = button( '', function () { show( bodies[ bodies[0] === current ? 1 : 0 ] ); }, 'mba-pro-discovery-flip' );
        flip.appendChild( icon( 'flip' ) );
        const flipText = element( 'span' );
        flip.appendChild( flipText );
        stage.appendChild( holder );
        stage.appendChild( flip );
        stage.appendChild( pill );
        const list = element( 'div', 'mba-pro-discovery-chips' );
        list.setAttribute( 'role', 'group' );
        list.setAttribute( 'aria-label', strings.regions );
        host.appendChild( tabs );
        host.appendChild( stage );
        host.appendChild( list );

        function paint( hovered ) {
            const on = hovered || activeArea;
            host.querySelectorAll( '[data-area]' ).forEach( function ( node ) {
                node.classList.toggle( 'mba-pro-discovery-highlight', node.getAttribute( 'data-area' ) === on );
                if ( node.hasAttribute( 'aria-pressed' ) ) { node.setAttribute( 'aria-pressed', String( node.getAttribute( 'data-area' ) === activeArea ) ); }
            } );
            pill.textContent = on && regions[on] ? format( strings.regionCount, regions[on].label, countLabel( total( on ), false ) ) : strings.choose;
            pill.classList.toggle( 'is-on', !!on );
        }
        function choose( id ) {
            window.clearTimeout( timer );
            if ( id === activeArea ) { paint(); return; }
            activeArea = id;
            resetCategory();
            syncUrl();
            render();
            paint();
        }
        // Chosen by a tap, a click or the keyboard (not by pointing): where the results
        // stand under the map, the page goes to them.
        let moving = 0;
        function pick( id ) {
            choose( id );
            const root = host.closest( '.medbeafgallery-container' );
            const content = root && root.querySelector( ':scope > .medbeafgallery-gallery-content' );
            if ( !content || content.getBoundingClientRect().top < host.getBoundingClientRect().bottom - 2 ) { return; }
            const reduced = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
            // A moment to see which area lit up.
            window.clearTimeout( moving );
            moving = window.setTimeout( function () { content.scrollIntoView( { behavior: reduced ? 'auto' : 'smooth', block: 'start' } ); }, reduced ? 0 : 220 );
        }
        function point( id ) {
            if ( !canHover ) { return; }
            window.clearTimeout( timer );
            paint( id );
            timer = window.setTimeout( function () { choose( id ); }, 170 );
        }
        function chip( id, text ) {
            const node = button( '', function () { pick( id ); }, 'mba-pro-discovery-label mba-pro-discovery-chip-choice' );
            node.setAttribute( 'data-area', id );
            node.setAttribute( 'aria-pressed', 'false' );
            node.appendChild( element( 'span', 'mba-pro-discovery-name', text ) );
            node.appendChild( element( 'b', 'mba-pro-discovery-number', String( id ? total( id ) : allItems().length ) ) );
            list.appendChild( node );
        }
        function show( id ) {
            current = id;
            tabs.querySelectorAll( 'button' ).forEach( function ( tab ) {
                const on = tab.dataset.figure === id || ( bodies.length > 1 && tab.dataset.figure === bodies[0] && bodies.indexOf( id ) !== -1 );
                tab.setAttribute( 'aria-pressed', String( on ) );
            } );
            flip.hidden = bodies.length < 2 || bodies.indexOf( id ) === -1;
            flipText.textContent = id === 'body-front' ? strings.showBack : strings.showFront;
            const areas = areasOf( id );
            holder.textContent = '';
            const drawing = figureDrawing( id, areas, prefix, function () {}, pick );
            drawing.querySelectorAll( '.mba-pro-discovery-region' ).forEach( function ( shape ) {
                shape.addEventListener( 'mouseenter', function () { point( shape.getAttribute( 'data-area' ) ); } );
                shape.addEventListener( 'mouseleave', function () { window.clearTimeout( timer ); paint(); } );
            } );
            holder.appendChild( drawing );
            list.textContent = '';
            chip( '', strings.allAreas );
            areas.slice().sort( function ( a, b ) { return settings.figures[id].regions[a].at[1] - settings.figures[id].regions[b].at[1]; } ).forEach( function ( area ) { chip( area, settings.figures[id].regions[area].label ); } );
            paint();
        }
        tabIds.forEach( function ( id ) {
            const tab = button( bodies.length > 1 && id === bodies[0] ? strings.body : settings.figures[id].label, function () { show( id ); }, 'mba-pro-discovery-tab' );
            tab.dataset.figure = id;
            tabs.appendChild( tab );
        } );
        const start = activeArea && available.find( function ( id ) { return areasOf( id ).indexOf( activeArea ) !== -1; } );
        show( start || current );
        host.mbaPaint = paint;
        return true;
    }

    function showLiveMap() {
        if ( !settings.mapEnabled || settings.mapPlacement !== 'beside' || openMap || !toolbar || !allItems().length ) { return; }
        const root = toolbar.closest( '.medbeafgallery-container' );
        const content = root && root.querySelector( ':scope > .medbeafgallery-gallery-content' );
        if ( !content ) { return; }
        openMap = element( 'section', 'mba-pro-discovery mba-pro-live' );
        openMap.setAttribute( 'aria-label', strings.area );
        applyTheme( openMap );
        const built = buildLiveMap( openMap );
        // The server's placeholder (one per gallery) gives way to the map, or to the plain gallery.
        document.querySelectorAll( '.mba-pro-live.is-loading' ).forEach( function ( ghost ) {
            const owner = ghost.parentElement;
            if ( built && owner === root ) { ghost.replaceWith( openMap ); return; }
            owner.classList.remove( 'mba-pro-live-on' );
            ghost.remove();
        } );
        if ( built ) {
            if ( !openMap.isConnected ) { root.insertBefore( openMap, content ); }
            root.classList.add( 'mba-pro-live-on' );
            addBack( content, openMap, false );
        } else {
            root.classList.remove( 'mba-pro-live-on' );
        }
    }

    // The way back to the map, at the foot of the screen while its cases are under it.
    function addBack( content, map, always ) {
        if ( content.querySelector( ':scope > .mba-pro-live-shelf' ) ) { return; }
        const back = button( '', function () {
            const reduced = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
            map.scrollIntoView( { behavior: reduced ? 'auto' : 'smooth', block: 'start' } );
            const chosen = Array.from( map.querySelectorAll( '[aria-pressed="true"]' ) ).find( function ( node ) { return node.offsetParent; } );
            if ( chosen ) { chosen.focus( { preventScroll: true } ); }
        }, 'mba-pro-live-back' );
        back.appendChild( icon( 'up' ) );
        back.appendChild( element( 'span', '', strings.changeArea ) );
        const shelf = element( 'div', 'mba-pro-discovery mba-pro-live-shelf' + ( always ? ' is-always' : '' ) );
        shelf.hidden = always && !activeArea;
        applyTheme( shelf );
        shelf.appendChild( back );
        content.appendChild( shelf );
        if ( 'IntersectionObserver' in window ) {
            new IntersectionObserver( function ( entries ) {
                const entry = entries[entries.length - 1];
                shelf.classList.toggle( 'is-near', entry.intersectionRect.height > window.innerHeight * 0.3 );
            }, { threshold: [ 0, 0.15, 0.3, 0.5, 0.75, 1 ] } ).observe( map );
        }
    }

    let openMap = null; // The live map of the page's gallery.

    function onDataReady() {
        receivedData = true;
        if ( !initialized ) {
            return;
        }
        ready = true;
        // Put Discovery after Pro's transform regardless of shortcode ordering.
        installGalleryHooks();
        toolbar.querySelectorAll( '[data-mba-discovery]' ).forEach( function ( trigger ) { trigger.disabled = false; } );
        dockToolbar();
        restoreUrl();
        showLiveMap();
    }

    function svgNode( tag, attributes ) {
        const node = document.createElementNS( 'http://www.w3.org/2000/svg', tag );
        Object.keys( attributes ).forEach( function ( key ) { node.setAttribute( key, attributes[key] ); } );
        return node;
    }

    const ICONS = {
        up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
        point: '<path d="M9 11V5a2 2 0 0 1 4 0v5M13 10.500V9a2 2 0 0 1 4 0v3M17 12a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.700L4.300 13.700A1.900 1.900 0 0 1 7.500 11.600L9 13.500"/>',
        flip: '<path d="M3 12a9 9 0 0 1 15.500-6.200L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.500 6.200L3 16M3 21v-5h5"/>',
        back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
        go: '<path d="M5 12h14M13 6l6 6-6 6"/>'
    };

    function icon( name ) {
        const holder = element( 'span', 'mba-pro-discovery-icon' );
        holder.setAttribute( 'aria-hidden', 'true' );
        holder.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + ICONS[name] + '</svg>';
        return holder;
    }

    function photoUrl( value ) {
        try {
            const url = new URL( value, document.baseURI );
            return value && /^https?:$/.test( url.protocol ) ? url.href : '';
        } catch ( error ) {
            return '';
        }
    }

    // One case's before and after photos, side by side (covered by the sensitive
    // photo notice like every other case photo).
    function casePair( item ) {
        const sides = [ [ item.beforeThumb || item.beforeImg, item.beforeAlt, strings.before ], [ item.afterThumb || item.afterImg, item.afterAlt, strings.after ] ];
        if ( !sides.every( function ( side ) { return photoUrl( side[0] ); } ) ) {
            return null;
        }
        const pair = element( 'div', 'mba-pro-discovery-pair' );
        pair.setAttribute( 'data-case-id', item.id );
        pair.setAttribute( 'data-case-title', String( item.title || '' ).replace( /<[^>]*>/g, '' ) );
        sides.forEach( function ( side, index ) {
            const image = element( 'img' );
            image.src = photoUrl( side[0] );
            image.alt = side[1] || side[2];
            image.decoding = 'async';
            pair.appendChild( image );
            pair.appendChild( element( 'span', 'mba-pro-discovery-tag ' + ( index ? 'is-after' : 'is-before' ), side[2] ) );
        } );
        return pair;
    }

    /** The figure with its areas: the picture, a glow and an edge per area, its shape and its dot. */
    function figureDrawing( id, areas, prefix, hover, pick ) {
        const figure = settings.figures[id];
        const size = figure.viewBox.split( ' ' ).map( Number );
        const under = areas.filter( function ( area ) { return figure.regions[area].under; } );
        const layers = under.concat( areas.filter( function ( area ) { return under.indexOf( area ) === -1; } ) );
        const drawing = svgNode( 'svg', { viewBox: figure.viewBox, class: 'mba-pro-discovery-figure', 'aria-hidden': 'true', focusable: 'false' } );
        const defs = svgNode( 'defs', {} );
        const blur = svgNode( 'filter', { id: prefix + '-soft', x: '-30%', y: '-30%', width: '160%', height: '160%' } );
        blur.appendChild( svgNode( 'feGaussianBlur', { stdDeviation: size[2] / 110 } ) );
        defs.appendChild( blur );
        drawing.appendChild( defs );
        drawing.appendChild( svgNode( 'image', { href: figure.image, width: size[2], height: size[3] } ) );
        layers.forEach( function ( area ) {
            drawing.appendChild( svgNode( 'path', { d: figure.regions[area].path, class: 'mba-pro-discovery-glow', 'data-area': area, filter: 'url(#' + prefix + '-soft)', 'fill-rule': figure.regions[area].rule } ) );
        } );
        layers.forEach( function ( area ) {
            const region = figure.regions[area];
            drawing.appendChild( svgNode( 'path', { d: region.path, class: 'mba-pro-discovery-edge', 'data-area': area, 'fill-rule': region.rule } ) );
            const shape = svgNode( 'path', { id: prefix + '-' + area, d: region.path, class: 'mba-pro-discovery-region', 'data-area': area, 'fill-rule': region.rule } );
            shape.addEventListener( 'mouseenter', function () { hover( area ); } );
            shape.addEventListener( 'mouseleave', function () { hover( '' ); } );
            shape.addEventListener( 'click', function () { pick( area ); } );
            drawing.appendChild( shape );
        } );
        areas.forEach( function ( area ) {
            const at = figure.regions[area].at;
            const dot = svgNode( 'g', { class: 'mba-pro-discovery-dot', 'data-area': area } );
            dot.appendChild( svgNode( 'circle', { class: 'mba-pro-discovery-ring', cx: at[0], cy: at[1], r: size[2] * 0.019 } ) );
            dot.appendChild( svgNode( 'circle', { class: 'mba-pro-discovery-core', cx: at[0], cy: at[1], r: size[2] * 0.0095 } ) );
            drawing.appendChild( dot );
        } );
        return drawing;
    }

    /**
     * Shared map renderer: the figure with its areas, their labels, and a panel with
     * the chosen area's newest results. Standalone maps never need gallery globals:
     * they link to the gallery page instead (navigate) and get their case counts (counts)
     * and the newest cases of each area (samples) from the server.
     */
    function buildMap( host, figures, navigate, counts, headHost, samples ) {
        const prefix = 'mba-pro-discovery-map-' + ( ++mapSerial );
        function total( id ) {
            if ( !enabledRegion( id ) ) { return 0; }
            if ( navigate ) { return counts ? Number( counts[id] ) || 0 : 1; }
            return allItems().filter( categoryMatcher( regions[id].categories ) ).length;
        }
        function areasOf( figure ) {
            return Object.keys( settings.figures[figure].regions ).filter( total );
        }
        const available = figures.filter( function ( id ) { return settings.figures[id] && areasOf( id ).length; } );
        if ( !available.length ) {
            return false;
        }
        // Front and back of the body are one figure that turns round.
        const bodies = available.filter( function ( id ) { return /^body-/.test( id ); } );
        const tabIds = available.filter( function ( id ) { return bodies.length < 2 || id !== bodies[1]; } );
        let current = available[0];
        let selected = '';
        let hovered = '';

        const root = element( 'div', 'mba-pro-discovery-map' );
        const tabs = element( 'div', 'mba-pro-discovery-tabs' );
        tabs.setAttribute( 'role', 'tablist' );
        tabs.setAttribute( 'aria-label', strings.figures );
        if ( headHost ) {
            headHost.appendChild( tabs );
        } else {
            const head = element( 'div', 'mba-pro-discovery-map-head' );
            const titles = element( 'div', 'mba-pro-discovery-titles' );
            titles.appendChild( element( 'h2', 'mba-pro-discovery-heading', strings.mapTitle ) );
            titles.appendChild( element( 'p', 'mba-pro-discovery-sub', strings.mapIntro ) );
            head.appendChild( titles );
            head.appendChild( tabs );
            root.appendChild( head );
        }
        tabs.hidden = tabIds.length < 2;

        const body = element( 'div', 'mba-pro-discovery-map-body' );
        const main = element( 'div', 'mba-pro-discovery-map-main' );
        main.id = prefix + '-panel';
        main.setAttribute( 'role', 'tabpanel' );
        const stage = element( 'div', 'mba-pro-discovery-stage' );
        const wires = svgNode( 'svg', { class: 'mba-pro-discovery-wires', 'aria-hidden': 'true' } );
        const left = element( 'div', 'mba-pro-discovery-labels is-left' );
        const holder = element( 'div', 'mba-pro-discovery-figure-wrap' );
        const right = element( 'div', 'mba-pro-discovery-labels is-right' );
        const flip = button( '', function () { show( bodies[ bodies[0] === current ? 1 : 0 ] ); }, 'mba-pro-discovery-flip' );
        flip.appendChild( icon( 'flip' ) );
        const flipText = element( 'span' );
        flip.appendChild( flipText );
        [ wires, left, holder, right, flip ].forEach( function ( part ) { stage.appendChild( part ); } );
        const chips = element( 'div', 'mba-pro-discovery-chips' );
        chips.setAttribute( 'role', 'group' );
        chips.setAttribute( 'aria-label', strings.regions );
        main.appendChild( stage );
        main.appendChild( chips );
        const result = element( 'aside', 'mba-pro-discovery-result' );
        result.setAttribute( 'aria-live', 'polite' );
        body.appendChild( main );
        body.appendChild( result );
        root.appendChild( body );
        host.appendChild( root );

        function areaLabel( id ) { return settings.figures[current].regions[id].label; }

        function paint() {
            const on = hovered || selected;
            root.querySelectorAll( '[data-area]' ).forEach( function ( node ) {
                node.classList.toggle( 'mba-pro-discovery-highlight', node.getAttribute( 'data-area' ) === on );
                if ( node.hasAttribute( 'aria-pressed' ) ) { node.setAttribute( 'aria-pressed', String( node.getAttribute( 'data-area' ) === selected ) ); }
            } );
        }

        function hover( id ) { hovered = id; paint(); }

        function areaButton( id, className ) {
            const count = total( id );
            const node = button( '', function () { pick( id, true ); }, className );
            node.setAttribute( 'data-area', id );
            node.setAttribute( 'aria-pressed', 'false' );
            node.appendChild( element( 'span', 'mba-pro-discovery-name', areaLabel( id ) ) );
            if ( !navigate || counts ) {
                node.appendChild( element( 'b', 'mba-pro-discovery-number', String( count ) ) );
                node.setAttribute( 'aria-label', format( strings.regionCount, areaLabel( id ), countLabel( count, false ) ) );
            }
            node.addEventListener( 'mouseenter', function () { hover( id ); } );
            node.addEventListener( 'mouseleave', function () { hover( '' ); } );
            node.addEventListener( 'focus', function () { hover( id ); } );
            node.addEventListener( 'blur', function () { hover( '' ); } );
            return node;
        }

        // Labels stand beside their point and never on each other.
        function place() {
            [ left, right ].forEach( function ( column ) {
                const height = column.clientHeight;
                if ( !height || !column.children.length ) { return; }
                const top = column.getBoundingClientRect().top;
                const gap = 52;
                const list = Array.from( column.children ).map( function ( node ) {
                    const point = holder.querySelector( '.mba-pro-discovery-dot[data-area="' + node.getAttribute( 'data-area' ) + '"] .mba-pro-discovery-core' ).getBoundingClientRect();
                    return { node: node, y: point.top + point.height / 2 - top - node.offsetHeight / 2 };
                } ).sort( function ( a, b ) { return a.y - b.y; } );
                list.forEach( function ( entry, index ) { if ( index ) { entry.y = Math.max( entry.y, list[index - 1].y + gap ); } } );
                const last = list[list.length - 1];
                const over = last.y + last.node.offsetHeight + 2 - height;
                if ( over > 0 ) {
                    last.y -= over;
                    for ( let i = list.length - 2; i >= 0; i-- ) { list[i].y = Math.min( list[i].y, list[i + 1].y - gap ); }
                }
                list.forEach( function ( entry ) { entry.node.style.setProperty( 'top', Math.max( 0, entry.y ) + 'px', 'important' ); } );
            } );
        }

        function draw() {
            wires.textContent = '';
            const box = stage.getBoundingClientRect();
            if ( !box.width || !left.clientHeight ) { return; }
            place();
            wires.setAttribute( 'viewBox', '0 0 ' + box.width + ' ' + box.height );
            [ left, right ].forEach( function ( column ) {
                Array.from( column.children ).forEach( function ( node ) {
                    const id = node.getAttribute( 'data-area' );
                    const from = node.getBoundingClientRect();
                    const point = holder.querySelector( '.mba-pro-discovery-dot[data-area="' + id + '"] .mba-pro-discovery-core' ).getBoundingClientRect();
                    const isLeft = column === left;
                    const x1 = ( isLeft ? from.right : from.left ) - box.left;
                    const y1 = from.top + from.height / 2 - box.top;
                    const bend = isLeft ? x1 + 24 : x1 - 24;
                    const x2 = point.left + point.width / 2 - box.left + ( isLeft ? -1 : 1 ) * ( point.width / 2 + 1 );
                    const y2 = point.top + point.height / 2 - box.top;
                    wires.appendChild( svgNode( 'path', { d: 'M' + x1 + ' ' + y1 + ' L' + bend + ' ' + y1 + ' L' + x2 + ' ' + y2, 'data-area': id } ) );
                } );
            } );
            paint();
        }

        function showResult() {
            result.textContent = '';
            const areas = areasOf( current );
            if ( !selected ) {
                const mark = element( 'span', 'mba-pro-discovery-mark' );
                mark.appendChild( icon( 'point' ) );
                result.appendChild( mark );
                result.appendChild( element( 'h3', 'mba-pro-discovery-result-title', strings.choose ) );
                result.appendChild( element( 'p', 'mba-pro-discovery-sub', strings.chooseHint ) );
                const list = element( 'div', 'mba-pro-discovery-list' );
                areas.slice().sort( function ( a, b ) { return total( b ) - total( a ); } ).slice( 0, 6 ).forEach( function ( id ) {
                    const row = areaButton( id, 'mba-pro-discovery-row' );
                    const text = settings.figures[current].regions[id].treatments.slice( 0, 3 ).join( ', ' );
                    if ( text ) { row.insertBefore( element( 'span', 'mba-pro-discovery-row-text', text ), row.children[1] || null ); }
                    list.appendChild( row );
                } );
                result.appendChild( list );
                return;
            }
            const region = settings.figures[current].regions[selected];
            const count = total( selected );
            const back = button( '', function () { pick( '', false ); const first = result.querySelector( 'button' ); if ( first ) { first.focus( { preventScroll: true } ); } }, 'mba-pro-discovery-back' );
            back.appendChild( icon( 'back' ) );
            back.appendChild( element( 'span', '', strings.allAreas ) );
            result.appendChild( back );
            const head = element( 'div', 'mba-pro-discovery-result-head' );
            head.appendChild( element( 'h3', 'mba-pro-discovery-result-title', region.label ) );
            if ( !navigate || counts ) { head.appendChild( element( 'p', 'mba-pro-discovery-sub', countLabel( count, false ) ) ); }
            if ( region.treatments.length ) {
                const treatments = element( 'div', 'mba-pro-discovery-treatments' );
                region.treatments.slice( 0, 6 ).forEach( function ( name ) { treatments.appendChild( element( 'span', '', name ) ); } );
                head.appendChild( treatments );
            }
            result.appendChild( head );
            const newest = navigate
                ? ( samples && samples[selected] ) || []
                : allItems().filter( categoryMatcher( region.categories ) ).sort( function ( a, b ) { return Number( b.timestamp ) - Number( a.timestamp ); } );
            if ( newest.length ) {
                const photos = element( 'div', 'mba-pro-discovery-photos' );
                newest.some( function ( item ) {
                    const pair = casePair( item );
                    if ( pair ) { photos.appendChild( pair ); }
                    return photos.children.length === 2;
                } );
                if ( photos.children.length ) { result.appendChild( photos ); }
            }
            const go = button( '', function () { apply( selected ); }, 'mba-pro-discovery-cta' );
            go.appendChild( element( 'span', '', navigate && !counts ? strings.seeCases : format( strings[count === 1 ? 'seeOne' : 'seeMany'], count ) ) );
            go.appendChild( icon( 'go' ) );
            result.appendChild( go );
        }

        function pick( id, reveal ) {
            selected = id && id === selected && reveal ? '' : id;
            showResult();
            paint();
            // Its cases are already listed under the map: they follow the area.
            if ( navigate === 'here' && embedBox() && activeArea && selected && selected !== activeArea ) { openHere( selected, false ); }
            // Stacked (phones): the answer is below the figure, so bring it into view.
            if ( reveal && selected && result.offsetTop >= main.offsetTop + main.offsetHeight - 2 ) {
                const reduced = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
                result.scrollIntoView( { behavior: reduced ? 'auto' : 'smooth', block: 'nearest' } );
            }
        }

        function show( id, focusTab ) {
            current = id;
            selected = '';
            hovered = '';
            tabs.querySelectorAll( 'button' ).forEach( function ( tab ) {
                const on = tab.dataset.figure === id || ( bodies.length > 1 && tab.dataset.figure === bodies[0] && bodies.indexOf( id ) !== -1 );
                tab.setAttribute( 'aria-selected', String( on ) );
                tab.tabIndex = on ? 0 : -1;
                if ( on ) { main.setAttribute( 'aria-labelledby', tab.id ); }
                if ( on && focusTab ) { tab.focus(); }
            } );
            const figure = settings.figures[id];
            flip.hidden = bodies.length < 2 || bodies.indexOf( id ) === -1;
            flipText.textContent = id === 'body-front' ? strings.showBack : strings.showFront;
            [ left, right, chips, holder ].forEach( function ( part ) { part.textContent = ''; } );
            const areas = areasOf( id );
            const drawing = figureDrawing( id, areas, prefix, hover, function ( area ) { pick( area, true ); } );
            holder.appendChild( drawing );
            areas.slice().sort( function ( a, b ) { return figure.regions[a].at[1] - figure.regions[b].at[1]; } ).forEach( function ( area ) {
                ( figure.regions[area].side === 'l' ? left : right ).appendChild( areaButton( area, 'mba-pro-discovery-label mba-pro-discovery-region-choice' ) );
                chips.appendChild( areaButton( area, 'mba-pro-discovery-label mba-pro-discovery-chip-choice' ) );
            } );
            showResult();
            paint();
            draw();
            window.requestAnimationFrame( draw );
        }

        // An embedded map: its cases under it (or, with a gallery on the page, in that gallery).
        function openHere( id, scroll ) {
            activeArea = id;
            resetCategory();
            syncUrl();
            render();
            const box = embedBox();
            if ( !scroll ) { return; }
            if ( !box ) { scrollToGrid(); return; }
            const content = box.querySelector( '.medbeafgallery-gallery-content' );
            if ( content ) { addBack( content, host, true ); }
            const reduced = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
            box.scrollIntoView( { behavior: reduced ? 'auto' : 'smooth', block: 'start' } );
        }

        function apply( id ) {
            if ( !enabledRegion( id ) ) {
                return;
            }
            if ( navigate === 'here' ) {
                openHere( id, true );
                return;
            }
            if ( navigate ) {
                const url = new URL( navigate, window.location.href );
                if ( url.protocol === 'https:' || url.protocol === 'http:' ) {
                    url.searchParams.set( 'mbarea', id );
                    window.location.assign( url.href );
                }
                return;
            }
            activeArea = id;
            resetCategory();
            syncUrl();
            render();
            closeDialog();
            scrollToGrid();
        }

        tabIds.forEach( function ( id, index ) {
            const tab = button( bodies.length > 1 && id === bodies[0] ? strings.body : settings.figures[id].label, function () { show( id ); }, 'mba-pro-discovery-tab' );
            tab.id = prefix + '-tab-' + id;
            tab.dataset.figure = id;
            tab.setAttribute( 'role', 'tab' );
            tab.setAttribute( 'aria-controls', main.id );
            tab.addEventListener( 'keydown', function ( event ) {
                let target = index;
                if ( event.key === 'ArrowRight' ) { target = ( index + 1 ) % tabIds.length; }
                else if ( event.key === 'ArrowLeft' ) { target = ( index + tabIds.length - 1 ) % tabIds.length; }
                else if ( event.key === 'Home' ) { target = 0; }
                else if ( event.key === 'End' ) { target = tabIds.length - 1; }
                else { return; }
                event.preventDefault();
                show( tabIds[target], true );
            } );
            tabs.appendChild( tab );
        } );
        // Opened again with an area on: start there.
        const start = activeArea && available.find( function ( id ) { return areasOf( id ).indexOf( activeArea ) !== -1; } );
        show( start || current );
        if ( start ) { pick( activeArea, false ); }
        if ( 'ResizeObserver' in window ) { new ResizeObserver( draw ).observe( stage ); }
        return true;
    }

    function closeDialog() {
        if ( !dialog ) {
            return;
        }
        const previous = dialog;
        dialog = null;
        document.removeEventListener( 'keydown', previous.keydown, true );
        document.removeEventListener( 'focusin', previous.focusin, true );
        previous.background.forEach( function ( item ) {
            if ( item.inert !== undefined ) {
                item.node.inert = item.inert;
            } else if ( item.hidden === null ) {
                item.node.removeAttribute( 'aria-hidden' );
            } else {
                item.node.setAttribute( 'aria-hidden', item.hidden );
            }
        } );
        previous.root.remove();
        document.body.classList.remove( 'mba-pro-discovery-lock' );
        document.documentElement.classList.remove( 'mba-pro-discovery-lock' );
        if ( previous.trigger && previous.trigger.isConnected ) {
            previous.trigger.focus( { preventScroll: true } );
        }
    }

    function openDialog( type, trigger ) {
        if ( !ready || consentVisible() ) {
            return;
        }
        closeDialog();
        const root = element( 'div', 'mba-pro-discovery mba-pro-discovery-overlay' + ( type === 'map' ? ' mba-pro-discovery-overlay-map' : '' ) );
        applyTheme( root );
        const panel = element( 'section', 'mba-pro-discovery-panel' );
        panel.setAttribute( 'role', 'dialog' );
        panel.setAttribute( 'aria-modal', 'true' );
        panel.setAttribute( 'aria-labelledby', 'mba-pro-discovery-heading' );
        panel.tabIndex = -1;
        const header = element( 'div', 'mba-pro-discovery-header' );
        const titles = element( 'div', 'mba-pro-discovery-titles' );
        const title = element( 'h2', 'mba-pro-discovery-heading', type === 'map' ? strings.mapTitle : settings.guideLabel );
        title.id = 'mba-pro-discovery-heading';
        titles.appendChild( title );
        if ( type === 'map' ) { titles.appendChild( element( 'p', 'mba-pro-discovery-sub', strings.mapIntro ) ); }
        const tools = element( 'div', 'mba-pro-discovery-header-tools' );
        const close = button( '×', closeDialog, 'mba-pro-discovery-close' );
        close.setAttribute( 'aria-label', strings.close );
        header.appendChild( titles );
        header.appendChild( tools );
        header.appendChild( close );
        const content = element( 'div', 'mba-pro-discovery-dialog-content' );
        panel.appendChild( header );
        panel.appendChild( content );
        root.appendChild( panel );
        document.body.appendChild( root );
        const background = [];
        const current = dialog = { root: root, panel: panel, trigger: trigger, background: background };
        close.focus( { preventScroll: true } );
        Array.from( document.body.children ).forEach( function ( node ) {
            if ( node === root || /^(SCRIPT|STYLE|LINK)$/.test( node.tagName ) ) { return; }
            if ( 'inert' in node ) {
                background.push( { node: node, inert: node.inert } );
                node.inert = true;
            } else {
                background.push( { node: node, hidden: node.getAttribute( 'aria-hidden' ) } );
                node.setAttribute( 'aria-hidden', 'true' );
            }
        } );
        document.body.classList.add( 'mba-pro-discovery-lock' );
        document.documentElement.classList.add( 'mba-pro-discovery-lock' );
        current.keydown = function ( event ) {
            if ( event.key === 'Escape' ) {
                event.preventDefault();
                event.stopPropagation();
                closeDialog();
            } else if ( event.key === 'Tab' ) {
                const focusable = Array.from( panel.querySelectorAll( 'button:not(:disabled), [tabindex="0"]' ) ).filter( function ( node ) { return node.getClientRects().length; } );
                const first = focusable[0] || panel;
                const last = focusable[focusable.length - 1] || panel;
                if ( event.shiftKey && ( document.activeElement === first || document.activeElement === panel ) ) {
                    event.preventDefault();
                    last.focus();
                } else if ( !event.shiftKey && ( document.activeElement === last || document.activeElement === panel ) ) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        current.focusin = function ( event ) {
            if ( !panel.contains( event.target ) ) { close.focus(); }
        };
        document.addEventListener( 'keydown', current.keydown, true );
        document.addEventListener( 'focusin', current.focusin, true );
        root.addEventListener( 'click', function ( event ) { if ( event.target === root ) { closeDialog(); } } );
        if ( type === 'map' ) {
            buildMap( content, settings.showFigures, null, null, tools );
        } else {
            const note = element( 'p', 'mba-pro-discovery-medical-note', strings.pastResults );
            note.id = 'mba-pro-discovery-medical-note';
            panel.setAttribute( 'aria-describedby', note.id );
            panel.appendChild( note );
            buildGuide( content );
        }
    }

    function showAllCases() {
        activeArea = '';
        activeAnswers = null;
        resetCategory();
        syncUrl();
        const clear = document.getElementById( 'medbeafgallery-clear-filters' );
        if ( clear ) { clear.click(); }
        const search = document.getElementById( 'medbeafgallery-pro-search-input' );
        if ( search ) {
            search.value = '';
            search.dispatchEvent( new Event( 'input', { bubbles: true } ) );
        }
        render();
        closeDialog();
        scrollToGrid();
    }

    function buildGuide( host ) {
        let step = 0;
        const answers = activeAnswers ? activeAnswers.slice() : settings.questions.map( function () { return null; } );
        // Only committed results change the grid; this run refreshes the upstream
        // candidate set so previews compose with category, search and Pro filters.
        render();

        function page( focusHeading, finished ) {
            host.textContent = '';
            if ( settings.guideIntro ) {
                host.appendChild( element( 'p', 'mba-pro-discovery-intro', settings.guideIntro ) );
            }
            const question = settings.questions[step];
            const progress = element( 'p', 'mba-pro-discovery-progress', format( strings.step, step + 1, settings.questions.length ) );
            host.appendChild( progress );
            const heading = element( 'h3', 'mba-pro-discovery-question', finished ? strings.noMatches : question.label );
            heading.tabIndex = -1;
            host.appendChild( heading );
            const choices = element( 'div', 'mba-pro-discovery-answers' );
            const live = element( 'p', 'mba-pro-discovery-count' );
            live.setAttribute( 'role', 'status' );
            live.setAttribute( 'aria-live', 'polite' );
            live.setAttribute( 'aria-atomic', 'true' );
            const empty = element( 'div', 'mba-pro-discovery-empty' );
            empty.appendChild( element( 'p', '', strings.noMatches ) );
            empty.appendChild( button( strings.showAll, showAllCases ) );
            empty.appendChild( element( 'p', 'mba-pro-discovery-hint', strings.showAllHint ) );
            const footer = element( 'div', 'mba-pro-discovery-guide-nav' );
            const back = button( strings.back, function () {
                if ( !finished ) { step--; }
                page( true, false );
            } );
            back.disabled = step === 0 && !finished;
            footer.appendChild( back );
            const next = button( step === settings.questions.length - 1 ? strings.finish : strings.next, function () {
                if ( answers[step] === null ) { return; }
                advance();
            }, 'mba-pro-discovery-primary' );

            function preview() {
                const count = discoveryMatches( baseItems, activeArea, answers ).length;
                live.textContent = countLabel( count, true );
                empty.hidden = count !== 0;
                next.disabled = answers[step] === null;
            }

            function advance() {
                if ( step < settings.questions.length - 1 ) {
                    step++;
                    page( true, false );
                    return;
                }
                activeAnswers = answers.slice();
                syncUrl();
                render();
                if ( state().filteredItems.length === 0 ) {
                    page( true, true );
                } else {
                    closeDialog();
                    scrollToGrid();
                }
            }

            if ( !finished ) {
                question.answers.forEach( function ( answer, index ) {
                    const choice = button( answer.label, function () {
                        if ( answers[step] !== index ) {
                            for ( let i = step + 1; i < answers.length; i++ ) { answers[i] = null; }
                        }
                        answers[step] = index;
                        choices.querySelectorAll( 'button' ).forEach( function ( node, position ) { node.setAttribute( 'aria-pressed', String( position === index ) ); } );
                        preview();
                    }, 'mba-pro-discovery-answer' );
                    choice.setAttribute( 'aria-pressed', String( answers[step] === index ) );
                    choices.appendChild( choice );
                } );
                host.appendChild( choices );
                if ( question.optional ) {
                    footer.appendChild( button( strings.skip, function () {
                        answers[step] = null;
                        for ( let i = step + 1; i < answers.length; i++ ) { answers[i] = null; }
                        advance();
                    } ) );
                }
                footer.appendChild( next );
            }
            host.appendChild( live );
            host.appendChild( empty );
            host.appendChild( footer );
            preview();
            if ( focusHeading ) { heading.focus(); }
        }
        page( false, false );
    }

    function init() {
        function refreshTheme() {
            document.querySelectorAll( '.mba-pro-discovery, .mba-pro-discovery-tags' ).forEach( applyTheme );
        }
        refreshTheme();
        if ( settings.darkMode === 'auto' && window.matchMedia ) {
            const media = window.matchMedia( '(prefers-color-scheme: dark)' );
            if ( media.addEventListener ) { media.addEventListener( 'change', refreshTheme ); }
            else if ( media.addListener ) { media.addListener( refreshTheme ); }
        }
        document.querySelectorAll( '.mba-pro-discovery-inline' ).forEach( function ( host ) {
            let counts = null;
            try { counts = JSON.parse( host.dataset.mbaMapCounts || 'null' ); } catch ( error ) { counts = null; }
            let samples = null;
            try { samples = JSON.parse( host.dataset.mbaMapCases || 'null' ); } catch ( error ) { samples = null; }
            const url = host.dataset.mbaMapUrl;
            if ( !url && !activeArea ) {
                const area = new URL( window.location.href ).searchParams.get( 'mbarea' );
                if ( area && enabledRegion( area ) ) { activeArea = area; }
            }
            if ( !buildMap( host, host.dataset.mbaMapFigures.split( ',' ), url || 'here', counts, null, samples ) ) { host.hidden = true; }
        } );
        toolbar = document.querySelector( '.mba-pro-discovery-toolbar' );
        if ( !toolbar ) { return; }
        const main = toolbar.parentElement.querySelector( '.medbeafgallery-main-content' );
        if ( !main ) { return; }
        main.insertBefore( toolbar, main.firstChild );
        toolbar.classList.add( 'mba-pro-discovery-ready' );
        initialized = true;
        installGalleryHooks();
        toolbar.addEventListener( 'click', function ( event ) {
            const trigger = event.target.closest( '[data-mba-discovery]' );
            if ( trigger ) { openDialog( trigger.dataset.mbaDiscovery, trigger ); }
        } );
        document.addEventListener( 'click', function ( event ) {
            if ( event.target.closest && event.target.closest( '#medbeafgallery-clear-filters' ) ) {
                activeArea = '';
                activeAnswers = null;
                syncUrl();
                setTimeout( function () { render(); }, 0 );
            }
        }, true );
        document.addEventListener( 'medbeafgallery:consentGiven', restoreUrl );
        window.addEventListener( 'popstate', function () {
            closeDialog();
            restoreUrl();
        } );
        // A cached/deferred gallery may already have emitted dataReady. Empty
        // galleries take the normal event path, which also enables the controls.
        if ( receivedData || allItems().length ) { onDataReady(); }
    }

    document.addEventListener( 'medbeafgallery:dataReady', onDataReady );
    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
} )();
