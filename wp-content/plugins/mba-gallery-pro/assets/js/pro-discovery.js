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
        Object.assign( regions, settings.figures[figure].regions );
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

    function render() {
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

    function onDataReady() {
        receivedData = true;
        if ( !initialized ) {
            return;
        }
        ready = true;
        // Put Discovery after Pro's transform regardless of shortcode ordering.
        installGalleryHooks();
        toolbar.querySelectorAll( '[data-mba-discovery]' ).forEach( function ( trigger ) { trigger.disabled = false; } );
        restoreUrl();
    }

    function svgNode( tag, attributes ) {
        const node = document.createElementNS( 'http://www.w3.org/2000/svg', tag );
        Object.keys( attributes ).forEach( function ( key ) { node.setAttribute( key, attributes[key] ); } );
        return node;
    }

    /** Shared map renderer: standalone maps never need gallery globals. */
    function buildMap( host, figures, navigate ) {
        const prefix = 'mba-pro-discovery-map-' + ( ++mapSerial );
        const available = figures.filter( function ( id ) {
            return settings.figures[id] && Object.keys( settings.figures[id].regions ).some( enabledRegion );
        } );
        if ( !available.length ) {
            return;
        }
        const tabs = element( 'div', 'mba-pro-discovery-tabs' );
        tabs.setAttribute( 'role', 'tablist' );
        tabs.setAttribute( 'aria-label', strings.figures );
        const content = element( 'div', 'mba-pro-discovery-map-content' );
        content.id = prefix + '-panel';
        host.appendChild( tabs );
        host.appendChild( content );

        function selectFigure( id, focusTab ) {
            tabs.querySelectorAll( 'button' ).forEach( function ( tab ) {
                const selected = tab.dataset.figure === id;
                tab.setAttribute( 'aria-selected', String( selected ) );
                tab.tabIndex = selected ? 0 : -1;
                if ( selected && focusTab ) {
                    tab.focus();
                }
            } );
            content.textContent = '';
            content.setAttribute( 'role', 'tabpanel' );
            content.setAttribute( 'aria-labelledby', prefix + '-tab-' + id );
            const figure = settings.figures[id];
            const info = element( 'p', 'mba-pro-discovery-region-info', strings.chooseArea );
            info.setAttribute( 'role', 'status' );
            info.setAttribute( 'aria-live', 'polite' );
            const drawing = svgNode( 'svg', { viewBox: figure.viewBox, class: 'mba-pro-discovery-figure', role: 'group', 'aria-label': figure.label } );
            const list = element( 'div', 'mba-pro-discovery-region-list' );
            list.setAttribute( 'role', 'group' );
            list.setAttribute( 'aria-label', strings.regions );
            const paths = {};
            const choices = {};

            function highlight( regionId ) {
                Object.keys( paths ).forEach( function ( key ) { paths[key].classList.toggle( 'mba-pro-discovery-highlight', key === regionId ); } );
                Object.keys( choices ).forEach( function ( key ) { choices[key].classList.toggle( 'mba-pro-discovery-highlight', key === regionId ); } );
                info.textContent = regionId ? choices[regionId].textContent : strings.chooseArea;
            }

            Object.keys( figure.regions ).forEach( function ( regionId ) {
                const region = figure.regions[regionId];
                const enabled = !!enabledRegion( regionId );
                const count = navigate ? null : allItems().filter( categoryMatcher( region.categories ) ).length;
                const label = navigate || !enabled ? region.label : format( strings.regionCount, region.label, countLabel( count, false ) );
                const choice = button( label, function () { apply( regionId ); }, 'mba-pro-discovery-region-choice' );
                choice.disabled = !enabled;
                choice.setAttribute( 'aria-pressed', String( activeArea === regionId ) );
                choices[regionId] = choice;
                list.appendChild( choice );
                choice.addEventListener( 'focus', function () { highlight( regionId ); } );
                choice.addEventListener( 'mouseenter', function () { highlight( regionId ); } );
                if ( region.path ) {
                    const path = svgNode( 'path', { id: prefix + '-' + regionId, d: region.path, class: 'mba-pro-discovery-region', 'aria-label': label, 'aria-disabled': String( !enabled ), 'aria-pressed': String( activeArea === regionId ), role: 'button', tabindex: enabled ? '0' : '-1' } );
                    paths[regionId] = path;
                    drawing.appendChild( path );
                    if ( enabled ) {
                        path.addEventListener( 'click', function () { apply( regionId ); } );
                        path.addEventListener( 'keydown', function ( event ) {
                            if ( event.key === 'Enter' || event.key === ' ' ) {
                                event.preventDefault();
                                apply( regionId );
                            }
                        } );
                        path.addEventListener( 'focus', function () { highlight( regionId ); } );
                        path.addEventListener( 'mouseenter', function () { highlight( regionId ); } );
                    }
                }
            } );
            // Decorative strokes sit above regions but never intercept input.
            figure.outlines.forEach( function ( path ) {
                drawing.appendChild( svgNode( 'path', { d: path, class: 'mba-pro-discovery-outline', 'aria-hidden': 'true' } ) );
            } );
            content.appendChild( info );
            content.appendChild( drawing );
            content.appendChild( list );
            if ( activeArea && choices[activeArea] ) {
                highlight( activeArea );
            }
        }

        function apply( id ) {
            if ( !enabledRegion( id ) ) {
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

        available.forEach( function ( id, index ) {
            const tab = button( settings.figures[id].label, function () { selectFigure( id, false ); } );
            tab.id = prefix + '-tab-' + id;
            tab.dataset.figure = id;
            tab.setAttribute( 'role', 'tab' );
            tab.setAttribute( 'aria-controls', content.id );
            tab.addEventListener( 'keydown', function ( event ) {
                let target = index;
                if ( event.key === 'ArrowRight' ) { target = ( index + 1 ) % available.length; }
                else if ( event.key === 'ArrowLeft' ) { target = ( index + available.length - 1 ) % available.length; }
                else if ( event.key === 'Home' ) { target = 0; }
                else if ( event.key === 'End' ) { target = available.length - 1; }
                else { return; }
                event.preventDefault();
                selectFigure( available[target], true );
            } );
            tabs.appendChild( tab );
        } );
        selectFigure( available[0], false );
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
        const root = element( 'div', 'mba-pro-discovery mba-pro-discovery-overlay' );
        applyTheme( root );
        const panel = element( 'section', 'mba-pro-discovery-panel' );
        panel.setAttribute( 'role', 'dialog' );
        panel.setAttribute( 'aria-modal', 'true' );
        panel.setAttribute( 'aria-labelledby', 'mba-pro-discovery-heading' );
        panel.tabIndex = -1;
        const header = element( 'div', 'mba-pro-discovery-header' );
        const title = element( 'h2', 'mba-pro-discovery-heading', type === 'map' ? strings.area : settings.guideLabel );
        title.id = 'mba-pro-discovery-heading';
        const close = button( '×', closeDialog, 'mba-pro-discovery-close' );
        close.setAttribute( 'aria-label', strings.close );
        header.appendChild( title );
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
            buildMap( content, settings.showFigures, null );
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
            buildMap( host, host.dataset.mbaMapFigures.split( ',' ), host.dataset.mbaMapUrl );
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
