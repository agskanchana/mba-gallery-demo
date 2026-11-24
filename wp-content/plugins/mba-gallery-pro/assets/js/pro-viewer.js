/**
 * One case viewer for Cinema, Drawer, Comparison desk, Case story and phone Story.
 * Case data remains owned by the gallery; the viewer never fetches or edits it.
 */
(function () {
    'use strict';

    var options = window.mbaProViewerConfig || {};
    var config = window.medbeafgalleryGalleryConfig || {};
    var strings = options.i18n || {};
    var previousOpen = window.openModal;
    var phoneQuery = window.matchMedia( '(max-width: 767px)' );
    var darkQuery = window.matchMedia( '(prefers-color-scheme: dark)' );
    var motionQuery = window.matchMedia( '(prefers-reduced-motion: reduce)' );
    var transparencyQuery = window.matchMedia( '(prefers-reduced-transparency: reduce)' );
    var styles = [ 'default', 'cinema', 'drawer', 'desk', 'story' ];
    var selectedStyle = styles.indexOf( options.style ) !== -1 ? options.style : 'default';
    var root = null;
    var els = {};
    var zoom = null;
    var geometryFrame = 0;
    var fitFrame = 0;
    var inertObserver = null;
    var savedBackground = [];
    var savedScroll = null;
    var preloaded = new Map();
    var pendingConsent = null;
    var pendingData = null;
    var resumeContext = null;
    var waitingHistory = false;
    var pendingHistory = null;
    var dataReady = false;
    var state = {
        open: false,
        item: null,
        list: [],
        views: [],
        view: 0,
        mode: 'split',
        style: '',
        split: 50,
        opener: null,
        sheetOpener: null,
        details: false,
        share: false,
        expanded: false,
        pushedHistory: false,
        markers: [],
        tour: -1,
        tourMode: null,
        tourOpener: null,
        holding: false,
        swipe: null,
        pointers: new Set(),
        lens: { enabled: true, visible: false, x: 0.5, y: 0.5, scale: 2.5 }
    };

    if ( selectedStyle === 'default' && !flag( options.phone_story_mode, false ) ) {
        return;
    }

    function flag( value, fallback ) {
        if ( value === undefined || value === null ) {
            return fallback;
        }
        return [ false, 0, '0', '', 'false', 'off', 'no' ].indexOf( value ) === -1;
    }

    function t( key ) {
        return typeof strings[ key ] === 'string' ? strings[ key ] : '';
    }

    function format( value ) {
        var args = Array.prototype.slice.call( arguments, 1 );
        var next = 0;
        return String( value ).replace( /%(?:(\d+)\$)?s/g, function ( match, number ) {
            var index = number ? Number( number ) - 1 : next++;
            return args[ index ] === undefined ? '' : String( args[ index ] );
        } );
    }

    function text( value ) {
        if ( Array.isArray( value ) ) {
            return value.map( text ).filter( Boolean ).join( ', ' );
        }
        if ( value === null || value === undefined || typeof value === 'object' ) {
            return '';
        }
        // Inert parsing decodes WordPress title entities; all output uses textContent.
        var template = document.createElement( 'template' );
        template.innerHTML = String( value );
        return ( template.content.textContent || '' ).trim();
    }

    function url( value, link ) {
        if ( typeof value !== 'string' || !value.trim() ) {
            return '';
        }
        try {
            var parsed = new URL( value.trim(), document.baseURI );
            var protocols = link ? [ 'http:', 'https:', 'mailto:', 'tel:' ] : [ 'http:', 'https:' ];
            return protocols.indexOf( parsed.protocol ) !== -1 ? value.trim() : '';
        } catch ( error ) {
            return '';
        }
    }

    function node( tag, className, value ) {
        var element = document.createElement( tag );
        if ( className ) {
            element.className = className;
        }
        if ( value !== undefined ) {
            element.textContent = value;
        }
        return element;
    }

    function button( label, action, className, glyph ) {
        var element = node( 'button', 'mba-pro-viewer-button' + ( className ? ' ' + className : '' ), glyph || label );
        element.type = 'button';
        if ( action ) {
            element.dataset.action = action;
        }
        if ( glyph ) {
            element.setAttribute( 'aria-label', label );
            element.title = label;
        }
        return element;
    }

    // Simple 24px line icons. "F:" marks a filled shape. Drawn here, so the
    // viewer needs no icon font, sprite or extra request.
    var ICONS = {
        close: [ 'M6 6l12 12M18 6 6 18' ],
        previous: [ 'M15 5l-7 7 7 7' ],
        next: [ 'M9 5l7 7-7 7' ],
        casePrevious: [ 'M16 6l-6 6 6 6M7.5 6v12' ],
        caseNext: [ 'M8 6l6 6-6 6M16.5 6v12' ],
        split: [ 'M4 5.5h16v13H4z', 'M12 3v18', 'M8.5 10 6.5 12l2 2M15.5 10l2 2-2 2' ],
        before: [ 'M4 5.5h16v13H4z', 'F:M4 5.5h8v13H4z' ],
        after: [ 'M4 5.5h16v13H4z', 'F:M12 5.5h8v13h-8z' ],
        both: [ 'M3 6h7.5v12H3zM13.5 6H21v12h-7.5z' ],
        handle: [ 'M9 8l-4 4 4 4M15 8l4 4-4 4' ],
        zoomIn: [ 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5 20 20M10.5 7.75v5.5M7.75 10.5h5.5' ],
        zoomOut: [ 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5 20 20M7.75 10.5h5.5' ],
        reset: [ 'M5 12a7 7 0 1 0 2.05-4.95M5 4.5v3.5h3.5' ],
        info: [ 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 11v5.5', 'F:M12 6.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4z' ],
        magnifier: [ 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5 20 20' ],
        plus: [ 'M12 5.5v13M5.5 12h13' ],
        minus: [ 'M5.5 12h13' ],
        share: [ 'M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5' ],
        details: [ 'M4 6.5h16M4 12h16M4 17.5h10' ],
        tour: [ 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z' ],
        expand: [ 'M8.5 3.5h-5v5M15.5 3.5h5v5M8.5 20.5h-5v-5M15.5 20.5h5v-5' ],
        arrow: [ 'M5 12h14M13 6l6 6-6 6' ],
        link: [ 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1' ],
        mail: [ 'M3.5 6h17v12h-17zM4 7l8 6 8-6' ],
        external: [ 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5' ],
        swap: [ 'M7 7h11l-3-3M17 17H6l3 3' ],
        tag: [ 'M3.5 12V4.5H11l9.5 9.5-7 7z', 'F:M7.75 6.75a1 1 0 1 0 0 2 1 1 0 1 0 0-2z' ],
        user: [ 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0' ],
        calendar: [ 'M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4' ],
        clock: [ 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7.5V12l3 2' ],
        pulse: [ 'M3 12h4l2.5-6 5 12 2.5-6h4' ],
        sparkle: [ 'M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z' ],
        shield: [ 'M12 3.5l7.5 3V12c0 4.5-3.2 7.6-7.5 8.5C7.7 19.6 4.5 16.5 4.5 12V6.5z' ],
        clipboard: [ 'M8.5 4.5h-3v16h13v-16h-3M8.5 3h7v3h-7zM8.5 11h7M8.5 15h5' ],
        dot: [ 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9z' ]
    };

    function icon( name ) {
        var svgNs = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS( svgNs, 'svg' );
        svg.setAttribute( 'class', 'mba-pro-viewer-icon' );
        svg.setAttribute( 'viewBox', '0 0 24 24' );
        svg.setAttribute( 'aria-hidden', 'true' );
        svg.setAttribute( 'focusable', 'false' );
        ( ICONS[ name ] || ICONS.dot ).forEach( function ( data ) {
            var path = document.createElementNS( svgNs, 'path' );
            if ( data.indexOf( 'F:' ) === 0 ) {
                path.setAttribute( 'class', 'mba-pro-viewer-icon-fill' );
                data = data.slice( 2 );
            }
            path.setAttribute( 'd', data );
            svg.appendChild( path );
        } );
        return svg;
    }

    /**
     * A button with an icon. With showLabel the label is visible text (it may
     * still be visually hidden by a style); otherwise it is the aria-label and
     * a tooltip. Either way the label text stays in the DOM.
     */
    function iconButton( label, action, className, iconName, showLabel ) {
        var element = node( 'button', 'mba-pro-viewer-button' + ( className ? ' ' + className : '' ) );
        element.type = 'button';
        if ( action ) {
            element.dataset.action = action;
        }
        element.appendChild( icon( iconName ) );
        element.appendChild( node( 'span', showLabel ? 'mba-pro-viewer-button-label' : 'mba-pro-viewer-sr', label ) );
        if ( !showLabel ) {
            element.setAttribute( 'aria-label', label );
            element.title = label;
        }
        return element;
    }

    function setLabel( element, label ) {
        var caption = element.querySelector( '.mba-pro-viewer-button-label, .mba-pro-viewer-sr' );
        if ( caption ) {
            caption.textContent = label;
        } else {
            element.textContent = label;
        }
        if ( element.hasAttribute( 'aria-label' ) ) {
            element.setAttribute( 'aria-label', label );
            element.title = label;
        }
    }

    function hidden( element, value ) {
        element.hidden = !!value;
    }

    function openInNewTab( anchor ) {
        if ( /^https?:$/.test( new URL( anchor.href, document.baseURI ).protocol ) ) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.appendChild( node( 'span', 'mba-pro-viewer-sr', t( 'newTab' ) ) );
        }
    }

    function css( element, name, value ) {
        element.style.setProperty( name, value, 'important' );
    }

    function focus( element ) {
        if ( !element || !element.isConnected ) {
            return;
        }
        try {
            element.focus( { preventScroll: true } );
        } catch ( error ) {
            element.focus();
        }
    }

    function announce( message ) {
        if ( els.live ) {
            els.live.textContent = '';
            window.setTimeout( function () {
                if ( state.open ) {
                    els.live.textContent = message;
                }
            }, 30 );
        }
    }

    function galleryList() {
        if ( typeof galleryConfig !== 'undefined' && galleryConfig && Array.isArray( galleryConfig.filteredItems ) ) {
            return galleryConfig.filteredItems;
        }
        return allItems();
    }

    function allItems() {
        if ( typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ) {
            return galleryData;
        }
        return Array.isArray( window.galleryData ) ? window.galleryData : [];
    }

    function sameId( item, id ) {
        return !!item && String( item.id ) === String( id );
    }

    function findItem( id, list ) {
        return ( list || [] ).find( function ( item ) { return sameId( item, id ); } ) ||
            allItems().find( function ( item ) { return sameId( item, id ); } ) || null;
    }

    function caseIndex() {
        return state.list.findIndex( function ( item ) { return sameId( item, state.item.id ); } );
    }

    function effectiveStyle() {
        return phoneQuery.matches && flag( options.phone_story_mode, false ) ? 'phone' : selectedStyle;
    }

    function consentShowing() {
        var overlay = document.getElementById( 'medbeafgallery-consent-overlay' );
        if ( !overlay || overlay.hidden || overlay.getAttribute( 'aria-hidden' ) === 'true' ) {
            return false;
        }
        var computed = window.getComputedStyle( overlay );
        return computed.display !== 'none' && computed.visibility !== 'hidden';
    }

    function makeViews( item ) {
        var views = [];
        var pairs = [ {
            beforeImg: item.beforeImg || item.main_before_image,
            afterImg: item.afterImg || item.main_after_image,
            beforeThumb: item.beforeThumb,
            afterThumb: item.afterThumb,
            beforeAlt: item.beforeAlt || item.main_before_alt,
            afterAlt: item.afterAlt || item.main_after_alt,
            description: item.main_description
        } ].concat( Array.isArray( item.imagePairs ) ? item.imagePairs : ( Array.isArray( item.image_pairs ) ? item.image_pairs : [] ) );
        pairs.forEach( function ( pair, index ) {
            if ( !pair || typeof pair !== 'object' ) {
                return;
            }
            var before = url( pair.beforeImg );
            var after = url( pair.afterImg );
            if ( before || after ) {
                views.push( {
                    type: 'pair', index: index, before: before, after: after,
                    beforeThumb: url( pair.beforeThumb ) || before,
                    afterThumb: url( pair.afterThumb ) || after,
                    beforeAlt: text( pair.beforeAlt ) || text( item.title ) + ' — ' + beforeLabel(),
                    afterAlt: text( pair.afterAlt ) || text( item.title ) + ' — ' + afterLabel(),
                    label: text( pair.description ) || ( index ? format( t( 'view' ), index + 1 ) : t( 'mainView' ) ),
                    note: '', date: '', elapsed: ''
                } );
            }
        } );
        if ( flag( options.show_timeline, true ) && Array.isArray( item.timeline ) ) {
            var stages = item.timeline.map( function ( stage, index ) {
                if ( !stage || !url( stage.image ) ) {
                    return null;
                }
                return {
                    type: 'stage', index: index, before: '', after: url( stage.image ),
                    beforeThumb: '', afterThumb: url( stage.thumb ) || url( stage.image ),
                    beforeAlt: '', afterAlt: text( stage.alt ) || text( stage.label ) || text( item.title ),
                    label: text( stage.label ) || format( t( 'stage' ), index + 1 ),
                    // Skip the elapsed time when the owner's label already says it ("6 weeks · 6 weeks").
                    note: text( stage.note ),
                    elapsed: text( stage.elapsed ).toLowerCase() === text( stage.label ).toLowerCase() ? '' : text( stage.elapsed ),
                    date: /^\d{4}-\d{2}-\d{2}$/.test( stage.date || '' ) ? stage.date : '',
                    annotations: stage.annotations
                };
            } ).filter( Boolean );
            if ( stages.length >= 2 ) {
                views = views.concat( stages );
            }
        }
        if ( !views.length ) {
            views.push( { type: 'pair', index: 0, before: '', after: '', beforeThumb: '', afterThumb: '', beforeAlt: '', afterAlt: '', label: t( 'mainView' ), note: '', date: '', elapsed: '' } );
        }
        return views;
    }

    function beforeLabel() {
        return text( config.beforeLabel ) || t( 'before' );
    }

    function afterLabel() {
        return text( config.afterLabel ) || t( 'after' );
    }

    function picturePane( side ) {
        var pane = node( 'div', 'mba-pro-viewer-pane mba-pro-viewer-pane-' + side );
        var visual = node( 'div', 'mba-pro-viewer-visual' );
        var image = node( 'img', 'mba-pro-viewer-photo' );
        image.decoding = 'async';
        var pins = node( 'div', 'mba-pro-viewer-markers' );
        var label = node( 'span', 'mba-pro-viewer-photo-label' );
        var missing = node( 'span', 'mba-pro-viewer-image-missing', t( 'unavailable' ) );
        var loupe = node( 'div', 'mba-pro-viewer-loupe' );
        loupe.setAttribute( 'aria-hidden', 'true' );
        var loupeImage = node( 'img', 'mba-pro-viewer-loupe-photo' );
        loupeImage.alt = '';
        loupeImage.draggable = false;
        loupe.appendChild( loupeImage );
        visual.appendChild( image );
        visual.appendChild( pins );
        pane.appendChild( visual );
        pane.appendChild( missing );
        pane.appendChild( loupe );
        pane.appendChild( label );
        image.addEventListener( 'load', function () {
            pane.dataset.loaded = 'true';
            pane.dataset.missing = 'false';
            scheduleGeometry();
        } );
        image.addEventListener( 'error', function () {
            pane.dataset.loaded = 'false';
            pane.dataset.missing = 'true';
            scheduleGeometry();
        } );
        pane.dataset.side = side;
        return { pane: pane, visual: visual, image: image, pins: pins, label: label, loupe: loupe, loupeImage: loupeImage };
    }

    function ensureRoot() {
        if ( root ) {
            return;
        }
        root = node( 'div', 'mba-pro-viewer' );
        root.id = 'mba-pro-viewer';
        root.hidden = true;
        root.setAttribute( 'aria-hidden', 'true' );
        var backdrop = node( 'div', 'mba-pro-viewer-backdrop' );
        backdrop.dataset.action = 'close';
        backdrop.setAttribute( 'aria-hidden', 'true' );
        els.dialog = node( 'section', 'mba-pro-viewer-dialog' );
        els.dialog.id = 'mba-pro-viewer-dialog';
        els.dialog.tabIndex = -1;
        els.dialog.setAttribute( 'role', 'dialog' );
        els.dialog.setAttribute( 'aria-modal', 'true' );
        els.dialog.setAttribute( 'aria-labelledby', 'mba-pro-viewer-title' );
        els.dialog.setAttribute( 'aria-describedby', 'mba-pro-viewer-help' );
        // Cinema's full-bleed glow; decorative, so it is hidden from everyone.
        els.ambience = node( 'img', 'mba-pro-viewer-ambience' );
        els.ambience.alt = '';
        els.ambience.draggable = false;
        els.ambience.setAttribute( 'aria-hidden', 'true' );
        els.header = node( 'header', 'mba-pro-viewer-header' );
        var titleBlock = node( 'div', 'mba-pro-viewer-title-block' );
        els.eyebrow = node( 'p', 'mba-pro-viewer-eyebrow' );
        els.title = node( 'h2', 'mba-pro-viewer-title' );
        els.title.id = 'mba-pro-viewer-title';
        titleBlock.appendChild( els.eyebrow );
        titleBlock.appendChild( els.title );
        els.header.appendChild( titleBlock );
        els.headerActions = node( 'div', 'mba-pro-viewer-header-actions' );
        // One case navigation group; applyStyle() moves it to the header
        // (Cinema) or the footer (everything else).
        els.caseNav = node( 'div', 'mba-pro-viewer-case-nav' );
        els.caseNav.setAttribute( 'role', 'group' );
        els.caseNav.setAttribute( 'aria-label', t( 'caseNavigation' ) || t( 'nextCase' ) );
        els.previousCase = iconButton( t( 'previousCase' ), 'previous-case', 'mba-pro-viewer-round', 'casePrevious' );
        els.counter = node( 'span', 'mba-pro-viewer-case-counter' );
        els.nextCase = iconButton( t( 'nextCase' ), 'next-case', 'mba-pro-viewer-round', 'caseNext' );
        [ els.previousCase, els.counter, els.nextCase ].forEach( function ( element ) { els.caseNav.appendChild( element ); } );
        els.expand = iconButton( t( 'expand' ), 'expand', 'mba-pro-viewer-round', 'expand' );
        els.expand.setAttribute( 'aria-expanded', 'false' );
        els.close = iconButton( t( 'close' ), 'close', 'mba-pro-viewer-round mba-pro-viewer-close', 'close' );
        [ els.expand, els.close ].forEach( function ( element ) { els.headerActions.appendChild( element ); } );
        els.header.appendChild( els.headerActions );
        els.progress = node( 'nav', 'mba-pro-viewer-progress' );
        els.progress.setAttribute( 'aria-label', t( 'imageViews' ) );
        els.body = node( 'div', 'mba-pro-viewer-body' );
        els.main = node( 'div', 'mba-pro-viewer-main' );
        els.toolbar = node( 'div', 'mba-pro-viewer-toolbar' );
        els.modes = node( 'div', 'mba-pro-viewer-modes' );
        els.modes.id = 'mba-pro-viewer-modes';
        els.modes.setAttribute( 'role', 'group' );
        els.modes.setAttribute( 'aria-label', t( 'comparison' ) );
        [ 'split', 'before', 'after', 'both' ].forEach( function ( mode ) {
            var label = mode === 'before' ? beforeLabel() : ( mode === 'after' ? afterLabel() : t( mode ) );
            var modeButton = iconButton( label, 'mode', 'mba-pro-viewer-segment', mode, true );
            modeButton.dataset.mode = mode;
            modeButton.setAttribute( 'aria-pressed', 'false' );
            els.modes.appendChild( modeButton );
        } );
        els.lensControls = node( 'div', 'mba-pro-viewer-lens-controls' );
        els.lensControls.setAttribute( 'role', 'group' );
        els.lensControls.setAttribute( 'aria-label', t( 'magnifier' ) );
        els.lensToggle = iconButton( t( 'magnifierToggle' ) || t( 'magnifier' ), 'lens-toggle', 'mba-pro-viewer-lens-toggle', 'magnifier', true );
        els.lensToggle.setAttribute( 'aria-pressed', 'true' );
        els.lensOut = iconButton( t( 'magnifierOut' ), 'lens-out', 'mba-pro-viewer-round', 'minus' );
        els.lensIn = iconButton( t( 'magnifierIn' ), 'lens-in', 'mba-pro-viewer-round', 'plus' );
        els.lensValue = node( 'output', 'mba-pro-viewer-lens-value', '2.5×' );
        var lensDivider = node( 'span', 'mba-pro-viewer-lens-divider' );
        lensDivider.setAttribute( 'aria-hidden', 'true' );
        [ els.lensToggle, lensDivider, els.lensOut, els.lensValue, els.lensIn ].forEach( function ( element ) { els.lensControls.appendChild( element ); } );
        els.toolbar.appendChild( els.modes );
        els.toolbar.appendChild( els.lensControls );
        els.stage = node( 'div', 'mba-pro-viewer-stage' );
        els.stage.tabIndex = 0;
        els.stage.setAttribute( 'role', 'group' );
        els.stage.setAttribute( 'aria-label', t( 'imageStage' ) );
        els.stage.setAttribute( 'aria-describedby', 'mba-pro-viewer-help mba-pro-viewer-display-note' );
        els.canvas = node( 'div', 'mba-pro-viewer-canvas' );
        els.before = picturePane( 'before' );
        els.after = picturePane( 'after' );
        els.canvas.appendChild( els.before.pane );
        els.canvas.appendChild( els.after.pane );
        els.divider = node( 'div', 'mba-pro-viewer-divider' );
        els.divider.tabIndex = 0;
        els.divider.setAttribute( 'role', 'slider' );
        els.divider.setAttribute( 'aria-label', t( 'divider' ) );
        els.divider.setAttribute( 'aria-valuemin', '0' );
        els.divider.setAttribute( 'aria-valuemax', '100' );
        els.divider.setAttribute( 'aria-orientation', 'horizontal' );
        els.divider.setAttribute( 'aria-describedby', 'mba-pro-viewer-divider-help' );
        var grip = node( 'span', 'mba-pro-viewer-divider-grip' );
        grip.setAttribute( 'aria-hidden', 'true' );
        grip.appendChild( icon( 'handle' ) );
        els.divider.appendChild( grip );
        els.canvas.appendChild( els.divider );
        els.holdHint = node( 'span', 'mba-pro-viewer-hold-hint', t( 'hold' ) );
        els.holdHint.setAttribute( 'aria-hidden', 'true' );
        // Phone Story tap zones: invisible, but labelled and focusable.
        els.edgePrevious = button( t( 'previousView' ), 'previous-view', 'mba-pro-viewer-edge mba-pro-viewer-edge-previous' );
        els.edgeNext = button( t( 'nextView' ), 'next-view', 'mba-pro-viewer-edge mba-pro-viewer-edge-next' );
        els.edgePrevious.textContent = '';
        els.edgeNext.textContent = '';
        els.edgePrevious.setAttribute( 'aria-label', t( 'previousView' ) );
        els.edgeNext.setAttribute( 'aria-label', t( 'nextView' ) );
        // Zoom: one small floating pill over the photo.
        els.stageTools = node( 'div', 'mba-pro-viewer-stage-tools' );
        els.zoomControls = node( 'div', 'mba-pro-viewer-zoom-controls mba-pro-viewer-glass' );
        els.zoomControls.setAttribute( 'role', 'group' );
        els.zoomControls.setAttribute( 'aria-label', t( 'zoom' ) );
        els.zoomOut = iconButton( t( 'zoomOut' ), 'zoom-out', 'mba-pro-viewer-round', 'zoomOut' );
        els.zoomIn = iconButton( t( 'zoomIn' ), 'zoom-in', 'mba-pro-viewer-round', 'zoomIn' );
        els.zoomReset = iconButton( t( 'resetZoom' ), 'zoom-reset', 'mba-pro-viewer-round', 'reset' );
        els.zoomValue = node( 'output', 'mba-pro-viewer-zoom-value', '1×' );
        [ els.zoomOut, els.zoomValue, els.zoomIn, els.zoomReset ].forEach( function ( element ) { els.zoomControls.appendChild( element ); } );
        // Explanations stay available to screen readers (aria-describedby) and
        // are shown on demand behind one ⓘ button instead of permanent text.
        els.info = node( 'div', 'mba-pro-viewer-info' );
        els.infoButton = iconButton( t( 'aboutControls' ) || t( 'zoom' ), 'info', 'mba-pro-viewer-round mba-pro-viewer-info-button', 'info' );
        els.infoButton.setAttribute( 'aria-expanded', 'false' );
        els.infoButton.setAttribute( 'aria-controls', 'mba-pro-viewer-info-panel' );
        els.infoPanel = node( 'div', 'mba-pro-viewer-info-panel' );
        els.infoPanel.id = 'mba-pro-viewer-info-panel';
        els.displayNote = node( 'p', 'mba-pro-viewer-display-note', t( 'displayNote' ) );
        els.displayNote.id = 'mba-pro-viewer-display-note';
        els.alignment = node( 'p', 'mba-pro-viewer-explanation', t( 'alignmentNote' ) );
        els.alignment.id = 'mba-pro-viewer-alignment-note';
        els.lensHelp = node( 'p', 'mba-pro-viewer-explanation', t( 'magnifierHelp' ) );
        els.lensHelp.id = 'mba-pro-viewer-lens-help';
        [ els.lensHelp, els.alignment, els.displayNote ].forEach( function ( element ) { els.infoPanel.appendChild( element ); } );
        hidden( els.infoPanel, true );
        els.info.appendChild( els.infoButton );
        els.info.appendChild( els.infoPanel );
        els.stageTools.appendChild( els.zoomControls );
        els.stageTools.appendChild( els.info );
        [ els.canvas, els.edgePrevious, els.edgeNext, els.holdHint, els.stageTools ].forEach( function ( element ) { els.stage.appendChild( element ); } );
        els.caption = node( 'div', 'mba-pro-viewer-caption' );
        // One compact strip of image pairs; progress stages live on the timeline.
        els.views = node( 'div', 'mba-pro-viewer-views' );
        els.strip = node( 'nav', 'mba-pro-viewer-filmstrip' );
        els.strip.setAttribute( 'aria-label', t( 'imagePairs' ) || t( 'imageViews' ) );
        els.viewNav = node( 'div', 'mba-pro-viewer-view-nav' );
        els.viewNav.setAttribute( 'role', 'group' );
        els.viewNav.setAttribute( 'aria-label', t( 'imageViews' ) );
        els.viewNav.appendChild( iconButton( t( 'previousView' ), 'previous-view', 'mba-pro-viewer-round', 'previous' ) );
        els.viewLabel = node( 'span', 'mba-pro-viewer-view-label' );
        els.viewNav.appendChild( els.viewLabel );
        els.viewNav.appendChild( iconButton( t( 'nextView' ), 'next-view', 'mba-pro-viewer-round', 'next' ) );
        els.views.appendChild( els.strip );
        els.views.appendChild( els.viewNav );
        els.timeline = node( 'section', 'mba-pro-viewer-timeline' );
        els.timeline.setAttribute( 'aria-labelledby', 'mba-pro-viewer-timeline-title' );
        var timelineTitle = node( 'h3', 'mba-pro-viewer-section-title', t( 'timeline' ) );
        timelineTitle.id = 'mba-pro-viewer-timeline-title';
        els.timelineScroll = node( 'div', 'mba-pro-viewer-timeline-scroll' );
        els.timelineTrack = node( 'div', 'mba-pro-viewer-timeline-track' );
        els.timelineTrack.setAttribute( 'role', 'toolbar' );
        els.timelineTrack.setAttribute( 'aria-label', t( 'timeline' ) );
        els.timelineTrack.setAttribute( 'aria-describedby', 'mba-pro-viewer-timeline-help' );
        els.timelineScroll.appendChild( els.timelineTrack );
        var timelineHelp = node( 'p', 'mba-pro-viewer-sr', t( 'timelineHelp' ) );
        timelineHelp.id = 'mba-pro-viewer-timeline-help';
        [ timelineTitle, els.timelineScroll, timelineHelp ].forEach( function ( element ) { els.timeline.appendChild( element ); } );
        [ els.toolbar, els.stage, els.caption, els.views, els.timeline ].forEach( function ( element ) { els.main.appendChild( element ); } );
        buildDetails();
        els.teaser = button( '', 'next-case', 'mba-pro-viewer-teaser' );
        els.body.appendChild( els.main );
        els.body.appendChild( els.details );
        els.body.appendChild( els.teaser );
        els.sheetShade = node( 'div', 'mba-pro-viewer-sheet-shade' );
        els.sheetShade.dataset.action = 'close-details';
        els.sheetShade.setAttribute( 'aria-hidden', 'true' );
        buildTour();
        buildShare();
        els.footer = node( 'footer', 'mba-pro-viewer-footer' );
        els.footerStart = node( 'div', 'mba-pro-viewer-footer-start' );
        els.footerMiddle = node( 'div', 'mba-pro-viewer-footer-middle' );
        els.footerEnd = node( 'div', 'mba-pro-viewer-footer-end' );
        els.actions = node( 'div', 'mba-pro-viewer-actions' );
        els.tourButton = iconButton( t( 'tour' ), 'tour', 'mba-pro-viewer-ghost', 'tour', true );
        els.tourButton.setAttribute( 'aria-controls', 'mba-pro-viewer-tour' );
        els.tourButton.setAttribute( 'aria-expanded', 'false' );
        els.detailsButton = iconButton( t( 'details' ), 'details', 'mba-pro-viewer-ghost', 'details', true );
        els.detailsButton.setAttribute( 'aria-controls', 'mba-pro-viewer-details' );
        els.detailsButton.setAttribute( 'aria-expanded', 'false' );
        els.shareButton = iconButton( t( 'share' ), 'share', 'mba-pro-viewer-ghost', 'share', true );
        els.shareButton.setAttribute( 'aria-controls', 'mba-pro-viewer-share' );
        els.shareButton.setAttribute( 'aria-expanded', 'false' );
        els.phoneModesButton = iconButton( t( 'compare' ) || t( 'comparison' ), 'phone-modes', 'mba-pro-viewer-ghost', 'split', true );
        els.phoneModesButton.setAttribute( 'aria-controls', 'mba-pro-viewer-modes' );
        els.phoneModesButton.setAttribute( 'aria-expanded', 'false' );
        els.beforeToggle = iconButton( t( 'showBefore' ), 'before-toggle', 'mba-pro-viewer-ghost', 'swap', true );
        els.beforeToggle.setAttribute( 'aria-pressed', 'false' );
        [ els.beforeToggle, els.phoneModesButton, els.tourButton, els.detailsButton, els.shareButton ].forEach( function ( element ) { els.actions.appendChild( element ); } );
        els.footerEnd.appendChild( els.actions );
        els.footerEnd.appendChild( els.cta );
        [ els.footerStart, els.footerMiddle, els.footerEnd ].forEach( function ( element ) { els.footer.appendChild( element ); } );
        els.help = node( 'p', 'mba-pro-viewer-sr', t( 'keyboardHelp' ) );
        els.help.id = 'mba-pro-viewer-help';
        var dividerHelp = node( 'p', 'mba-pro-viewer-sr', t( 'dividerHelp' ) );
        dividerHelp.id = 'mba-pro-viewer-divider-help';
        els.live = node( 'div', 'mba-pro-viewer-sr' );
        els.live.setAttribute( 'role', 'status' );
        els.live.setAttribute( 'aria-live', 'polite' );
        els.live.setAttribute( 'aria-atomic', 'true' );
        [ els.ambience, els.header, els.progress, els.body, els.sheetShade, els.tourPanel, els.sharePanel, els.footer, els.help, dividerHelp, els.live ].forEach( function ( element ) { els.dialog.appendChild( element ); } );
        root.appendChild( backdrop );
        root.appendChild( els.dialog );
        document.body.appendChild( root );
        bindEvents();
        if ( window.mbaProZoom && typeof window.mbaProZoom.create === 'function' ) {
            zoom = window.mbaProZoom.create( els.canvas, {
                // The shared zoom measures its first target. Put the visible
                // pane first, because display:none panes have no layout width.
                targets: function () { return displayedMode() === 'before' ? [ els.before.visual, els.after.visual ] : [ els.after.visual, els.before.visual ]; },
                enabled: zoomEnabled,
                canWheelZoom: function () { return state.style === 'cinema'; },
                onChange: function ( scale ) {
                    root.style.setProperty( '--mba-viewer-marker-scale', String( 1 / scale ) );
                    els.zoomValue.textContent = scale.toFixed( scale === 1 ? 0 : 1 ) + '×';
                    els.zoomOut.disabled = scale <= 1;
                    els.zoomIn.disabled = scale >= 4;
                    els.zoomReset.disabled = scale <= 1;
                }
            } );
        }
        if ( typeof ResizeObserver !== 'undefined' ) {
            var observer = new ResizeObserver( scheduleGeometry );
            [ els.canvas, els.header, els.footer ].forEach( function ( element ) { observer.observe( element ); } );
        }
    }

    function buildDetails() {
        els.details = node( 'section', 'mba-pro-viewer-details' );
        els.details.id = 'mba-pro-viewer-details';
        els.details.setAttribute( 'aria-labelledby', 'mba-pro-viewer-details-title' );
        var heading = node( 'div', 'mba-pro-viewer-details-header' );
        els.detailsTitle = node( 'h3', 'mba-pro-viewer-section-title', t( 'caseDetails' ) );
        els.detailsTitle.id = 'mba-pro-viewer-details-title';
        els.closeDetails = iconButton( t( 'closeDetails' ), 'close-details', 'mba-pro-viewer-round', 'close' );
        heading.appendChild( els.detailsTitle );
        heading.appendChild( els.closeDetails );
        els.detailsContent = node( 'div', 'mba-pro-viewer-details-content' );
        els.detailsTimeline = node( 'div', 'mba-pro-viewer-details-timeline' );
        els.notes = node( 'details', 'mba-pro-viewer-notes' );
        els.notes.appendChild( node( 'summary', '', t( 'allNotes' ) ) );
        els.notesList = node( 'ol', 'mba-pro-viewer-notes-list' );
        els.notes.appendChild( els.notesList );
        // The booking button lives in the footer (or Story's action bar).
        els.cta = node( 'div', 'mba-pro-viewer-cta' );
        [ heading, els.detailsContent, els.detailsTimeline, els.notes ].forEach( function ( element ) { els.details.appendChild( element ); } );
    }

    function buildTour() {
        els.tourPanel = node( 'section', 'mba-pro-viewer-tour' );
        els.tourPanel.id = 'mba-pro-viewer-tour';
        els.tourPanel.setAttribute( 'role', 'region' );
        els.tourPanel.setAttribute( 'aria-labelledby', 'mba-pro-viewer-tour-title' );
        var kicker = node( 'p', 'mba-pro-viewer-tour-kicker', t( 'tour' ) );
        kicker.setAttribute( 'aria-hidden', 'true' );
        els.tourTitle = node( 'h3', 'mba-pro-viewer-section-title' );
        els.tourTitle.id = 'mba-pro-viewer-tour-title';
        els.tourTitle.tabIndex = -1;
        els.tourNote = node( 'p', 'mba-pro-viewer-tour-note' );
        els.tourCounter = node( 'span', 'mba-pro-viewer-tour-count' );
        var controls = node( 'div', 'mba-pro-viewer-tour-controls' );
        els.tourPrevious = button( t( 'previous' ), 'tour-previous' );
        els.tourNext = button( t( 'next' ), 'tour-next' );
        var done = button( t( 'done' ), 'tour-done', 'mba-pro-viewer-tour-done' );
        els.tourDone = done;
        [ els.tourCounter, els.tourPrevious, els.tourNext, done ].forEach( function ( element ) { controls.appendChild( element ); } );
        [ kicker, els.tourTitle, els.tourNote, controls ].forEach( function ( element ) { els.tourPanel.appendChild( element ); } );
        hidden( els.tourPanel, true );
    }

    function buildShare() {
        els.sharePanel = node( 'section', 'mba-pro-viewer-share' );
        els.sharePanel.id = 'mba-pro-viewer-share';
        els.sharePanel.setAttribute( 'aria-labelledby', 'mba-pro-viewer-share-title' );
        var header = node( 'div', 'mba-pro-viewer-share-header' );
        var title = node( 'h3', 'mba-pro-viewer-section-title', t( 'share' ) );
        title.id = 'mba-pro-viewer-share-title';
        header.appendChild( title );
        header.appendChild( iconButton( t( 'closeShare' ), 'close-share', 'mba-pro-viewer-round', 'close' ) );
        els.shareLinks = node( 'div', 'mba-pro-viewer-share-links' );
        els.copy = iconButton( t( 'copyLink' ), 'copy', '', 'link', true );
        els.shareLinks.appendChild( els.copy );
        var shareIcons = { email: 'mail', facebook: 'external', x: 'external' };
        [ 'email', 'facebook', 'x' ].forEach( function ( name ) {
            var anchor = node( 'a', 'mba-pro-viewer-button' );
            anchor.appendChild( icon( shareIcons[ name ] ) );
            anchor.appendChild( node( 'span', 'mba-pro-viewer-button-label', t( name ) ) );
            anchor.dataset.share = name;
            if ( name !== 'email' ) {
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                anchor.appendChild( node( 'span', 'mba-pro-viewer-sr', t( 'newTab' ) ) );
            }
            els.shareLinks.appendChild( anchor );
        } );
        els.nativeShare = iconButton( t( 'nativeShare' ), 'native-share', '', 'share', true );
        els.shareLinks.appendChild( els.nativeShare );
        els.shareStatus = node( 'p', 'mba-pro-viewer-share-status' );
        els.shareStatus.setAttribute( 'role', 'status' );
        els.shareStatus.setAttribute( 'aria-live', 'polite' );
        els.copyFallback = node( 'label', 'mba-pro-viewer-copy-fallback', t( 'copyHelp' ) );
        els.copyInput = node( 'input', 'mba-pro-viewer-copy-input' );
        els.copyInput.type = 'text';
        els.copyInput.readOnly = true;
        els.copyFallback.appendChild( els.copyInput );
        [ header, els.shareLinks, els.shareStatus, els.copyFallback ].forEach( function ( element ) { els.sharePanel.appendChild( element ); } );
        hidden( els.copyFallback, true );
        hidden( els.sharePanel, true );
    }

    function viewerOpen( id ) {
        var context = resumeContext;
        resumeContext = null;
        var list = context ? context.list : ( state.open ? state.list : galleryList().slice() );
        var opener = context ? context.opener : document.activeElement;
        if ( waitingHistory ) {
            pendingHistory = { id: id, list: list, opener: opener };
            return false;
        }
        if ( consentShowing() ) {
            pendingConsent = { id: id, list: list, opener: opener };
            return false;
        }
        var style = effectiveStyle();
        if ( style === 'default' ) {
            return typeof previousOpen === 'function' ? previousOpen.apply( this, arguments ) : false;
        }
        var item = findItem( id, list );
        if ( !item ) {
            if ( !dataReady && !allItems().length ) {
                pendingData = { id: id, list: list, opener: opener };
            }
            return false;
        }
        ensureRoot();
        var firstOpen = !state.open;
        if ( firstOpen ) {
            state.opener = opener;
            state.list = list.length && list.some( function ( entry ) { return sameId( entry, id ); } ) ? list.slice() : [ item ];
            state.open = true;
            state.pushedHistory = false;
            try {
                // Keep an existing router's state; the deep-link wrapper may later
                // replace it with null, so closing also tracks ownership locally.
                var historyState = history.state && typeof history.state === 'object' ? Object.assign( {}, history.state ) : {};
                historyState.mbaProViewer = true;
                history.pushState( historyState, '', window.location.href );
                state.pushedHistory = true;
            } catch ( error ) {}
            lockBackground();
        }
        state.item = item;
        state.views = makeViews( item );
        state.view = 0;
        state.split = 50;
        state.tour = -1;
        state.tourMode = null;
        state.tourOpener = null;
        state.holding = false;
        state.swipe = null;
        state.pointers.clear();
        state.details = false;
        state.share = false;
        state.lens.visible = false;
        setInfo( false );
        state.mode = initialMode( style );
        applyStyle( style );
        root.hidden = false;
        root.setAttribute( 'aria-hidden', 'false' );
        root.classList.add( 'mba-pro-viewer-open' );
        root.classList.remove( 'mba-pro-viewer-modes-open' );
        els.phoneModesButton.setAttribute( 'aria-expanded', 'false' );
        renderCase();
        renderView();
        els.body.scrollTop = 0;
        els.details.scrollTop = 0;
        if ( firstOpen || !root.contains( document.activeElement ) || !visibleFocus( document.activeElement ) ) {
            focus( els.close );
        }
        preloadNeighbours();
        document.dispatchEvent( new CustomEvent( 'mba-pro-viewer:opened', { detail: { id: item.id, style: state.style } } ) );
        announce( els.title.textContent + '. ' + els.counter.getAttribute( 'aria-label' ) );
        return true;
    }

    function resumeOpen( pending ) {
        if ( !pending ) {
            return;
        }
        resumeContext = pending;
        if ( typeof window.openModal === 'function' ) {
            window.openModal( pending.id );
        } else {
            viewerOpen( pending.id );
        }
        resumeContext = null;
    }

    function viewerClose( fromHistory ) {
        pendingData = null;
        pendingConsent = null;
        if ( !state.open ) {
            return;
        }
        state.open = false;
        state.holding = false;
        state.swipe = null;
        state.pointers.clear();
        if ( zoom ) {
            zoom.reset( false );
        }
        root.classList.remove( 'mba-pro-viewer-open' );
        wake( false );
        root.hidden = true;
        root.setAttribute( 'aria-hidden', 'true' );
        unlockBackground();
        if ( state.opener && state.opener.isConnected && !root.contains( state.opener ) && visibleFocus( state.opener ) ) {
            focus( state.opener );
        } else {
            var fallback = Array.prototype.find.call( document.querySelectorAll( '.medbeafgallery-container [tabindex="0"], .medbeafgallery-container button:not([disabled]), .mba-pro-carousel button:not([disabled])' ), visibleFocus );
            focus( fallback );
        }
        state.opener = null;
        var consume = state.pushedHistory && fromHistory !== true;
        state.pushedHistory = false;
        if ( consume ) {
            // Queue a very fast reopen until this asynchronous Back has completed.
            waitingHistory = true;
            try {
                history.back();
            } catch ( error ) {
                waitingHistory = false;
            }
        }
        document.dispatchEvent( new CustomEvent( 'mba-pro-viewer:closed', { detail: { id: state.item.id } } ) );
    }

    function rememberStyle( element, properties ) {
        return properties.map( function ( property ) {
            return { element: element, property: property, value: element.style.getPropertyValue( property ), priority: element.style.getPropertyPriority( property ) };
        } );
    }

    function restoreStyles( records ) {
        records.forEach( function ( record ) {
            if ( record.value ) {
                record.element.style.setProperty( record.property, record.value, record.priority );
            } else {
                record.element.style.removeProperty( record.property );
            }
        } );
    }

    function isolate( element ) {
        if ( element.nodeType !== 1 || element === root || element.id === 'medbeafgallery-consent-overlay' || /^(SCRIPT|STYLE|LINK)$/.test( element.tagName ) ) {
            return;
        }
        if ( savedBackground.some( function ( record ) { return record.element === element; } ) ) {
            return;
        }
        savedBackground.push( { element: element, inert: element.getAttribute( 'inert' ), aria: element.getAttribute( 'aria-hidden' ) } );
        element.setAttribute( 'inert', '' );
        element.setAttribute( 'aria-hidden', 'true' );
    }

    function lockBackground() {
        var body = document.body;
        var html = document.documentElement;
        var gap = Math.max( 0, window.innerWidth - html.clientWidth );
        var padding = parseFloat( window.getComputedStyle( body ).paddingRight ) || 0;
        savedScroll = {
            x: window.pageXOffset, y: window.pageYOffset,
            styles: rememberStyle( body, [ 'position', 'top', 'left', 'right', 'width', 'overflow', 'padding-right' ] ).concat( rememberStyle( html, [ 'overflow', 'scroll-behavior' ] ) )
        };
        css( body, 'position', 'fixed' );
        css( body, 'top', -savedScroll.y + 'px' );
        css( body, 'left', '0' );
        css( body, 'right', '0' );
        css( body, 'width', '100%' );
        css( body, 'overflow', 'hidden' );
        css( body, 'padding-right', padding + gap + 'px' );
        css( html, 'overflow', 'hidden' );
        Array.prototype.forEach.call( body.children, isolate );
        if ( typeof MutationObserver !== 'undefined' ) {
            inertObserver = new MutationObserver( function ( records ) {
                records.forEach( function ( record ) { Array.prototype.forEach.call( record.addedNodes, isolate ); } );
            } );
            inertObserver.observe( body, { childList: true } );
        }
    }

    function unlockBackground() {
        if ( inertObserver ) {
            inertObserver.disconnect();
            inertObserver = null;
        }
        savedBackground.forEach( function ( record ) {
            [ [ 'inert', record.inert ], [ 'aria-hidden', record.aria ] ].forEach( function ( pair ) {
                if ( pair[1] === null ) {
                    record.element.removeAttribute( pair[0] );
                } else {
                    record.element.setAttribute( pair[0], pair[1] );
                }
            } );
        } );
        savedBackground = [];
        if ( savedScroll ) {
            var scroll = savedScroll;
            savedScroll = null;
            restoreStyles( scroll.styles );
            var html = document.documentElement;
            var behavior = rememberStyle( html, [ 'scroll-behavior' ] );
            css( html, 'scroll-behavior', 'auto' );
            window.scrollTo( scroll.x, scroll.y );
            restoreStyles( behavior );
        }
    }

    function initialMode( style ) {
        if ( style === 'phone' ) {
            return 'after';
        }
        // The comparison desk exists to show both photos side by side; a site
        // default of "Before only" would leave it with one empty-looking pane.
        if ( style === 'desk' ) {
            return 'both';
        }
        return [ 'split', 'before', 'after', 'both' ].indexOf( config.defaultViewMode ) !== -1 ? config.defaultViewMode : ( style === 'desk' ? 'both' : 'split' );
    }

    function sheetStyle() {
        return state.style === 'cinema' || state.style === 'phone';
    }

    function applyStyle( style ) {
        [ 'cinema', 'drawer', 'desk', 'story', 'phone' ].forEach( function ( name ) {
            root.classList.toggle( 'mba-pro-viewer--' + name, name === style );
        } );
        state.style = style;
        root.classList.toggle( 'mba-pro-viewer-expanded', state.expanded );
        updateAppearance();
        hidden( els.expand, style !== 'drawer' || !phoneQuery.matches );
        hidden( els.progress, style !== 'phone' );
        hidden( els.phoneModesButton, style !== 'phone' );
        hidden( els.closeDetails, !sheetStyle() );
        els.help.textContent = t( 'keyboardHelp' ) + ( style === 'phone' ? ' ' + t( 'phoneHelp' ) : '' );
        els.details.setAttribute( 'role', sheetStyle() ? 'dialog' : 'region' );
        if ( sheetStyle() ) {
            els.details.setAttribute( 'aria-modal', 'true' );
        } else {
            els.details.removeAttribute( 'aria-modal' );
        }
        arrange( style );
        wake( false );
        updateSheets();
    }

    function place( parent, children ) {
        children.forEach( function ( child ) { parent.appendChild( child ); } );
    }

    /**
     * Each control exists once; each style places it where that design wants
     * it, so ids, labels and handlers never get duplicated.
     */
    function arrange( style ) {
        var overStage = style === 'cinema' || style === 'phone';
        els.modes.classList.toggle( 'mba-pro-viewer-glass', overStage );
        if ( style === 'cinema' ) {
            // Slim header with case navigation; a dock carries everything else.
            els.headerActions.insertBefore( els.caseNav, els.expand );
            place( els.main, [ els.stage, els.caption ] );
            els.footer.insertBefore( els.timeline, els.footerStart );
            place( els.footerStart, [ els.views ] );
            place( els.footerMiddle, [ els.toolbar ] );
        } else if ( style === 'phone' ) {
            // The timeline sits in the details sheet; progress bars cover it over the photo.
            place( els.main, [ els.stage, els.toolbar, els.caption, els.views ] );
            els.detailsTimeline.appendChild( els.timeline );
            place( els.footerStart, [ els.caseNav ] );
        } else if ( style === 'desk' ) {
            // The progress timeline right under the photo, so choosing a stage
            // changes something the visitor can see (fitStageToTimeline()).
            place( els.main, [ els.toolbar, els.stage, els.timeline, els.caption, els.views ] );
            place( els.footerStart, [ els.caseNav ] );
        } else {
            // Drawer and Case story: photo first, the comparison pill under it,
            // then the progress timeline (see the desk note above).
            place( els.main, [ els.stage, els.toolbar, els.timeline, els.caption, els.views ] );
            place( els.footerStart, [ els.caseNav ] );
        }
        ( style === 'desk' ? els.lensControls : els.stageTools ).appendChild( els.info );
        // Cinema's body is its own stacking context (z-index 1), so its details
        // sheet (z 8) could never rise above a shade outside it: the shade then
        // covered the sheet, greyed it out and swallowed its scrolling. Keep the
        // shade beside the sheet there; elsewhere it dims the whole dialog.
        if ( style === 'cinema' ) {
            els.body.insertBefore( els.sheetShade, els.details );
        } else if ( els.sheetShade.parentNode !== els.dialog ) {
            els.dialog.insertBefore( els.sheetShade, els.tourPanel );
        }
    }

    function updateAppearance() {
        if ( !root ) {
            return;
        }
        var dark = state.style === 'cinema' || config.darkMode === 'on' || ( config.darkMode === 'auto' && darkQuery.matches );
        root.classList.toggle( 'mba-pro-viewer-dark', dark );
        var connection = navigator.connection || {};
        var lowEffects = motionQuery.matches || transparencyQuery.matches || connection.saveData || /(^|slow-)2g$/.test( connection.effectiveType || '' ) ||
            ( navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2 ) || ( navigator.deviceMemory && navigator.deviceMemory <= 2 );
        root.classList.toggle( 'mba-pro-viewer-low-effects', !!lowEffects );
        if ( state.open && state.views.length ) {
            paintAmbience();
        }
    }

    function categories( item ) {
        if ( Array.isArray( item.categories ) && item.categories.length ) {
            return item.categories.map( function ( category ) { return text( category && category.name ); } ).filter( Boolean );
        }
        var names = item.categoryNames || item.category_names;
        return Array.isArray( names ) ? names.map( text ).filter( Boolean ) : [ text( item.categoryName || item.category ) ].filter( Boolean );
    }

    function facts( item ) {
        var enabled = Array.isArray( config.enabledDetails ) ? config.enabledDetails : null;
        var definitions = Array.isArray( config.proFilterDefs ) ? config.proFilterDefs : [];
        var rows = [];
        [ 'category', 'gender', 'age', 'recovery', 'duration', 'results', 'procedure' ].forEach( function ( key ) {
            if ( ( enabled && enabled.indexOf( key ) === -1 ) || ( key === 'category' && flag( config.hideCaseCategory, false ) ) ) {
                return;
            }
            var value = key === 'category' ? categories( item ).join( ', ' ) : text( item[ key ] );
            var definition = definitions.find( function ( entry ) { return entry && entry.name === key; } );
            if ( value ) {
                rows.push( { key: key, label: definition ? text( definition.label ) || t( key ) : t( key ), value: value } );
            }
        } );
        definitions.forEach( function ( definition ) {
            if ( !definition || !definition.name || flag( definition.standard, false ) || [ 'category', 'gender', 'age', 'recovery', 'duration', 'results', 'procedure' ].indexOf( definition.name ) !== -1 ) {
                return;
            }
            var value = text( item.proFilters && item.proFilters[ definition.name ] );
            if ( value ) {
                rows.push( { key: definition.name, label: text( definition.label ) || text( definition.name ), value: value } );
            }
        } );
        return rows;
    }

    function section( title ) {
        var element = node( 'section', 'mba-pro-viewer-section' );
        element.appendChild( node( 'h3', 'mba-pro-viewer-section-title', title ) );
        return element;
    }

    function appendDescription( parent, html ) {
        // Keep useful post formatting but never execute scripts, embeds, forms,
        // event attributes, styles or custom controls supplied through post HTML.
        var template = document.createElement( 'template' );
        template.innerHTML = typeof html === 'string' ? html : '';
        var allowed = [ 'P', 'BR', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'DEL', 'INS', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'A', 'SPAN', 'DIV', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'HR', 'IMG', 'DL', 'DT', 'DD', 'SUP', 'SUB', 'CODE', 'PRE', 'TIME' ];
        var discard = [ 'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT' ];
        function copy( source, target ) {
            Array.prototype.forEach.call( source.childNodes, function ( child ) {
                if ( child.nodeType === 3 ) {
                    target.appendChild( document.createTextNode( child.nodeValue ) );
                    return;
                }
                if ( child.nodeType !== 1 || discard.indexOf( child.tagName ) !== -1 ) {
                    return;
                }
                if ( allowed.indexOf( child.tagName ) === -1 ) {
                    copy( child, target );
                    return;
                }
                var clean = node( child.tagName.toLowerCase() );
                if ( child.title ) {
                    clean.title = child.title;
                }
                if ( child.tagName === 'A' ) {
                    var href = url( child.getAttribute( 'href' ), true );
                    if ( href ) {
                        clean.setAttribute( 'href', href );
                        if ( child.getAttribute( 'target' ) === '_blank' ) {
                            clean.target = '_blank';
                            clean.rel = 'noopener noreferrer';
                        }
                    }
                }
                if ( child.tagName === 'IMG' ) {
                    var src = url( child.getAttribute( 'src' ) );
                    if ( !src ) {
                        return;
                    }
                    clean.src = src;
                    clean.alt = child.getAttribute( 'alt' ) || '';
                    clean.loading = 'lazy';
                    clean.draggable = !flag( config.imageProtection, false );
                }
                if ( child.tagName === 'TD' || child.tagName === 'TH' ) {
                    [ 'colspan', 'rowspan' ].forEach( function ( attribute ) {
                        var size = Number( child.getAttribute( attribute ) );
                        if ( size >= 1 && size <= 20 ) {
                            clean.setAttribute( attribute, String( Math.floor( size ) ) );
                        }
                    } );
                }
                if ( child.tagName === 'OL' && /^\d{1,4}$/.test( child.getAttribute( 'start' ) || '' ) ) {
                    clean.setAttribute( 'start', child.getAttribute( 'start' ) );
                }
                copy( child, clean );
                target.appendChild( clean );
            } );
        }
        copy( template.content, parent );
    }

    var FACT_ICONS = { category: 'tag', gender: 'user', age: 'calendar', recovery: 'pulse', duration: 'clock', results: 'sparkle', procedure: 'clipboard' };

    function renderCase() {
        var item = state.item;
        root.dataset.caseId = String( item.id );
        var title = text( item.title ) || t( 'untitled' );
        els.title.textContent = flag( config.hideCaseTitle, false ) ? t( 'caseDetails' ) : title;
        els.eyebrow.textContent = categories( item ).join( ' · ' );
        hidden( els.eyebrow, flag( config.hideCaseCategory, false ) || !els.eyebrow.textContent );
        var index = Math.max( 0, caseIndex() );
        els.counter.textContent = '';
        els.counter.appendChild( node( 'span', 'mba-pro-viewer-case-current', String( index + 1 ) ) );
        els.counter.appendChild( document.createTextNode( ' / ' + state.list.length ) );
        els.counter.setAttribute( 'aria-label', format( t( 'caseCounter' ), index + 1, state.list.length ) );
        var single = state.list.length < 2;
        [ els.previousCase, els.nextCase ].forEach( function ( element ) { element.disabled = single; } );
        hidden( els.caseNav, single );
        els.detailsContent.textContent = '';
        var parts = {};
        var hideDetails = flag( config.hideCaseDetails, false );
        if ( !hideDetails ) {
            var rows = facts( item );
            if ( rows.length ) {
                parts.overview = section( t( 'overview' ) );
                var grid = node( 'dl', 'mba-pro-viewer-facts' );
                rows.forEach( function ( row ) {
                    var tile = node( 'div', 'mba-pro-viewer-fact' );
                    tile.dataset.fact = row.key;
                    var term = node( 'dt', '' );
                    var badge = node( 'span', 'mba-pro-viewer-fact-icon' );
                    badge.appendChild( icon( FACT_ICONS[ row.key ] || 'dot' ) );
                    term.appendChild( badge );
                    term.appendChild( document.createTextNode( row.label ) );
                    tile.appendChild( term );
                    tile.appendChild( node( 'dd', '', row.value ) );
                    grid.appendChild( tile );
                } );
                parts.overview.appendChild( grid );
            }
            if ( typeof ( item.description || item.content ) === 'string' && ( item.description || item.content ).trim() ) {
                parts.about = section( t( 'about' ) );
                var description = node( 'div', 'mba-pro-viewer-description' );
                appendDescription( description, item.description || item.content );
                parts.about.appendChild( description );
            }
            parts.doctor = renderDoctors( item );
        }
        if ( sheetStyle() && !hideDetails && !flag( config.hideCaseTitle, false ) ) {
            els.detailsContent.appendChild( node( 'h3', 'mba-pro-viewer-detail-case-title', title ) );
        }
        // Case story tells the case in order; the side panels lead with the doctor.
        // Its progress timeline stays under the photo (arrange()): down here,
        // a stage change happened to a photo scrolled out of view.
        var order = state.style === 'story' ? [ 'overview', 'doctor', 'about' ] : [ 'doctor', 'overview', 'about' ];
        order.forEach( function ( key ) {
            if ( parts[ key ] ) {
                els.detailsContent.appendChild( parts[ key ] );
            }
        } );
        els.cta.textContent = '';
        var ctaUrl = url( config.ctaButtonLink, true );
        if ( flag( config.showCtaButton, false ) && ctaUrl ) {
            var cta = node( 'a', 'mba-pro-viewer-button mba-pro-viewer-primary' );
            cta.appendChild( node( 'span', 'mba-pro-viewer-button-label', text( config.ctaButtonText ) || t( 'cta' ) ) );
            cta.appendChild( icon( 'arrow' ) );
            cta.href = ctaUrl;
            openInNewTab( cta );
            els.cta.appendChild( cta );
        }
        hidden( els.cta, !els.cta.childNodes.length );
        hidden( els.detailsContent, !els.detailsContent.childNodes.length );
        hidden( els.teaser, state.style !== 'story' || single );
        els.teaser.textContent = '';
        if ( !single ) {
            var next = state.list[ ( index + 1 ) % state.list.length ];
            var teaserText = node( 'span', 'mba-pro-viewer-teaser-text' );
            teaserText.appendChild( node( 'span', 'mba-pro-viewer-teaser-label', t( 'nextCase' ) ) );
            if ( !flag( config.hideCaseTitle, false ) ) {
                teaserText.appendChild( node( 'span', 'mba-pro-viewer-teaser-title', text( next.title ) || t( 'untitled' ) ) );
            }
            var arrow = node( 'span', 'mba-pro-viewer-teaser-arrow' );
            arrow.appendChild( icon( 'arrow' ) );
            els.teaser.appendChild( teaserText );
            els.teaser.appendChild( arrow );
        }
        buildViewSelectors();
        renderShareLinks();
        updateSheets();
        scheduleStageFit();
    }

    function initials( name ) {
        var words = name.replace( /^(dr|prof|mr|mrs|ms)\.?\s+/i, '' ).split( /\s+/ ).filter( Boolean );
        return words.slice( 0, 2 ).map( function ( word ) { return word.charAt( 0 ).toUpperCase(); } ).join( '' );
    }

    function renderDoctors( item ) {
        if ( !flag( options.show_doctor, true ) ) {
            return null;
        }
        var doctors = ( Array.isArray( item.doctors ) ? item.doctors : [] ).slice();
        if ( item.doctor && typeof item.doctor === 'object' ) {
            doctors.unshift( item.doctor );
        }
        var seen = new Set();
        doctors = doctors.filter( function ( doctor ) {
            if ( !doctor || !text( doctor.name ) ) {
                return false;
            }
            var key = doctor.id || doctor.slug || ( text( doctor.name ) + '|' + text( doctor.url ) );
            if ( seen.has( String( key ) ) ) {
                return false;
            }
            seen.add( String( key ) );
            return true;
        } );
        if ( !doctors.length ) {
            return null;
        }
        var group = section( t( 'doctor' ) );
        doctors.forEach( function ( doctor ) {
            var card = node( 'article', 'mba-pro-viewer-doctor' );
            var photo = url( doctor.photo );
            if ( photo ) {
                var image = node( 'img', 'mba-pro-viewer-doctor-photo' );
                image.src = photo;
                image.alt = text( doctor.photoAlt ) || text( doctor.name );
                image.width = 64;
                image.height = 64;
                image.decoding = 'async';
                image.draggable = !flag( config.imageProtection, false );
                card.appendChild( image );
            } else {
                var monogram = node( 'span', 'mba-pro-viewer-doctor-initials', initials( text( doctor.name ) ) );
                monogram.setAttribute( 'aria-hidden', 'true' );
                card.appendChild( monogram );
            }
            var info = node( 'div', 'mba-pro-viewer-doctor-info' );
            info.appendChild( node( 'h4', 'mba-pro-viewer-doctor-name', text( doctor.name ) ) );
            [ doctor.credentials, doctor.location ].forEach( function ( value ) {
                if ( text( value ) ) {
                    info.appendChild( node( 'p', '', text( value ) ) );
                }
            } );
            if ( url( doctor.url, true ) ) {
                var link = node( 'a', 'mba-pro-viewer-doctor-link', t( 'doctorLink' ) );
                link.href = url( doctor.url, true );
                openInNewTab( link );
                info.appendChild( link );
            }
            card.appendChild( info );
            group.appendChild( card );
        } );
        return group;
    }

    function displayDate( value ) {
        var parts = value.split( '-' ).map( Number );
        try {
            return new Date( parts[0], parts[1] - 1, parts[2] ).toLocaleDateString( document.documentElement.lang || undefined, { year: 'numeric', month: 'short', day: 'numeric' } );
        } catch ( error ) {
            return value;
        }
    }

    function buildViewSelectors() {
        els.strip.textContent = '';
        els.progress.textContent = '';
        els.timelineTrack.textContent = '';
        var stages = state.views.filter( function ( view ) { return view.type === 'stage'; } );
        // Stages get the timeline; the strip only lists photo pairs, so the two
        // never repeat each other.
        var stripViews = flag( options.show_thumbnails, true ) ? state.views.filter( function ( view ) { return view.type === 'pair' || stages.length < 2; } ) : [];
        state.views.forEach( function ( view, index ) {
            var progress = button( view.label, 'view', 'mba-pro-viewer-progress-stop' );
            progress.textContent = '';
            progress.setAttribute( 'aria-label', format( t( 'viewCounter' ), index + 1, state.views.length ) + ': ' + view.label );
            progress.dataset.view = String( index );
            progress.appendChild( node( 'span', 'mba-pro-viewer-progress-bar' ) );
            els.progress.appendChild( progress );
            if ( stripViews.indexOf( view ) !== -1 ) {
                var thumb = button( view.label, 'view', 'mba-pro-viewer-thumbnail' );
                thumb.textContent = '';
                thumb.dataset.view = String( index );
                thumb.setAttribute( 'aria-label', view.label );
                thumb.title = view.label;
                var images = node( 'span', 'mba-pro-viewer-thumbnail-images' );
                [ view.beforeThumb, view.afterThumb ].filter( Boolean ).forEach( function ( src ) {
                    var image = node( 'img', '' );
                    image.src = src;
                    image.alt = '';
                    image.decoding = 'async';
                    image.draggable = !flag( config.imageProtection, false );
                    images.appendChild( image );
                } );
                thumb.appendChild( images );
                var caption = node( 'span', 'mba-pro-viewer-thumbnail-label', view.label );
                caption.setAttribute( 'aria-hidden', 'true' );
                thumb.appendChild( caption );
                els.strip.appendChild( thumb );
            }
            if ( view.type === 'stage' ) {
                var stop = button( view.label, 'view', 'mba-pro-viewer-timeline-stop' );
                stop.textContent = '';
                stop.dataset.view = String( index );
                var dot = node( 'span', 'mba-pro-viewer-timeline-dot' );
                dot.setAttribute( 'aria-hidden', 'true' );
                stop.appendChild( dot );
                stop.appendChild( node( 'span', 'mba-pro-viewer-timeline-label', view.label ) );
                if ( view.date ) {
                    var date = node( 'time', 'mba-pro-viewer-timeline-meta', displayDate( view.date ) );
                    date.dateTime = view.date;
                    if ( view.elapsed ) {
                        date.title = view.elapsed;
                    }
                    stop.appendChild( date );
                } else if ( view.elapsed ) {
                    stop.appendChild( node( 'span', 'mba-pro-viewer-timeline-meta', view.elapsed ) );
                }
                if ( view.date && view.elapsed ) {
                    stop.appendChild( node( 'span', 'mba-pro-viewer-sr', view.elapsed ) );
                }
                els.timelineTrack.appendChild( stop );
            }
        } );
        els.timeline.style.setProperty( '--mbv-stops', String( Math.max( 1, els.timelineTrack.children.length ) ) );
        hidden( els.strip, state.style === 'phone' || els.strip.children.length < 2 );
        hidden( els.timeline, els.timelineTrack.children.length < 2 );
        hidden( els.viewNav, flag( options.show_thumbnails, true ) || state.style === 'phone' || state.views.length < 2 );
        hidden( els.views, els.strip.hidden && els.viewNav.hidden );
    }

    function setPicture( target, src, alt ) {
        target.image.alt = alt;
        target.image.draggable = !flag( config.imageProtection, false );
        if ( target.image.getAttribute( 'src' ) !== src ) {
            target.pane.dataset.loaded = 'false';
            target.pane.dataset.missing = src ? 'false' : 'true';
            if ( src ) {
                target.image.src = src;
                target.loupeImage.src = src;
            } else {
                target.image.removeAttribute( 'src' );
                target.loupeImage.removeAttribute( 'src' );
            }
        }
        if ( src && target.image.complete && target.image.naturalWidth ) {
            target.pane.dataset.loaded = 'true';
            target.pane.dataset.missing = 'false';
        }
    }

    function renderView() {
        if ( zoom ) {
            zoom.reset( false );
        }
        state.holding = false;
        state.lens.visible = false;
        state.tour = -1;
        state.tourMode = null;
        state.tourOpener = null;
        hidden( els.tourPanel, true );
        els.tourButton.setAttribute( 'aria-expanded', 'false' );
        var view = state.views[ state.view ];
        setPicture( els.before, view.before, view.beforeAlt );
        setPicture( els.after, view.after, view.afterAlt );
        els.before.label.textContent = beforeLabel();
        els.after.label.textContent = view.type === 'stage' ? view.label : afterLabel();
        els.viewLabel.textContent = view.label;
        els.viewLabel.title = format( t( 'viewCounter' ), state.view + 1, state.views.length );
        // The timeline already names the stage and its date; only the owner's note is added.
        els.caption.textContent = '';
        if ( view.note ) {
            els.caption.appendChild( node( 'p', 'mba-pro-viewer-stage-note', view.note ) );
        }
        hidden( els.caption, !els.caption.childNodes.length );
        var atEnd = state.view === state.views.length - 1;
        root.classList.toggle( 'mba-pro-viewer-at-end', atEnd );
        // Phone Story: tapping past the last view moves on to the next case.
        var caseEdges = state.style === 'phone' && state.list.length > 1;
        setLabel( els.edgeNext, caseEdges && atEnd ? t( 'nextCase' ) : t( 'nextView' ) );
        setLabel( els.edgePrevious, caseEdges && state.view === 0 ? t( 'previousCase' ) : t( 'previousView' ) );
        state.markers = markersForView( view );
        renderMarkers();
        renderMode();
        if ( zoom && !zoom.isZoomed() ) {
            els.zoomValue.textContent = '1×';
            els.zoomOut.disabled = true;
            els.zoomReset.disabled = true;
            els.zoomIn.disabled = false;
        }
        root.querySelectorAll( '[data-action="view"]' ).forEach( function ( element ) {
            var position = Number( element.dataset.view );
            var active = position === state.view;
            element.setAttribute( 'aria-pressed', String( active ) );
            element.classList.toggle( 'mba-pro-viewer-past', position < state.view );
            if ( active ) {
                element.setAttribute( 'aria-current', 'step' );
            } else {
                element.removeAttribute( 'aria-current' );
            }
        } );
        var stops = Array.prototype.slice.call( els.timelineTrack.children );
        var selected = stops.find( function ( stop ) { return Number( stop.dataset.view ) === state.view; } ) || stops[0];
        stops.forEach( function ( stop ) { stop.tabIndex = stop === selected ? 0 : -1; } );
        var stopIndex = stops.indexOf( stops.find( function ( stop ) { return Number( stop.dataset.view ) === state.view; } ) );
        els.timeline.style.setProperty( '--mbv-progress', stops.length > 1 && stopIndex > 0 ? String( stopIndex / ( stops.length - 1 ) ) : '0' );
        [ els.strip, els.progress, els.timelineScroll ].forEach( function ( track ) {
            var activeThumb = track.querySelector( '[aria-current="step"]' );
            if ( !activeThumb || !track.clientWidth ) {
                return;
            }
            // Scroll only this track; scrollIntoView() could also move the page.
            var thumbLeft = activeThumb.offsetLeft;
            if ( thumbLeft < track.scrollLeft || thumbLeft + activeThumb.offsetWidth > track.scrollLeft + track.clientWidth ) {
                track.scrollLeft = Math.max( 0, thumbLeft - track.clientWidth / 2 + activeThumb.offsetWidth / 2 );
            }
        } );
        updateSheets();
        scheduleGeometry();
        preloadViews();
    }

    function displayedMode() {
        var view = state.views[ state.view ];
        if ( view.type === 'stage' ) {
            return 'stage';
        }
        if ( !view.before ) {
            return 'after';
        }
        if ( !view.after ) {
            return 'before';
        }
        return state.holding ? 'before' : ( state.style === 'phone' && state.mode === 'both' ? 'split' : state.mode );
    }

    function renderMode() {
        var view = state.views[ state.view ];
        var mode = displayedMode();
        root.dataset.mode = mode;
        els.canvas.dataset.mode = mode;
        root.classList.toggle( 'mba-pro-viewer-labels-off', !flag( config.showLabels, true ) );
        hidden( els.modes, view.type === 'stage' );
        els.modes.querySelectorAll( '[data-mode]' ).forEach( function ( element ) {
            var value = element.dataset.mode;
            element.setAttribute( 'aria-pressed', String( value === mode ) );
            element.disabled = ( value !== 'after' && !view.before ) || ( value !== 'before' && !view.after );
            hidden( element, state.style === 'phone' && value === 'both' );
        } );
        hidden( els.divider, mode !== 'split' );
        updateSplit( state.split );
        [ els.before, els.after ].forEach( function ( target ) {
            var visible = target === els.before ? [ 'split', 'both', 'before' ].indexOf( mode ) !== -1 : mode !== 'before';
            target.pane.setAttribute( 'aria-hidden', String( !visible ) );
            target.pane.tabIndex = visible && state.style === 'desk' ? 0 : -1;
            if ( state.style === 'desk' ) {
                target.pane.setAttribute( 'role', 'group' );
                target.pane.setAttribute( 'aria-label', target === els.before ? beforeLabel() : ( view.type === 'stage' ? view.label : afterLabel() ) );
                target.pane.setAttribute( 'aria-describedby', 'mba-pro-viewer-lens-help mba-pro-viewer-alignment-note' );
            } else {
                target.pane.removeAttribute( 'role' );
                target.pane.removeAttribute( 'aria-label' );
                target.pane.removeAttribute( 'aria-describedby' );
            }
        } );
        var singleZoom = zoomEnabled() && !!zoom;
        var desk = state.style === 'desk';
        hidden( els.zoomControls, !singleZoom );
        hidden( els.lensControls, !desk );
        hidden( els.alignment, !desk );
        hidden( els.lensHelp, !desk );
        hidden( els.info, !singleZoom && !desk );
        if ( els.info.hidden ) {
            setInfo( false );
        }
        hidden( els.stageTools, !singleZoom && ( desk || els.info.hidden ) );
        hidden( els.toolbar, els.modes.hidden && !desk );
        var phonePair = state.style === 'phone' && view.type === 'pair' && !!view.before && !!view.after;
        hidden( els.beforeToggle, !phonePair );
        hidden( els.holdHint, !phonePair || mode === 'split' || mode === 'before' );
        var tapZones = state.style !== 'phone' || mode === 'split' || ( state.views.length < 2 && state.list.length < 2 );
        hidden( els.edgePrevious, tapZones );
        hidden( els.edgeNext, tapZones );
        hidden( els.phoneModesButton, state.style !== 'phone' || view.type !== 'pair' );
        els.beforeToggle.setAttribute( 'aria-pressed', String( mode === 'before' ) );
        setLabel( els.beforeToggle, mode === 'before' ? t( 'showAfter' ) : t( 'showBefore' ) );
        paintAmbience();
        scheduleGeometry();
    }

    function paintAmbience() {
        var mode = displayedMode();
        var view = state.views[ state.view ];
        var src = mode === 'before' ? view.before : ( view.after || view.before );
        if ( state.style === 'cinema' && !root.classList.contains( 'mba-pro-viewer-low-effects' ) && src ) {
            if ( els.ambience.getAttribute( 'src' ) !== src ) {
                els.ambience.src = src;
            }
        } else {
            els.ambience.removeAttribute( 'src' );
        }
    }

    function zoomEnabled() {
        if ( !state.open || ( state.style !== 'cinema' && state.style !== 'drawer' ) ) {
            return false;
        }
        var mode = displayedMode();
        var view = state.views[ state.view ];
        return ( mode === 'before' && !!view.before ) || ( ( mode === 'after' || mode === 'stage' ) && !!view.after );
    }

    function setMode( mode ) {
        if ( [ 'split', 'before', 'after', 'both' ].indexOf( mode ) === -1 ) {
            return;
        }
        if ( zoom ) {
            zoom.reset( false );
        }
        finishTour( false );
        state.holding = false;
        state.mode = state.style === 'phone' && mode === 'both' ? 'split' : mode;
        renderMode();
    }

    function updateSplit( value ) {
        state.split = Math.max( 0, Math.min( 100, value ) );
        root.style.setProperty( '--mba-viewer-split', state.split + '%' );
        var width = els.canvas.clientWidth;
        var point = width * state.split / 100;
        var handleLeft = Math.max( 0, Math.min( width - 44, point - 22 ) );
        root.style.setProperty( '--mba-viewer-divider-line', ( width ? point - handleLeft : 21 ) + 'px' );
        els.divider.setAttribute( 'aria-valuenow', String( Math.round( state.split ) ) );
        els.divider.setAttribute( 'aria-valuetext', format( t( 'dividerValue' ), Math.round( state.split ) ) );
        // Split markers remain reachable in the equivalent list even when clipped.
        state.markers.forEach( function ( marker ) {
            if ( marker.element ) {
                var clipped = displayedMode() === 'split' && ( marker.side === 'before' ? marker.x > state.split : marker.x < state.split );
                marker.element.tabIndex = clipped ? -1 : 0;
                marker.element.setAttribute( 'aria-hidden', String( clipped ) );
            }
        } );
    }

    function navigateView( delta ) {
        selectView( ( state.view + delta + state.views.length ) % state.views.length );
    }

    function selectView( index ) {
        if ( !Number.isInteger( index ) || index < 0 || index >= state.views.length || index === state.view ) {
            return;
        }
        var wasInTour = els.tourPanel.contains( document.activeElement );
        finishTour( false );
        state.view = index;
        renderView();
        if ( wasInTour || !root.contains( document.activeElement ) || !visibleFocus( document.activeElement ) ) {
            focus( els.stage );
        }
        announce( state.views[ index ].label + '. ' + format( t( 'viewCounter' ), index + 1, state.views.length ) );
    }

    function navigateCase( delta ) {
        if ( state.list.length < 2 ) {
            return;
        }
        var index = Math.max( 0, caseIndex() );
        var target = state.list[ ( index + delta + state.list.length ) % state.list.length ];
        // Includes any deep-link or integration wrapper installed after this module.
        if ( typeof window.openModal === 'function' ) {
            window.openModal( target.id );
        } else {
            viewerOpen( target.id );
        }
    }

    function updateSheets() {
        var sheet = sheetStyle();
        hidden( els.details, sheet && !state.details );
        hidden( els.sheetShade, !sheet || !state.details );
        hidden( els.sharePanel, !state.share || !flag( options.show_share, true ) );
        root.classList.toggle( 'mba-pro-viewer-details-open', sheet && state.details );
        els.detailsButton.setAttribute( 'aria-expanded', String( sheet && state.details ) );
        els.shareButton.setAttribute( 'aria-expanded', String( state.share ) );
        hidden( els.shareButton, !flag( options.show_share, true ) );
        var hasDetails = els.detailsContent.childNodes.length || els.cta.childNodes.length || state.markers.length || ( state.style === 'phone' && !els.timeline.hidden );
        hidden( els.detailsButton, !sheet || !hasDetails );
        hidden( els.footer, state.style !== 'phone' && !Array.prototype.some.call( els.footer.children, function ( element ) { return !element.hidden; } ) );
    }

    function setDetails( value, returnFocus ) {
        if ( value ) {
            state.sheetOpener = document.activeElement;
            setShare( false, false );
            finishTour( false );
        }
        state.details = value;
        updateSheets();
        if ( value && sheetStyle() ) {
            focus( els.closeDetails );
        } else if ( returnFocus !== false ) {
            focus( state.sheetOpener && state.sheetOpener.isConnected ? state.sheetOpener : els.detailsButton );
        }
    }

    function setShare( value, returnFocus ) {
        if ( value ) {
            if ( state.details && sheetStyle() ) {
                setDetails( false, false );
            }
            finishTour( false );
            renderShareLinks();
        }
        state.share = value;
        updateSheets();
        if ( value ) {
            focus( els.copy );
        } else if ( returnFocus !== false ) {
            focus( els.shareButton );
        }
    }

    function markersForView( view ) {
        var annotations = state.item.annotations;
        if ( !annotations || typeof annotations !== 'object' ) {
            annotations = {};
        }
        var sides = view.type === 'pair' ? annotations[ view.index ] : null;
        if ( view.type === 'stage' ) {
            // Pair annotations have a documented schema. Future stage annotations
            // are optional; also reuse a side's notes if its exact display URL is
            // the stage photo. Never borrow notes merely by matching an index.
            var stageNotes = view.annotations || ( annotations.timeline && annotations.timeline[ view.index ] ) || ( annotations.stages && annotations.stages[ view.index ] );
            if ( stageNotes ) {
                sides = { after: Array.isArray( stageNotes ) ? stageNotes : ( stageNotes.markers || stageNotes.after || [] ) };
            } else {
                state.views.filter( function ( entry ) { return entry.type === 'pair'; } ).some( function ( pair ) {
                    var source = annotations[ pair.index ];
                    if ( !source ) {
                        return false;
                    }
                    if ( pair.before === view.after && Array.isArray( source.before ) ) {
                        sides = { after: source.before };
                        return true;
                    }
                    if ( pair.after === view.after && Array.isArray( source.after ) ) {
                        sides = { after: source.after };
                        return true;
                    }
                    return false;
                } );
            }
        }
        var markers = [];
        [ 'before', 'after' ].forEach( function ( side ) {
            if ( !sides || !Array.isArray( sides[ side ] ) || !view[ side ] ) {
                return;
            }
            sides[ side ].slice( 0, 30 ).forEach( function ( marker ) {
                if ( !marker || !text( marker.title ) || !Number.isFinite( Number( marker.x ) ) || !Number.isFinite( Number( marker.y ) ) ) {
                    return;
                }
                markers.push( {
                    side: side, x: Math.max( 0, Math.min( 100, Number( marker.x ) ) ), y: Math.max( 0, Math.min( 100, Number( marker.y ) ) ),
                    title: text( marker.title ), note: text( marker.note ), element: null
                } );
            } );
        } );
        return markers;
    }

    function renderMarkers() {
        els.before.pins.textContent = '';
        els.after.pins.textContent = '';
        els.notesList.textContent = '';
        els.notes.open = false;
        state.markers.forEach( function ( marker, index ) {
            var sideLabel = state.views[ state.view ].type === 'stage' ? state.views[ state.view ].label : ( marker.side === 'before' ? beforeLabel() : afterLabel() );
            var pin = button( format( t( 'marker' ), index + 1, marker.title, sideLabel ), 'marker', 'mba-pro-viewer-marker', String( index + 1 ) );
            pin.dataset.marker = String( index );
            pin.setAttribute( 'aria-controls', 'mba-pro-viewer-tour' );
            pin.setAttribute( 'aria-pressed', 'false' );
            marker.element = pin;
            els[ marker.side ].pins.appendChild( pin );
            var row = node( 'li', '' );
            row.appendChild( node( 'strong', '', marker.title + ' — ' + sideLabel ) );
            if ( marker.note ) {
                row.appendChild( node( 'p', '', marker.note ) );
            }
            els.notesList.appendChild( row );
        } );
        hidden( els.notes, !state.markers.length );
        hidden( els.tourButton, !state.markers.length || !flag( options.show_tour, true ) );
    }

    function startTour( index, moveFocus ) {
        if ( !state.markers[ index ] ) {
            return;
        }
        if ( state.tour < 0 ) {
            state.tourMode = state.mode;
            state.tourOpener = document.activeElement;
        }
        setShare( false, false );
        if ( state.details && sheetStyle() ) {
            setDetails( false, false );
        }
        if ( zoom ) {
            zoom.reset( false );
        }
        state.tour = index;
        var marker = state.markers[ index ];
        var view = state.views[ state.view ];
        if ( view.type === 'pair' && displayedMode() !== 'both' ) {
            state.mode = marker.side;
            state.holding = false;
        }
        renderMode();
        hidden( els.tourPanel, false );
        els.tourTitle.textContent = marker.title;
        els.tourNote.textContent = marker.note;
        hidden( els.tourNote, !marker.note );
        els.tourCounter.textContent = format( t( 'tourCounter' ), index + 1, state.markers.length );
        els.tourPrevious.disabled = index === 0;
        els.tourNext.disabled = index === state.markers.length - 1;
        hidden( els.tourPrevious, !flag( options.show_tour, true ) );
        hidden( els.tourNext, !flag( options.show_tour, true ) );
        state.markers.forEach( function ( point, number ) {
            point.element.setAttribute( 'aria-pressed', String( number === index ) );
        } );
        els.tourButton.setAttribute( 'aria-expanded', 'true' );
        if ( moveFocus !== false ) {
            focus( els.tourTitle );
        } else if ( document.activeElement.disabled ) {
            focus( els.tourDone );
        }
        announce( marker.title + '. ' + format( t( 'tourCounter' ), index + 1, state.markers.length ) + ( marker.note ? '. ' + marker.note : '' ) );
    }

    function finishTour( returnFocus ) {
        if ( state.tour < 0 ) {
            return;
        }
        state.tour = -1;
        hidden( els.tourPanel, true );
        els.tourButton.setAttribute( 'aria-expanded', 'false' );
        state.markers.forEach( function ( marker ) { marker.element.setAttribute( 'aria-pressed', 'false' ); } );
        if ( state.tourMode ) {
            state.mode = state.tourMode;
            state.tourMode = null;
            renderMode();
        }
        if ( returnFocus !== false ) {
            var opener = state.tourOpener;
            if ( !opener || !opener.isConnected || !opener.getClientRects().length || opener.closest( '[aria-hidden="true"]' ) ) {
                opener = !els.tourButton.hidden ? els.tourButton : els.stage;
            }
            focus( opener );
        }
        state.tourOpener = null;
    }

    function imageBox( target ) {
        var width = target.pane.clientWidth;
        var height = target.pane.clientHeight;
        var naturalWidth = target.image.naturalWidth;
        var naturalHeight = target.image.naturalHeight;
        if ( !width || !height || !naturalWidth || !naturalHeight || target.pane.dataset.loaded !== 'true' ) {
            return null;
        }
        var scale = Math.min( width / naturalWidth, height / naturalHeight );
        var w = naturalWidth * scale;
        var h = naturalHeight * scale;
        return { left: ( width - w ) / 2, top: ( height - h ) / 2, width: w, height: h, paneWidth: width, paneHeight: height };
    }

    /**
     * Drawer, Comparison desk and Case story show the progress timeline under
     * the photo, in a scrolling column. When the two do not fit that column
     * together, the photo gets shorter (to half its height at most, never under
     * 200px), so choosing a stage changes a photo that is in view. Runs after a
     * case renders and when the window changes size — not from the
     * ResizeObserver, which watches the photo this resizes.
     */
    function scheduleStageFit() {
        if ( fitFrame ) {
            window.cancelAnimationFrame( fitFrame );
        }
        fitFrame = window.requestAnimationFrame( function () {
            fitFrame = 0;
            fitStageToTimeline();
        } );
    }

    function fitStageToTimeline() {
        root.classList.remove( 'mba-pro-viewer-stage-fit' );
        root.style.removeProperty( '--mbv-stage-fit' );
        if ( !state.open || els.timeline.hidden || [ 'drawer', 'desk', 'story' ].indexOf( state.style ) < 0 || !els.main.contains( els.timeline ) ) {
            return;
        }
        var scroller = els.timeline.parentElement;
        while ( scroller && scroller !== els.dialog && !( /auto|scroll/.test( window.getComputedStyle( scroller ).overflowY ) && scroller.clientHeight > 0 ) ) {
            scroller = scroller.parentElement;
        }
        if ( !scroller || scroller === els.dialog ) {
            return;
        }
        // Where the timeline ends with the column scrolled to the top, against its visible height.
        var top = scroller.getBoundingClientRect().top + scroller.clientTop - scroller.scrollTop;
        var overflow = els.timeline.getBoundingClientRect().bottom - top - scroller.clientHeight + 8;
        var natural = els.stage.getBoundingClientRect().height;
        if ( overflow <= 0 || !natural ) {
            return;
        }
        var height = Math.floor( Math.max( Math.min( natural, Math.max( 200, natural / 2 ) ), natural - overflow ) );
        if ( height < natural - 1 ) {
            root.style.setProperty( '--mbv-stage-fit', height + 'px' );
            root.classList.add( 'mba-pro-viewer-stage-fit' );
        }
    }

    function scheduleGeometry() {
        if ( geometryFrame ) {
            window.cancelAnimationFrame( geometryFrame );
        }
        geometryFrame = window.requestAnimationFrame( function () {
            geometryFrame = 0;
            if ( !state.open ) {
                return;
            }
            updateSplit( state.split );
            state.markers.forEach( function ( marker ) {
                var box = imageBox( els[ marker.side ] );
                hidden( marker.element, !box );
                if ( box ) {
                    css( marker.element, 'left', box.left + box.width * marker.x / 100 + 'px' );
                    css( marker.element, 'top', box.top + box.height * marker.y / 100 + 'px' );
                }
            } );
            paintLenses();
        } );
    }

    function lensPoint( target, clientX, clientY ) {
        var box = imageBox( target );
        if ( !box ) {
            return;
        }
        var rect = target.pane.getBoundingClientRect();
        state.lens.x = Math.max( 0, Math.min( 1, ( clientX - rect.left - box.left ) / box.width ) );
        state.lens.y = Math.max( 0, Math.min( 1, ( clientY - rect.top - box.top ) / box.height ) );
        state.lens.visible = true;
        paintLenses();
    }

    function paintLenses() {
        [ els.before, els.after ].forEach( function ( target ) {
            var box = imageBox( target );
            var visible = state.style === 'desk' && state.lens.enabled && state.lens.visible && !!box && target.pane.getAttribute( 'aria-hidden' ) !== 'true';
            hidden( target.loupe, !visible );
            if ( !visible ) {
                return;
            }
            var size = Math.min( 150, box.paneWidth - 8, box.paneHeight - 8 );
            var x = box.left + box.width * state.lens.x;
            var y = box.top + box.height * state.lens.y;
            css( target.loupe, 'width', size + 'px' );
            css( target.loupe, 'height', size + 'px' );
            css( target.loupe, 'left', Math.max( 4, Math.min( box.paneWidth - size - 4, x - size / 2 ) ) + 'px' );
            css( target.loupe, 'top', Math.max( 4, Math.min( box.paneHeight - size - 4, y - size / 2 ) ) + 'px' );
            css( target.loupeImage, 'width', box.width * state.lens.scale + 'px' );
            css( target.loupeImage, 'height', box.height * state.lens.scale + 'px' );
            css( target.loupeImage, 'left', size / 2 - box.width * state.lens.scale * state.lens.x + 'px' );
            css( target.loupeImage, 'top', size / 2 - box.height * state.lens.scale * state.lens.y + 'px' );
        } );
    }

    function changeLens( delta ) {
        state.lens.scale = Math.max( 1.5, Math.min( 6, state.lens.scale + delta ) );
        state.lens.visible = true;
        els.lensValue.textContent = state.lens.scale.toFixed( 2 ).replace( /\.?0+$/, '' ) + '×';
        els.lensIn.disabled = state.lens.scale >= 6;
        els.lensOut.disabled = state.lens.scale <= 1.5;
        paintLenses();
    }

    function shareUrl() {
        var shared = new URL( window.location.href );
        if ( flag( config.enableDeeplink, false ) ) {
            shared.searchParams.set( 'mbcase', String( state.item.id ) );
        } else {
            shared.searchParams.delete( 'mbcase' );
        }
        return shared.href;
    }

    function renderShareLinks() {
        var link = shareUrl();
        var title = text( state.item.title ) || t( 'untitled' );
        els.shareLinks.querySelector( '[data-share="email"]' ).href = 'mailto:?subject=' + encodeURIComponent( title ) + '&body=' + encodeURIComponent( title + '\n' + link );
        els.shareLinks.querySelector( '[data-share="facebook"]' ).href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent( link );
        els.shareLinks.querySelector( '[data-share="x"]' ).href = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent( link ) + '&text=' + encodeURIComponent( title );
        hidden( els.nativeShare, typeof navigator.share !== 'function' );
        els.copyInput.value = link;
        hidden( els.copyFallback, true );
        els.shareStatus.textContent = '';
    }

    function copyLink() {
        var link = shareUrl();
        var id = state.item.id;
        function success() {
            if ( state.open && sameId( state.item, id ) ) {
                els.shareStatus.textContent = t( 'copied' );
            }
        }
        function fallback() {
            if ( !state.open || !sameId( state.item, id ) ) {
                return;
            }
            hidden( els.copyFallback, false );
            els.copyInput.value = link;
            focus( els.copyInput );
            els.copyInput.select();
            try {
                if ( document.execCommand( 'copy' ) ) {
                    success();
                    return;
                }
            } catch ( error ) {}
            els.shareStatus.textContent = t( 'copyHelp' );
        }
        if ( navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext ) {
            navigator.clipboard.writeText( link ).then( success, fallback );
        } else {
            fallback();
        }
    }

    function nativeShare() {
        if ( typeof navigator.share !== 'function' ) {
            return;
        }
        var id = state.item.id;
        try {
            Promise.resolve( navigator.share( { title: text( state.item.title ) || t( 'untitled' ), url: shareUrl() } ) ).catch( function ( error ) {
                if ( state.open && sameId( state.item, id ) && ( !error || error.name !== 'AbortError' ) ) {
                    els.shareStatus.textContent = t( 'shareFailed' );
                }
            } );
        } catch ( error ) {
            els.shareStatus.textContent = t( 'shareFailed' );
        }
    }

    function preload( src ) {
        if ( !src || preloaded.has( src ) ) {
            return;
        }
        var image = new Image();
        image.decoding = 'async';
        image.src = src;
        preloaded.set( src, image );
        if ( preloaded.size > 12 ) {
            preloaded.delete( preloaded.keys().next().value );
        }
    }

    function preloadNeighbours() {
        if ( state.list.length < 2 ) {
            return;
        }
        var index = Math.max( 0, caseIndex() );
        [ -1, 1 ].forEach( function ( delta ) {
            var first = makeViews( state.list[ ( index + delta + state.list.length ) % state.list.length ] )[0];
            preload( first.before );
            preload( first.after );
        } );
    }

    function preloadViews() {
        if ( state.views.length < 2 ) {
            return;
        }
        [ -1, 1 ].forEach( function ( delta ) {
            var view = state.views[ ( state.view + delta + state.views.length ) % state.views.length ];
            preload( view.before );
            preload( view.after );
        } );
    }

    function focusables( container ) {
        return Array.prototype.filter.call( container.querySelectorAll( 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])' ), function ( element ) {
            return element.tabIndex >= 0 && element.getClientRects().length && !element.closest( '[hidden], [inert], [aria-hidden="true"]' );
        } );
    }

    function visibleFocus( element ) {
        return !!element && element.nodeType === 1 && element.getClientRects().length > 0 && !element.closest( '[hidden], [inert], [aria-hidden="true"]' );
    }

    function focusScope() {
        if ( state.details && sheetStyle() ) {
            return els.details;
        }
        if ( state.share ) {
            return els.sharePanel;
        }
        return els.dialog;
    }

    function handleKey( event ) {
        if ( !state.open || consentShowing() ) {
            return;
        }
        var target = event.target;
        // Keyboard users always see Cinema's controls.
        wake( false );
        if ( event.key === 'Escape' ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if ( els.infoPanel && !els.infoPanel.hidden ) {
                setInfo( false );
                focus( els.infoButton );
            } else if ( state.share ) {
                setShare( false );
            } else if ( state.details && sheetStyle() ) {
                setDetails( false );
            } else if ( state.tour >= 0 ) {
                finishTour( true );
            } else if ( root.classList.contains( 'mba-pro-viewer-modes-open' ) ) {
                root.classList.remove( 'mba-pro-viewer-modes-open' );
                els.phoneModesButton.setAttribute( 'aria-expanded', 'false' );
                focus( els.phoneModesButton );
            } else {
                viewerClose();
            }
            return;
        }
        if ( event.key === 'Tab' ) {
            var scope = focusScope();
            var elements = focusables( scope );
            var first = elements[0];
            var last = elements[ elements.length - 1 ];
            var active = document.activeElement;
            if ( !elements.length ) {
                event.preventDefault();
                focus( els.dialog );
            } else if ( !scope.contains( active ) ) {
                event.preventDefault();
                focus( event.shiftKey ? last : first );
            } else if ( event.shiftKey && ( active === first || elements.indexOf( active ) === -1 ) ) {
                event.preventDefault();
                focus( last );
            } else if ( !event.shiftKey && active === last ) {
                event.preventDefault();
                focus( first );
            }
            // Other gallery modals have document-level keyboard handlers too.
            event.stopPropagation();
            return;
        }
        if ( !root.contains( target ) || /^(INPUT|TEXTAREA|SELECT)$/.test( target.tagName ) || target.isContentEditable ) {
            return;
        }
        if ( event.altKey && ( event.key === 'ArrowLeft' || event.key === 'ArrowRight' ) ) {
            event.preventDefault();
            event.stopPropagation();
            navigateCase( event.key === 'ArrowLeft' ? -1 : 1 );
            return;
        }
        if ( target === els.divider ) {
            var adjustment = event.shiftKey ? 10 : 2;
            var values = { ArrowLeft: state.split - adjustment, ArrowDown: state.split - adjustment, ArrowRight: state.split + adjustment, ArrowUp: state.split + adjustment, Home: 0, End: 100, PageDown: state.split - 10, PageUp: state.split + 10 };
            if ( values[ event.key ] !== undefined ) {
                event.preventDefault();
                event.stopPropagation();
                updateSplit( values[ event.key ] );
            }
            return;
        }
        if ( els.timelineTrack.contains( target ) ) {
            var stops = Array.prototype.slice.call( els.timelineTrack.children );
            var position = stops.indexOf( target );
            var next = position;
            if ( event.key === 'ArrowRight' || event.key === 'ArrowDown' ) {
                next = Math.min( stops.length - 1, position + 1 );
            } else if ( event.key === 'ArrowLeft' || event.key === 'ArrowUp' ) {
                next = Math.max( 0, position - 1 );
            } else if ( event.key === 'Home' ) {
                next = 0;
            } else if ( event.key === 'End' ) {
                next = stops.length - 1;
            } else {
                return;
            }
            if ( stops[ next ] ) {
                event.preventDefault();
                event.stopPropagation();
                selectView( Number( stops[ next ].dataset.view ) );
                focus( stops[ next ] );
            }
            return;
        }
        var pane = target === els.before.pane ? els.before : ( target === els.after.pane ? els.after : null );
        if ( state.style === 'desk' && pane ) {
            var step = event.shiftKey ? 0.1 : 0.025;
            if ( /^Arrow(Left|Right|Up|Down)$/.test( event.key ) ) {
                event.preventDefault();
                event.stopPropagation();
                state.lens.enabled = true;
                state.lens.visible = true;
                state.lens.x = Math.max( 0, Math.min( 1, state.lens.x + ( event.key === 'ArrowLeft' ? -step : ( event.key === 'ArrowRight' ? step : 0 ) ) ) );
                state.lens.y = Math.max( 0, Math.min( 1, state.lens.y + ( event.key === 'ArrowUp' ? -step : ( event.key === 'ArrowDown' ? step : 0 ) ) ) );
                syncLensToggle();
                paintLenses();
                return;
            }
            if ( [ '+', '=', '-', '_' ].indexOf( event.key ) !== -1 ) {
                event.preventDefault();
                event.stopPropagation();
                changeLens( event.key === '-' || event.key === '_' ? -0.25 : 0.25 );
                return;
            }
        }
        if ( target === els.stage ) {
            if ( event.key === 'ArrowLeft' || event.key === 'ArrowRight' ) {
                event.preventDefault();
                event.stopPropagation();
                navigateView( event.key === 'ArrowLeft' ? -1 : 1 );
            } else if ( state.style === 'phone' && ( event.key === 'ArrowUp' || event.key === 'ArrowDown' ) ) {
                event.preventDefault();
                event.stopPropagation();
                navigateCase( event.key === 'ArrowUp' ? 1 : -1 );
            } else if ( zoom && zoomEnabled() && [ '+', '=', '-', '_', '0' ].indexOf( event.key ) !== -1 ) {
                event.preventDefault();
                event.stopPropagation();
                if ( event.key === '0' ) {
                    zoom.reset( false );
                } else {
                    zoom.zoomBy( event.key === '-' || event.key === '_' ? 1 / 1.5 : 1.5, false );
                }
            }
        }
    }

    function syncLensToggle() {
        // A toggle button: aria-pressed carries the state, so the name stays
        // put (setLabel keeps the icon, which textContent would wipe).
        setLabel( els.lensToggle, t( 'magnifierToggle' ) || ( state.lens.enabled ? t( 'hideMagnifier' ) : t( 'showMagnifier' ) ) );
        els.lensToggle.setAttribute( 'aria-pressed', String( state.lens.enabled ) );
    }

    /** The ⓘ panel with the zoom / magnifier explanations (also read via aria-describedby). */
    function setInfo( open ) {
        if ( !els.infoPanel ) {
            return;
        }
        var show = !!open && !els.info.hidden;
        hidden( els.infoPanel, !show );
        els.infoButton.setAttribute( 'aria-expanded', String( show ) );
        root.classList.toggle( 'mba-pro-viewer-info-open', show );
        if ( show ) {
            wake( false );
        }
    }

    /**
     * Cinema lets its controls rest after a moment without mouse movement, so
     * the photo has the screen to itself. wake( true ) — mouse moved — shows
     * them and starts the countdown; wake( false ) shows them and stops it
     * (keyboard, touch, opening a panel, changing style).
     */
    var idleTimer = 0;
    function wake( countdown ) {
        window.clearTimeout( idleTimer );
        if ( !root ) {
            return;
        }
        root.classList.remove( 'mba-pro-viewer-idle' );
        if ( !countdown || !state.open || state.style !== 'cinema' ) {
            return;
        }
        idleTimer = window.setTimeout( function () {
            var busy = state.details || state.share || state.tour >= 0 || ( els.infoPanel && !els.infoPanel.hidden );
            var hovering = [ els.header, els.footer, els.stageTools ].some( function ( part ) { return part && part.matches( ':hover' ); } );
            if ( state.open && state.style === 'cinema' && !busy && !hovering ) {
                root.classList.add( 'mba-pro-viewer-idle' );
            }
        }, 2600 );
    }

    function bindEvents() {
        root.addEventListener( 'click', function ( event ) {
            if ( !state.open || consentShowing() ) {
                return;
            }
            // A click anywhere outside the ⓘ panel closes it.
            if ( els.infoPanel && !els.infoPanel.hidden && !els.info.contains( event.target ) ) {
                setInfo( false );
            }
            var control = event.target.closest( '[data-action]' );
            if ( !control || !root.contains( control ) || control.disabled ) {
                return;
            }
            var actions = {
                close: function () { viewerClose(); },
                info: function () {
                    setInfo( els.infoPanel.hidden );
                    if ( !els.infoPanel.hidden ) {
                        announce( els.infoPanel.textContent );
                    }
                },
                'previous-case': function () { navigateCase( -1 ); },
                'next-case': function () { navigateCase( 1 ); },
                'previous-view': function () { navigateView( -1 ); },
                'next-view': function () { navigateView( 1 ); },
                view: function () { selectView( Number( control.dataset.view ) ); },
                mode: function () { setMode( control.dataset.mode ); },
                details: function () { setDetails( !state.details ); },
                'close-details': function () { setDetails( false ); },
                share: function () { setShare( !state.share ); },
                'close-share': function () { setShare( false ); },
                copy: copyLink,
                'native-share': nativeShare,
                'zoom-in': function () { if ( zoom ) { zoom.zoomBy( 1.5, false ); } },
                'zoom-out': function () { if ( zoom ) { zoom.zoomBy( 1 / 1.5, false ); } },
                'zoom-reset': function () { if ( zoom ) { zoom.reset( false ); } },
                'lens-toggle': function () { state.lens.enabled = !state.lens.enabled; state.lens.visible = state.lens.enabled; syncLensToggle(); paintLenses(); },
                'lens-in': function () { changeLens( 0.25 ); },
                'lens-out': function () { changeLens( -0.25 ); },
                marker: function () { startTour( Number( control.dataset.marker ) ); },
                tour: function () { state.tour >= 0 ? finishTour( true ) : startTour( 0 ); },
                'tour-previous': function () { startTour( state.tour - 1, false ); },
                'tour-next': function () { startTour( state.tour + 1, false ); },
                'tour-done': function () { finishTour( true ); },
                expand: function () {
                    state.expanded = !state.expanded;
                    root.classList.toggle( 'mba-pro-viewer-expanded', state.expanded );
                    control.setAttribute( 'aria-expanded', String( state.expanded ) );
                    control.setAttribute( 'aria-label', state.expanded ? t( 'collapse' ) : t( 'expand' ) );
                    control.title = state.expanded ? t( 'collapse' ) : t( 'expand' );
                    scheduleGeometry();
                    scheduleStageFit();
                },
                'phone-modes': function () {
                    var open = root.classList.toggle( 'mba-pro-viewer-modes-open' );
                    control.setAttribute( 'aria-expanded', String( open ) );
                    if ( open ) {
                        focus( els.modes.querySelector( '[aria-pressed="true"]' ) || els.modes.querySelector( 'button:not([disabled])' ) );
                    }
                },
                'before-toggle': function () { setMode( displayedMode() === 'before' ? 'after' : 'before' ); announce( displayedMode() === 'before' ? t( 'showingBefore' ) : afterLabel() ); }
            };
            if ( actions[ control.dataset.action ] ) {
                event.preventDefault();
                event.stopPropagation();
                actions[ control.dataset.action ]();
            }
        } );
        root.addEventListener( 'pointermove', function ( event ) {
            if ( state.open && event.pointerType === 'mouse' ) {
                wake( true );
            }
        }, { passive: true } );
        root.addEventListener( 'pointerdown', function ( event ) {
            if ( state.open && event.pointerType !== 'mouse' ) {
                wake( false );
            }
        }, { passive: true } );
        root.addEventListener( 'contextmenu', function ( event ) {
            if ( flag( config.imageProtection, false ) && event.target.closest( '.mba-pro-viewer-stage, img' ) ) {
                event.preventDefault();
            }
        } );
        root.addEventListener( 'dragstart', function ( event ) {
            if ( flag( config.imageProtection, false ) && event.target.tagName === 'IMG' ) {
                event.preventDefault();
            }
        } );
        var draggingDivider = null;
        els.divider.addEventListener( 'pointerdown', function ( event ) {
            if ( event.button !== 0 || consentShowing() ) {
                return;
            }
            draggingDivider = event.pointerId;
            focus( els.divider );
            try { els.divider.setPointerCapture( event.pointerId ); } catch ( error ) {}
            event.preventDefault();
            event.stopPropagation();
        } );
        els.divider.addEventListener( 'pointermove', function ( event ) {
            if ( draggingDivider !== event.pointerId ) {
                return;
            }
            var rect = els.canvas.getBoundingClientRect();
            updateSplit( rect.width ? ( event.clientX - rect.left ) / rect.width * 100 : 50 );
            event.preventDefault();
        } );
        function endDivider( event ) {
            if ( draggingDivider === event.pointerId ) {
                draggingDivider = null;
            }
        }
        els.divider.addEventListener( 'pointerup', endDivider );
        els.divider.addEventListener( 'pointercancel', endDivider );
        els.divider.addEventListener( 'lostpointercapture', endDivider );
        [ els.before, els.after ].forEach( bindLens );
        bindSwipes();
        document.addEventListener( 'keydown', handleKey, true );
        document.addEventListener( 'focusin', function ( event ) {
            if ( !state.open || consentShowing() ) {
                return;
            }
            var scope = focusScope();
            if ( !scope.contains( event.target ) ) {
                focus( focusables( scope )[0] || els.dialog );
            }
        }, true );
    }

    function bindLens( target ) {
        var pointer = null;
        target.pane.addEventListener( 'pointerdown', function ( event ) {
            if ( state.style !== 'desk' || !state.lens.enabled || event.target.closest( 'button, [role="slider"]' ) || ( event.pointerType === 'mouse' && event.button !== 0 ) ) {
                return;
            }
            pointer = event.pointerId;
            focus( target.pane );
            lensPoint( target, event.clientX, event.clientY );
            try { target.pane.setPointerCapture( event.pointerId ); } catch ( error ) {}
            event.preventDefault();
        } );
        target.pane.addEventListener( 'pointermove', function ( event ) {
            if ( state.style === 'desk' && state.lens.enabled && ( event.pointerType === 'mouse' || pointer === event.pointerId ) ) {
                lensPoint( target, event.clientX, event.clientY );
            }
        } );
        function end( event ) {
            if ( pointer === event.pointerId ) {
                pointer = null;
            }
        }
        target.pane.addEventListener( 'pointerup', end );
        target.pane.addEventListener( 'pointercancel', end );
        target.pane.addEventListener( 'lostpointercapture', end );
        target.pane.addEventListener( 'focus', function () {
            if ( state.style === 'desk' && state.lens.enabled ) {
                state.lens.visible = true;
                paintLenses();
            }
        } );
        target.pane.addEventListener( 'wheel', function ( event ) {
            if ( state.style === 'desk' && state.lens.enabled && !event.ctrlKey && event.deltaY ) {
                event.preventDefault();
                changeLens( event.deltaY < 0 ? 0.25 : -0.25 );
            }
        }, { passive: false } );
    }

    function bindSwipes() {
        els.stage.addEventListener( 'pointerdown', function ( event ) {
            if ( event.pointerType === 'mouse' && event.button !== 0 ) {
                return;
            }
            state.pointers.add( event.pointerId );
            if ( state.pointers.size !== 1 || event.target.closest( 'button, a, [role="slider"]' ) || state.style === 'desk' ) {
                state.swipe = null;
                releaseHold();
                return;
            }
            state.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
            var view = state.views[ state.view ];
            if ( state.style === 'phone' && view.type === 'pair' && view.before && view.after && state.mode !== 'split' ) {
                state.holding = true;
                renderMode();
                try { els.stage.setPointerCapture( event.pointerId ); } catch ( error ) {}
                event.preventDefault();
            }
        } );
        els.stage.addEventListener( 'pointermove', function ( event ) {
            var swipe = state.swipe;
            if ( swipe && swipe.id === event.pointerId && ( Math.abs( event.clientX - swipe.x ) > 15 || Math.abs( event.clientY - swipe.y ) > 15 ) ) {
                releaseHold();
            }
        } );
        function releaseHold() {
            if ( state.holding ) {
                state.holding = false;
                renderMode();
            }
        }
        function end( event ) {
            state.pointers.delete( event.pointerId );
            var swipe = state.swipe;
            if ( !swipe || swipe.id !== event.pointerId ) {
                return;
            }
            state.swipe = null;
            releaseHold();
            if ( event.type !== 'pointerup' || state.pointers.size || Date.now() - swipe.time > 850 || ( zoom && ( zoom.isZoomed() || zoom.recentlyPinched() ) ) ) {
                return;
            }
            var dx = event.clientX - swipe.x;
            var dy = event.clientY - swipe.y;
            if ( state.style === 'phone' && Math.abs( dy ) > 55 && Math.abs( dy ) > Math.abs( dx ) * 1.4 ) {
                navigateCase( dy < 0 ? 1 : -1 );
            } else if ( Math.abs( dx ) > 50 && Math.abs( dx ) > Math.abs( dy ) * 1.4 ) {
                navigateView( dx < 0 ? 1 : -1 );
            }
        }
        // Window listeners also release a hold/swipe that ends outside the image.
        window.addEventListener( 'pointerup', end );
        window.addEventListener( 'pointercancel', end );
        els.stage.addEventListener( 'lostpointercapture', function () { releaseHold(); } );
        window.addEventListener( 'blur', function () { state.swipe = null; state.pointers.clear(); releaseHold(); } );
        document.addEventListener( 'visibilitychange', function () {
            if ( document.hidden ) {
                state.swipe = null;
                state.pointers.clear();
                releaseHold();
            }
        } );
    }

    function viewportChanged() {
        if ( !state.open ) {
            return;
        }
        var style = effectiveStyle();
        if ( style === 'default' ) {
            // A phone-only replacement yields back to the existing viewer on a
            // later open; resizing never unexpectedly opens a second modal.
            viewerClose();
            return;
        }
        if ( style !== state.style ) {
            finishTour( false );
            state.mode = initialMode( style );
            state.details = false;
            state.share = false;
            if ( zoom ) {
                zoom.reset( false );
            }
            applyStyle( style );
            renderCase();
            renderView();
            focus( els.close );
        } else {
            hidden( els.expand, style !== 'drawer' || !phoneQuery.matches );
            scheduleGeometry();
            scheduleStageFit();
        }
    }

    function listenQuery( query, callback ) {
        if ( typeof query.addEventListener === 'function' ) {
            query.addEventListener( 'change', callback );
        } else if ( typeof query.addListener === 'function' ) {
            query.addListener( callback );
        }
    }

    viewerOpen.__mbaProViewer = true;
    window.openModal = viewerOpen;
    window.mbaProViewer = { open: viewerOpen, close: viewerClose, isOpen: function () { return state.open; } };
    window.mbaProViewerActive = true;

    // Preserve wrappers installed after our parse-time override (the Classic
    // redesign and deep-link writer are such wrappers). Only a reinstallation
    // of the exact function we replaced is safe to replace again.
    document.addEventListener( 'DOMContentLoaded', function () {
        if ( window.openModal === previousOpen && window.openModal !== viewerOpen ) {
            window.openModal = viewerOpen;
        }
    } );
    document.addEventListener( 'medbeafgallery:dataReady', function () {
        dataReady = true;
        if ( pendingData ) {
            var pending = pendingData;
            pendingData = null;
            if ( !pending.list.length ) {
                pending.list = galleryList().slice();
            }
            resumeOpen( pending );
        }
    } );
    document.addEventListener( 'medbeafgallery:consentGiven', function () {
        if ( pendingConsent ) {
            var pending = pendingConsent;
            pendingConsent = null;
            resumeOpen( pending );
        }
    } );
    window.addEventListener( 'popstate', function () {
        if ( waitingHistory ) {
            waitingHistory = false;
            var pending = pendingHistory;
            pendingHistory = null;
            // Let the other popstate handlers finish their URL cleanup first.
            if ( pending ) {
                window.setTimeout( function () { resumeOpen( pending ); }, 0 );
            }
            return;
        }
        if ( state.open ) {
            state.pushedHistory = false;
            viewerClose( true );
        }
    } );
    window.addEventListener( 'resize', viewportChanged );
    window.addEventListener( 'pagehide', function () {
        if ( state.open ) {
            viewerClose( true );
        }
        waitingHistory = false;
        pendingHistory = null;
    } );
    listenQuery( darkQuery, updateAppearance );
    listenQuery( motionQuery, updateAppearance );
    listenQuery( transparencyQuery, updateAppearance );
}());
