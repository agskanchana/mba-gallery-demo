/** Optional layouts decorate the current card builder and retain core pagination. */
(function() {
    'use strict';

    var config = window.medbeafgalleryGalleryConfig || {};
    var contexts = new WeakMap();
    var windowContexts = new WeakMap();
    var roots = [];
    var renderRoot = null;
    var lastOpenRoot = null;
    var rowDrag = null;
    var serial = 0;
    var template = document.createElement( 'template' );
    var darkQuery = window.matchMedia ? window.matchMedia( '(prefers-color-scheme: dark)' ) : null;
    var motionQuery = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : null;
    var presets = [ 'default', 'clinical', 'luxury', 'spa', 'midnight' ];
    var layouts = [ 'classic', 'masonry', 'spotlight', 'rows', 'editorial', 'angles', 'uncropped', 'collections' ];
    var windowSelector = '#medbeafgallery-modal, .mba-pro-mmodal, .mba-pro-viewer';

    function plain( value ) {
        if ( typeof value !== 'string' && typeof value !== 'number' ) {
            return '';
        }
        // Template contents are inert: descriptions never enter the live DOM.
        template.innerHTML = String( value );
        return ( template.content.textContent || '' ).replace( /\s+/g, ' ' ).trim();
    }

    function node( tag, className, value ) {
        var element = document.createElement( tag );
        if ( className ) { element.className = className; }
        if ( value !== undefined ) { element.textContent = value; }
        return element;
    }

    function safeUrl( value ) {
        if ( typeof value !== 'string' || !value ) { return ''; }
        try {
            var url = new URL( value, document.baseURI );
            return /^(https?:)$/.test( url.protocol ) ? url.href : '';
        } catch ( error ) {
            return '';
        }
    }

    function truthy( value ) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function format( value, args ) {
        var sequential = 0;
        return String( value || '' ).replace( /%(?:(\d+)\$)?s|%%/g, function( match, position ) {
            if ( match === '%%' ) { return '%'; }
            var index = position ? parseInt( position, 10 ) - 1 : sequential++;
            return args[ index ] === undefined ? '' : String( args[ index ] );
        } );
    }

    function label( options, key, args ) {
        var value = options.i18n && options.i18n[ key ] || '';
        return args ? format( value, args ) : value;
    }

    function beforeLabel( options ) {
        return plain( config.beforeLabel || config.beforeText ) || label( options, 'before' );
    }

    function afterLabel( options ) {
        return plain( config.afterLabel || config.afterText ) || label( options, 'after' );
    }

    function engineState() {
        return typeof galleryConfig !== 'undefined' ? galleryConfig : null;
    }

    function allItems() {
        if ( typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ) { return galleryData; }
        return Array.isArray( window.galleryData ) ? window.galleryData : [];
    }

    function filteredItems() {
        var state = engineState();
        return state && Array.isArray( state.filteredItems ) ? state.filteredItems : allItems();
    }

    function primaryRoot() {
        var grid = document.getElementById( 'medbeafgallery-gallery-grid' );
        return grid && grid.closest( '.medbeafgallery-container' );
    }

    function readContext( root ) {
        if ( !root ) { return null; }
        if ( contexts.has( root ) ) { return contexts.get( root ); }
        var input = config.proLayouts || {};
        try {
            var local = root.getAttribute( 'data-mba-pro-layouts' );
            if ( local ) { input = JSON.parse( local ); }
        } catch ( error ) {}
        var options = Object.assign( {}, input );
        options.layout = layouts.indexOf( options.layout ) !== -1 ? options.layout : 'classic';
        options.structure = [ 'gallery', 'hub', 'concerns', 'doctors' ].indexOf( options.structure ) !== -1 ? options.structure : 'gallery';
        options.compare = options.compare === 'on' ? 'on' : 'off';
        options.preset = presets.indexOf( options.preset ) !== -1 ? options.preset : 'default';
        options.motion = [ 'none', 'subtle', 'lively' ].indexOf( options.motion ) !== -1 ? options.motion : 'subtle';
        options.card_style = [ 'split', 'reveal', 'slider', 'photo', 'toggle', 'stacked' ].indexOf( options.card_style ) !== -1 ? options.card_style : 'split';
        options.card_frame = [ 'boxed', 'framed', 'open' ].indexOf( options.card_frame ) !== -1 ? options.card_frame : 'boxed';
        options.columns = /^(auto|[1-4])$/.test( String( options.columns ) ) ? String( options.columns ) : 'auto';
        options.new_days = Math.max( 1, Math.min( 365, parseInt( options.new_days, 10 ) || 30 ) );
        options.i18n = options.i18n || ( config.proLayouts && config.proLayouts.i18n ) || {};
        var context = { root: root, options: options, status: null, statusText: '' };
        contexts.set( root, context );
        roots.push( root );
        applyRoot( context );
        return context;
    }

    function isDark( options ) {
        return options.dark_mode === 'on' || ( options.dark_mode === 'auto' && darkQuery && darkQuery.matches );
    }

    function applyRoot( context ) {
        var root = context.root;
        var options = context.options;
        root.classList.add( 'mba-pro-layouts', 'mba-pro-gallery-' + options.layout, 'mba-pro-preset-' + options.preset, 'mba-pro-motion-' + options.motion );
        root.classList.toggle( 'mba-pro-layout-masonry', options.layout === 'masonry' );
        root.classList.toggle( 'mba-pro-preset-active', options.preset !== 'default' );
        // The quieter card design (photo first, caption under it, whole photos)
        // for every look added in 1.6.0. The look galleries had before — classic
        // or masonry with split cards and no preset — stays exactly as it was.
        var legacy = ( options.layout === 'classic' || options.layout === 'masonry' ) && options.card_style === 'split' && options.preset === 'default';
        root.classList.toggle( 'mba-pro-refined', !legacy );
        [ 'boxed', 'framed', 'open' ].forEach( function( frame ) { root.classList.toggle( 'mba-pro-frame-' + frame, options.card_frame === frame ); } );
        root.setAttribute( 'data-mba-pro-columns', options.columns );
        root.setAttribute( 'data-mba-pro-columns-override', truthy( options.columns_override ) ? 'true' : 'false' );
        if ( options.card_style === 'reveal' ) { root.classList.add( 'medbeafgallery-cards-reveal' ); }
        root.setAttribute( 'data-mba-pro-layout-dark', isDark( options ) ? 'true' : 'false' );
        if ( /^[1-4]$/.test( options.columns ) ) {
            root.style.setProperty( '--mba-pro-layout-columns', options.columns );
        }
        var ratios = { '1-1': '1 / 1', '4-3': '4 / 3', '3-2': '3 / 2' };
        if ( ratios[ options.aspect_ratio ] ) {
            root.style.setProperty( '--mba-pro-layout-aspect', ratios[ options.aspect_ratio ] );
        }
    }

    function announce( context, message ) {
        if ( !context || !message || context.statusText === message ) { return; }
        if ( !context.status ) {
            context.status = node( 'p', 'mba-pro-layout-status' );
            context.status.setAttribute( 'role', 'status' );
            context.status.setAttribute( 'aria-live', 'polite' );
            context.status.setAttribute( 'aria-atomic', 'true' );
            context.root.appendChild( context.status );
        }
        context.statusText = message;
        context.status.textContent = message;
    }

    function image( url, alt, className, options ) {
        var src = safeUrl( url );
        if ( !src ) { return node( 'span', 'mba-pro-card-missing', label( options, 'missingPhoto' ) ); }
        var img = node( 'img', className );
        img.src = src;
        img.alt = plain( alt );
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        return img;
    }

    /*
     * A whole photo, never cropped: shown at its own proportions over a blurred
     * copy of itself that fills the frame (no grey or black bars). The blurred
     * copy uses the smaller card image; the photo uses the display image.
     */
    function fitLayer( url, thumb, alt, className, options ) {
        var wrap = node( 'span', 'mba-pro-fit' + ( className ? ' ' + className : '' ) );
        var src = safeUrl( url );
        if ( !src ) {
            wrap.appendChild( node( 'span', 'mba-pro-card-missing', label( options, 'missingPhoto' ) ) );
            return wrap;
        }
        var backdrop = image( safeUrl( thumb ) || src, '', 'mba-pro-fit-backdrop', options );
        backdrop.setAttribute( 'aria-hidden', 'true' );
        wrap.appendChild( backdrop );
        wrap.appendChild( image( src, alt, 'mba-pro-fit-image', options ) );
        return wrap;
    }

    var CHEVRONS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var ARROW_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var ARROW_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function excerpt( value, limit ) {
        var text = plain( value );
        return text.length <= limit ? text : text.slice( 0, limit ).replace( /\s+\S*$/, '' ) + '…';
    }

    function categoryNames( item ) {
        if ( Array.isArray( item.categories ) && item.categories.length ) {
            return item.categories.map( function( category ) { return plain( category.name || category.slug ); } ).filter( Boolean ).join( ', ' );
        }
        return plain( item.categoryName || item.category );
    }

    function detailLabel( options, key ) {
        var definitions = Array.isArray( config.proFilterDefs ) ? config.proFilterDefs : [];
        var definition = definitions.find( function( entry ) { return entry && entry.name === key; } );
        return definition && plain( definition.label ) || label( options, key );
    }

    function detailEntries( item, options ) {
        return [ 'duration', 'recovery', 'results' ].filter( function( key ) {
            return plain( item[ key ] ) && ( !Array.isArray( config.enabledDetails ) || config.enabledDetails.indexOf( key ) !== -1 );
        } ).map( function( key ) {
            return { label: detailLabel( options, key ), value: plain( item[ key ] ) };
        } );
    }

    function topline( card, media ) {
        var line = media.querySelector( '.mba-pro-card-topline' );
        if ( !line ) {
            line = node( 'div', 'mba-pro-card-topline' );
            media.appendChild( line );
            card.classList.add( 'mba-pro-has-topline' );
        }
        return line;
    }

    function badge( card, media, text, className ) {
        var line = topline( card, media );
        var badges = line.querySelector( '.mba-pro-card-badges' );
        if ( !badges ) { badges = node( 'div', 'mba-pro-card-badges' ); line.appendChild( badges ); }
        badges.appendChild( node( 'span', 'mba-pro-card-badge ' + className, text ) );
    }

    function decorateExtras( card, item, media, context ) {
        var options = context.options;
        if ( truthy( options.show_doctor ) && item.doctor && plain( item.doctor.name ) ) {
            var doctor = item.doctor;
            var name = plain( doctor.name );
            var chip = node( 'span', 'mba-pro-card-doctor' );
            chip.setAttribute( 'aria-label', label( options, 'treatedBy', [ name ] ) );
            var avatar = safeUrl( doctor.photo || doctor.avatar || doctor.avatarUrl );
            if ( avatar ) { chip.appendChild( image( avatar, '', 'mba-pro-card-avatar', options ) ); }
            chip.appendChild( node( 'span', '', name ) );
            topline( card, media ).insertBefore( chip, topline( card, media ).firstChild );
        }
        if ( truthy( options.show_new_badge ) ) {
            var timestamp = Number( item.timestamp );
            if ( !Number.isFinite( timestamp ) ) { timestamp = Date.parse( item.timestamp ) / 1000; }
            if ( timestamp > 100000000000 ) { timestamp /= 1000; }
            var age = Date.now() / 1000 - timestamp;
            if ( timestamp > 0 && age >= 0 && age <= options.new_days * 86400 ) {
                badge( card, media, label( options, 'newBadge' ), 'mba-pro-new-badge' );
            }
        }
        var timeline = Array.isArray( item.timeline ) ? item.timeline : ( item.timeline && Array.isArray( item.timeline.stages ) ? item.timeline.stages : [] );
        if ( truthy( options.show_progress_badge ) && timeline.length >= 3 ) {
            badge( card, media, label( options, 'progress' ), 'mba-pro-progress-badge' );
        }
        if ( truthy( options.show_result_chips ) ) {
            var entries = detailEntries( item, options ).slice( 0, 3 );
            if ( entries.length ) {
                var chips = node( 'div', 'mba-pro-result-chips' );
                entries.forEach( function( entry ) {
                    var value = entry.label + ': ' + entry.value;
                    var chip = node( 'span', 'mba-pro-result-chip', value.length > 72 ? value.slice( 0, 69 ) + '…' : value );
                    chip.title = value;
                    chip.setAttribute( 'aria-label', value );
                    chips.appendChild( chip );
                } );
                var caption = media.querySelector( '.mba-pro-photo-caption' );
                ( caption || media.querySelector( '.mba-pro-card-stage' ) || media ).appendChild( chips );
            }
        }
    }

    function focusElement( element ) {
        if ( !element || !element.focus ) { return; }
        try { element.focus( { preventScroll: true } ); } catch ( error ) { element.focus(); }
    }

    function openCase( card, item, context ) {
        lastOpenRoot = context.root;
        var trigger = card.querySelector( '.medbeafgallery-gallery-view-btn, .mba-pro-mcard-view' );
        focusElement( trigger );
        if ( typeof window.openModal === 'function' ) { window.openModal( item.id ); }
    }

    function replacementStage( card, media, item, context ) {
        media.classList.add( 'mba-pro-card-media', 'mba-pro-media-replaced' );
        card.classList.add( 'mba-pro-custom-card' );
        var stage = node( 'div', 'mba-pro-card-stage' );
        media.insertBefore( stage, media.firstChild );
        var old = media.querySelector( '.medbeafgallery-preview-container' );
        if ( old ) { old.setAttribute( 'aria-hidden', 'true' ); }
        // Prevent the free reveal hold from competing with our card controls.
        stage.addEventListener( 'pointerdown', function( event ) { event.stopPropagation(); } );
        media.addEventListener( 'click', function( event ) {
            if ( !event.target.closest( '.mba-pro-card-stage' ) || event.target.closest( '[role="slider"], button, a, input' ) ) { return; }
            event.preventDefault();
            event.stopImmediatePropagation();
            if ( stage.mbaProHeld ) { stage.mbaProHeld = false; return; }
            openCase( card, item, context );
        }, true );
        return stage;
    }

    function fitNote( media, options, key ) {
        var note = node( 'p', 'mba-pro-fit-note', label( options, key ) );
        note.id = 'mba-pro-layout-fit-' + ( ++serial );
        media.appendChild( note );
        return note;
    }

    // Before / after switch: one whole photo — the after photo, or the before
    // photo when the case window is set to open on it — and a two-button switch.
    function decorateToggle( card, media, item, context ) {
        var options = context.options;
        var stage = replacementStage( card, media, item, context );
        stage.classList.add( 'mba-pro-toggle-stage' );
        card.classList.add( 'mba-pro-toggle-card' );
        var layers = {
            before: fitLayer( item.beforeImg, item.beforeThumb, item.beforeAlt || beforeLabel( options ), 'mba-pro-toggle-layer mba-pro-toggle-before', options ),
            after: fitLayer( item.afterImg, item.afterThumb, item.afterAlt || afterLabel( options ), 'mba-pro-toggle-layer mba-pro-toggle-after', options )
        };
        stage.appendChild( layers.before );
        stage.appendChild( layers.after );
        if ( !safeUrl( item.beforeImg ) || !safeUrl( item.afterImg ) ) {
            stage.setAttribute( 'data-side', safeUrl( item.afterImg ) ? 'after' : 'before' );
            return;
        }
        var group = node( 'div', 'mba-pro-toggle-switch' );
        group.setAttribute( 'role', 'group' );
        group.setAttribute( 'aria-label', label( options, 'switchLabel', [ plain( item.title ) ] ) );
        var buttons = {};
        function show( side ) {
            stage.setAttribute( 'data-side', side );
            [ 'before', 'after' ].forEach( function( key ) {
                buttons[ key ].setAttribute( 'aria-pressed', String( key === side ) );
                layers[ key ].setAttribute( 'aria-hidden', String( key !== side ) );
            } );
        }
        [ 'before', 'after' ].forEach( function( side ) {
            var button = node( 'button', 'mba-pro-toggle-option', side === 'before' ? beforeLabel( options ) : afterLabel( options ) );
            button.type = 'button';
            button.setAttribute( 'data-side', side );
            // The switch must not open the case or start a drag.
            button.addEventListener( 'pointerdown', function( event ) { event.stopPropagation(); } );
            button.addEventListener( 'click', function( event ) {
                event.preventDefault();
                event.stopPropagation();
                show( side );
            } );
            buttons[ side ] = button;
            group.appendChild( button );
        } );
        stage.appendChild( group );
        show( config.defaultViewMode === 'before' ? 'before' : 'after' );
    }

    function decorateUncropped( card, media, item, context, stacked ) {
        var options = context.options;
        var stage = replacementStage( card, media, item, context );
        stage.classList.add( 'mba-pro-uncropped-stage' );
        card.classList.add( 'mba-pro-uncropped-card' );
        if ( stacked ) {
            // Before above after: wide photos (smiles, bodies side on) stay large.
            stage.classList.add( 'mba-pro-stacked-stage' );
            card.classList.add( 'mba-pro-stacked-card' );
        }
        [ 'before', 'after' ].forEach( function( side ) {
            var figure = node( 'figure', 'mba-pro-whole-photo' );
            var name = side === 'before' ? beforeLabel( options ) : afterLabel( options );
            // Full display URLs are essential: thumbnails may already be cropped.
            figure.appendChild( fitLayer( item[ side + 'Img' ], item[ side + 'Thumb' ], item[ side + 'Alt' ] || name, 'mba-pro-whole-image', options ) );
            figure.appendChild( node( 'figcaption', 'mba-pro-whole-label mba-pro-whole-label-' + side, name ) );
            stage.appendChild( figure );
        } );
        fitNote( media, options, 'wholePhotos' );
    }

    function decorateSlider( card, media, item, context ) {
        var options = context.options;
        var stage = replacementStage( card, media, item, context );
        stage.classList.add( 'mba-pro-slider-stage' );
        card.classList.add( 'mba-pro-slider-card' );
        stage.appendChild( fitLayer( item.afterImg, item.afterThumb, item.afterAlt || afterLabel( options ), 'mba-pro-compare-image mba-pro-compare-after', options ) );
        var beforeLayer = node( 'div', 'mba-pro-compare-before' );
        beforeLayer.appendChild( fitLayer( item.beforeImg, item.beforeThumb, item.beforeAlt || beforeLabel( options ), 'mba-pro-compare-image', options ) );
        stage.appendChild( beforeLayer );
        stage.appendChild( node( 'span', 'mba-pro-compare-label mba-pro-compare-label-before', beforeLabel( options ) ) );
        stage.appendChild( node( 'span', 'mba-pro-compare-label mba-pro-compare-label-after', afterLabel( options ) ) );
        var note = fitNote( media, options, 'compareHelp' );
        if ( !safeUrl( item.beforeImg ) || !safeUrl( item.afterImg ) ) { return; }
        var divider = node( 'div', 'mba-pro-card-slider-line' );
        divider.setAttribute( 'aria-hidden', 'true' );
        stage.appendChild( divider );
        var handle = node( 'div', 'mba-pro-card-slider-handle' );
        handle.innerHTML = CHEVRONS;
        handle.tabIndex = 0;
        handle.setAttribute( 'role', 'slider' );
        handle.setAttribute( 'aria-orientation', 'horizontal' );
        handle.setAttribute( 'aria-valuemin', '0' );
        handle.setAttribute( 'aria-valuemax', '100' );
        handle.setAttribute( 'aria-label', label( options, 'compare', [ plain( item.title ) ] ) );
        handle.setAttribute( 'aria-describedby', note.id );
        stage.appendChild( handle );
        var value = 50;
        var pointer = null;
        function setValue( next ) {
            value = Math.round( Math.max( 0, Math.min( 100, next ) ) );
            stage.style.setProperty( '--mba-pro-card-split', value + '%' );
            handle.setAttribute( 'aria-valuenow', String( value ) );
            handle.setAttribute( 'aria-valuetext', label( options, 'compareValue', [ value, 100 - value ] ) );
        }
        handle.addEventListener( 'pointerdown', function( event ) {
            if ( event.button !== 0 || !event.isPrimary ) { return; }
            event.preventDefault();
            event.stopPropagation();
            var rect = stage.getBoundingClientRect();
            pointer = { id: event.pointerId, left: rect.left, width: rect.width };
            focusElement( handle );
            if ( handle.setPointerCapture ) { handle.setPointerCapture( event.pointerId ); }
        } );
        handle.addEventListener( 'pointermove', function( event ) {
            if ( !pointer || event.pointerId !== pointer.id || !pointer.width ) { return; }
            event.preventDefault();
            event.stopPropagation();
            setValue( ( event.clientX - pointer.left ) / pointer.width * 100 );
        } );
        function end( event ) {
            if ( !pointer || event.pointerId !== pointer.id ) { return; }
            event.stopPropagation();
            pointer = null;
        }
        handle.addEventListener( 'pointerup', end );
        handle.addEventListener( 'pointercancel', end );
        handle.addEventListener( 'lostpointercapture', function() { pointer = null; } );
        handle.addEventListener( 'click', function( event ) { event.preventDefault(); event.stopPropagation(); } );
        handle.addEventListener( 'keydown', function( event ) {
            var step = event.shiftKey ? 10 : 2;
            var next = value;
            if ( event.key === 'ArrowLeft' || event.key === 'ArrowDown' ) { next -= step; }
            else if ( event.key === 'ArrowRight' || event.key === 'ArrowUp' ) { next += step; }
            else if ( event.key === 'Home' ) { next = 0; }
            else if ( event.key === 'End' ) { next = 100; }
            else { return; }
            event.preventDefault();
            event.stopPropagation();
            setValue( next );
        } );
        setValue( 50 );
    }

    // Shows the reveal on ONE card per page view (the first that comes into view),
    // so visitors can see the photo changes. Every card doing it — each batch that
    // loads while scrolling — read as the grid flickering. Never with reduced motion.
    var hintObserver = null;
    var hintPlayed = false;
    function revealHint( card, stage ) {
        if ( hintPlayed || !( 'IntersectionObserver' in window ) || ( motionQuery && motionQuery.matches ) ) { return; }
        if ( !hintObserver ) {
            hintObserver = new IntersectionObserver( function( entries ) {
                entries.forEach( function( entry ) {
                    if ( !entry.isIntersecting || hintPlayed ) { return; }
                    var owner = entry.target.mbaProHintCard;
                    if ( !owner || !owner.isConnected ) { hintObserver.unobserve( entry.target ); return; }
                    hintPlayed = true;
                    hintObserver.disconnect();
                    owner.classList.add( 'mba-pro-photo-hint' );
                    window.setTimeout( function() { owner.classList.remove( 'mba-pro-photo-hint' ); }, 1600 );
                } );
            }, { threshold: 0.6 } );
        }
        stage.mbaProHintCard = card;
        hintObserver.observe( stage );
    }

    // Hover reveal in every layout but masonry (which has its own toggle): the
    // whole before photo wipes to the whole after photo; the caption stays below.
    function decorateReveal( card, media, item, context ) {
        decoratePhoto( card, media, item, context, true );
    }

    function decoratePhoto( card, media, item, context, revealOnly ) {
        var options = context.options;
        var stage = replacementStage( card, media, item, context );
        card.classList.add( revealOnly ? 'mba-pro-reveal-card' : 'mba-pro-photo-card' );
        stage.classList.add( 'mba-pro-photo-stage' );
        var reveal = ( revealOnly || config.cardStyle === 'reveal' ) && safeUrl( item.beforeImg ) && safeUrl( item.afterImg );
        if ( reveal ) {
            card.classList.add( 'mba-pro-photo-reveal' );
            stage.appendChild( fitLayer( item.beforeImg, item.beforeThumb, item.beforeAlt || beforeLabel( options ), 'mba-pro-photo-image mba-pro-photo-before', options ) );
        }
        stage.appendChild( fitLayer( item.afterImg || item.beforeImg, item.afterThumb || item.beforeThumb, item.afterAlt || item.beforeAlt || afterLabel( options ), 'mba-pro-photo-image mba-pro-photo-after', options ) );
        if ( reveal ) {
            revealHint( card, stage );
            var state = node( 'span', 'mba-pro-photo-state' );
            state.appendChild( node( 'span', 'mba-pro-photo-state-before', beforeLabel( options ) ) );
            state.appendChild( node( 'span', 'mba-pro-photo-state-after', afterLabel( options ) ) );
            stage.appendChild( state );
            var timer = null;
            stage.addEventListener( 'pointerdown', function( event ) {
                if ( event.pointerType === 'mouse' || event.target.closest( 'button, a, input' ) ) { return; }
                stage.mbaProHeld = false;
                clearTimeout( timer );
                timer = window.setTimeout( function() {
                    stage.mbaProHeld = true;
                    card.classList.add( 'mba-pro-photo-held' );
                }, 280 );
            } );
            function endHold() {
                clearTimeout( timer );
                card.classList.remove( 'mba-pro-photo-held' );
            }
            [ 'pointerup', 'pointercancel', 'pointerleave' ].forEach( function( event ) { stage.addEventListener( event, endHold ); } );
        }
        if ( revealOnly ) { return; } // The card's own caption stays under the photo.
        var caption = node( 'div', 'mba-pro-photo-caption' );
        if ( !truthy( config.hideCaseCategory ) ) { caption.appendChild( node( 'span', 'mba-pro-photo-category', categoryNames( item ) ) ); }
        if ( !truthy( config.hideCaseTitle ) ) { caption.appendChild( node( 'h3', 'mba-pro-photo-title', plain( item.title ) ) ); }
        // (No per-card "matching centre crops" note: every grid card is a display
        // crop of both photos alike, and repeating it on each card was noise.)
        stage.appendChild( caption );
    }

    function decorateEditorial( card, item, options ) {
        card.classList.add( 'mba-pro-editorial-card', 'mba-pro-custom-card' );
        var info = card.querySelector( '.medbeafgallery-gallery-item-info' );
        if ( !info ) { return; }
        if ( !info.querySelector( '.mba-pro-ccard-desc, .mba-pro-mcard-desc' ) ) {
            var summary = excerpt( item.description || item.content, 220 );
            if ( summary ) { info.appendChild( node( 'p', 'mba-pro-editorial-excerpt', summary ) ); }
        }
        if ( !info.querySelector( '.mba-pro-ccard-meta, .mba-pro-mcard-meta' ) ) {
            var details = node( 'dl', 'mba-pro-editorial-details' );
            detailEntries( item, options ).forEach( function( entry ) {
                var pair = node( 'div', 'mba-pro-editorial-detail' );
                pair.appendChild( node( 'dt', '', entry.label ) );
                pair.appendChild( node( 'dd', '', entry.value ) );
                details.appendChild( pair );
            } );
            if ( details.children.length ) { info.appendChild( details ); }
        }
    }

    function pairIndex( item, extraIndex ) {
        return extraIndex + ( item.beforeImg && item.afterImg ? 1 : 0 );
    }

    function openAngle( card, item, index, context, trigger ) {
        lastOpenRoot = context.root;
        focusElement( trigger );
        if ( typeof window.openModal !== 'function' ) { return; }
        window.openModal( item.id );
        // Classic indicators update both the active pair and its navigation state.
        var viewer = window.mbaProViewer;
        if ( viewer && typeof viewer.isOpen === 'function' && viewer.isOpen() ) {
            if ( typeof viewer.openPair === 'function' ) { viewer.openPair( item.id, index ); return; }
        } else {
            var classic = document.getElementById( 'medbeafgallery-modal' );
            if ( classic && classic.classList.contains( 'active' ) ) {
                var indicators = classic.querySelectorAll( '.medbeafgallery-pair-indicator' );
                if ( indicators[ index ] ) { indicators[ index ].click(); return; }
            }
        }
        announce( context, label( context.options, 'pairUnavailable' ) );
        // The new viewer makes the gallery inert while open. Keep this notice
        // inside that dialog so assistive technology can still announce it.
        var activeWindow = viewer && typeof viewer.isOpen === 'function' && viewer.isOpen() ? document.querySelector( '.mba-pro-viewer' ) : document.querySelector( '.mba-pro-mmodal' );
        var dialog = activeWindow && activeWindow.querySelector( '.mba-pro-viewer-dialog, .mba-pro-mmodal-dialog' );
        if ( dialog ) {
            var notice = dialog.querySelector( '.mba-pro-pair-notice' );
            if ( !notice ) {
                notice = node( 'p', 'mba-pro-pair-notice' );
                notice.setAttribute( 'role', 'status' );
                notice.setAttribute( 'aria-live', 'polite' );
                dialog.appendChild( notice );
            }
            notice.textContent = label( context.options, 'pairUnavailable' );
        }
    }

    function decorateAngles( card, item, context ) {
        if ( !Array.isArray( item.imagePairs ) || !item.imagePairs.length ) { return; }
        var options = context.options;
        var strip = node( 'div', 'mba-pro-angle-strip' );
        strip.setAttribute( 'role', 'group' );
        strip.setAttribute( 'aria-label', label( options, 'openView', [ label( options, 'mainView' ), plain( item.title ) ] ) );
        item.imagePairs.forEach( function( pair, index ) {
            if ( !pair || ( !safeUrl( pair.afterThumb || pair.afterImg ) && !safeUrl( pair.beforeThumb || pair.beforeImg ) ) ) { return; }
            // Numbered from the main view ("View 2" is the first extra angle).
            var name = excerpt( pair.description, 48 ) || label( options, 'viewNumber', [ pairIndex( item, index ) + 1 ] );
            var button = node( 'button', 'mba-pro-angle-button' );
            button.type = 'button';
            button.setAttribute( 'aria-label', label( options, 'openView', [ plain( pair.description ) || name, plain( item.title ) ] ) );
            button.appendChild( image( pair.afterThumb || pair.afterImg || pair.beforeThumb || pair.beforeImg, '', 'mba-pro-angle-image', options ) );
            button.appendChild( node( 'span', 'mba-pro-angle-label', name ) );
            button.addEventListener( 'pointerdown', function( event ) { event.stopPropagation(); } );
            button.addEventListener( 'click', function( event ) {
                event.preventDefault();
                event.stopPropagation();
                openAngle( card, item, pairIndex( item, index ), context, button );
            } );
            strip.appendChild( button );
        } );
        if ( !strip.children.length ) { return; }
        // In the refined look the angles belong to the caption (before its link).
        // Photo cards hide that caption (their title sits on the photo), so there
        // the strip goes under the photo instead — inside it, it had no height.
        var photoCard = card.classList.contains( 'mba-pro-photo-card' ) && !card.classList.contains( 'mba-pro-editorial-card' );
        var info = !photoCard && context.root.classList.contains( 'mba-pro-refined' ) && card.querySelector( '.medbeafgallery-gallery-item-info, .mba-pro-mcard-body' );
        if ( photoCard ) { strip.classList.add( 'mba-pro-angle-strip-below' ); }
        ( info || card ).appendChild( strip );
    }

    function decorateCard( card, item, context ) {
        if ( !card || !item || !context || card.mbaProLayoutDecorated ) { return card; }
        card.mbaProLayoutDecorated = true;
        card.mbaProLayoutItem = item;
        card.classList.add( 'mba-pro-layout-card' );
        var options = context.options;
        var media = card.querySelector( '.medbeafgallery-gallery-image-container, .mba-pro-mcard-media' );
        if ( media ) {
            media.classList.add( 'mba-pro-card-media' );
            var style = options.card_style;
            // Uncropped means "never crop": the chosen card style still applies;
            // only split cards become two whole photos side by side.
            if ( style === 'slider' ) { decorateSlider( card, media, item, context ); }
            else if ( style === 'photo' ) { decoratePhoto( card, media, item, context ); }
            else if ( style === 'reveal' && options.layout !== 'masonry' ) { decorateReveal( card, media, item, context ); }
            else if ( style === 'toggle' && options.layout !== 'masonry' ) { decorateToggle( card, media, item, context ); }
            else if ( style === 'stacked' ) { decorateUncropped( card, media, item, context, true ); }
            else if ( options.layout === 'uncropped' ) { decorateUncropped( card, media, item, context ); }
            decorateExtras( card, item, media, context );
        }
        if ( options.layout === 'editorial' ) { decorateEditorial( card, item, options ); }
        if ( options.layout === 'angles' ) { decorateAngles( card, item, context ); }
        var refined = context.root.classList.contains( 'mba-pro-refined' );
        var info = card.querySelector( '.medbeafgallery-gallery-item-info, .mba-pro-mcard-body' );
        var button = card.querySelector( '.medbeafgallery-gallery-view-btn, .mba-pro-mcard-view' );
        if ( refined && button && info && !card.classList.contains( 'mba-pro-photo-card' ) ) {
            // The caption ends with one quiet "View case" link; nothing floats over the photo.
            button.classList.add( 'mba-pro-layout-open', 'mba-pro-caption-open' );
            Array.prototype.slice.call( button.childNodes ).forEach( function( child ) {
                if ( child.nodeType === 3 ) { button.removeChild( child ); }
            } );
            button.appendChild( document.createTextNode( label( options, 'viewCase' ) ) );
            if ( !button.getAttribute( 'aria-label' ) ) {
                button.setAttribute( 'aria-label', label( options, 'viewCase' ) + ': ' + plain( item.title ) );
            }
            var foot = info.querySelector( '.mba-pro-caption-foot' ) || node( 'div', 'mba-pro-caption-foot' );
            foot.appendChild( button );
            // "Doctor avatar and name" (a card extra) belongs in this footer, not over the photo.
            var doctor = media && media.querySelector( '.mba-pro-card-topline .mba-pro-card-doctor' );
            if ( doctor ) {
                var line = doctor.parentNode;
                foot.insertBefore( doctor, foot.firstChild );
                if ( line && !line.children.length ) {
                    line.remove();
                    card.classList.remove( 'mba-pro-has-topline' );
                }
            }
            info.appendChild( foot );
        } else if ( card.classList.contains( 'mba-pro-custom-card' ) && button ) {
            button.classList.add( 'mba-pro-layout-open' );
            if ( media && media.classList.contains( 'mba-pro-media-replaced' ) ) {
                ( card.classList.contains( 'mba-pro-photo-card' ) ? media.querySelector( '.mba-pro-card-stage' ) : media ).appendChild( button );
            }
        }
        return card;
    }

    function categoryTile( root, slug ) {
        return Array.from( root.querySelectorAll( '.medbeafgallery-carousel-item[data-id]' ) ).find( function( tile ) {
            return tile.getAttribute( 'data-id' ) === slug;
        } );
    }

    function rootCategories( items, options ) {
        var byId = new Map();
        var bySlug = new Map();
        ( Array.isArray( options.categories ) ? options.categories : [] ).forEach( function( category ) {
            byId.set( String( category.id ), category );
            bySlug.set( category.slug, category );
        } );
        var groups = new Map();
        items.forEach( function( item ) {
            var categories = Array.isArray( item.categories ) && item.categories.length ? item.categories : ( item.category ? [ { slug: item.category, name: item.categoryName } ] : [] );
            var used = new Set();
            categories.forEach( function( category ) {
                if ( !category || !category.slug ) { return; }
                var ancestor = bySlug.get( category.slug ) || category;
                var visited = new Set();
                while ( ancestor.parent && byId.has( String( ancestor.parent ) ) && !visited.has( String( ancestor.id ) ) ) {
                    visited.add( String( ancestor.id ) );
                    ancestor = byId.get( String( ancestor.parent ) );
                }
                var key = String( ancestor.slug );
                if ( used.has( key ) ) { return; }
                used.add( key );
                if ( !groups.has( key ) ) { groups.set( key, { slug: key, name: plain( ancestor.name ) || key, items: [] } ); }
                groups.get( key ).items.push( item );
            } );
            if ( !used.size ) {
                if ( !groups.has( '' ) ) { groups.set( '', { slug: '', name: label( options, 'otherCases' ), items: [] } ); }
                groups.get( '' ).items.push( item );
            }
        } );
        return groups;
    }

    function scrollRail( rail, amount, absolute ) {
        var behavior = rail.mbaProMotionOff || ( motionQuery && motionQuery.matches ) ? 'auto' : 'smooth';
        if ( absolute ) { rail.scrollTo( { left: amount, behavior: behavior } ); }
        else { rail.scrollBy( { left: amount, behavior: behavior } ); }
    }

    function createRow( group, context ) {
        var options = context.options;
        var section = node( 'section', 'mba-pro-procedure-row' );
        section.setAttribute( 'data-mba-pro-row', group.slug );
        section.setAttribute( 'role', 'listitem' );
        var heading = node( 'div', 'mba-pro-row-heading' );
        var title = node( 'h3', 'mba-pro-row-title', group.name );
        title.id = 'mba-pro-row-title-' + ( ++serial );
        var count = node( 'span', 'mba-pro-row-count' );
        var controls = node( 'div', 'mba-pro-row-controls' );
        var all = node( 'button', 'mba-pro-row-button mba-pro-row-all', label( options, 'seeAll' ) );
        all.type = 'button';
        all.setAttribute( 'aria-label', label( options, 'seeCategory', [ group.name ] ) );
        var tile = categoryTile( context.root, group.slug );
        if ( !tile && !group.onSelect ) { all.disabled = true; all.title = label( options, 'categoryHidden' ); }
        if ( group.slug ) {
            all.addEventListener( 'click', function() {
                if ( group.onSelect ) { group.onSelect(); return; }
                var target = categoryTile( context.root, group.slug );
                if ( target ) {
                    focusElement( target );
                    target.click(); // Run every free / Pro / discovery listener.
                }
            } );
            controls.appendChild( all );
        }
        var prev = node( 'button', 'mba-pro-row-button mba-pro-row-prev' );
        var next = node( 'button', 'mba-pro-row-button mba-pro-row-next' );
        prev.innerHTML = ARROW_PREV;
        next.innerHTML = ARROW_NEXT;
        prev.type = next.type = 'button';
        prev.setAttribute( 'aria-label', label( options, 'previous' ) + ': ' + group.name );
        next.setAttribute( 'aria-label', label( options, 'next' ) + ': ' + group.name );
        var rail = node( 'div', 'mba-pro-row-rail' );
        rail.mbaProMotionOff = options.motion === 'none';
        rail.id = 'mba-pro-row-rail-' + serial;
        rail.tabIndex = 0;
        rail.setAttribute( 'role', 'list' );
        rail.setAttribute( 'aria-labelledby', title.id );
        prev.setAttribute( 'aria-controls', rail.id );
        next.setAttribute( 'aria-controls', rail.id );
        section.setAttribute( 'aria-labelledby', title.id );
        controls.appendChild( prev );
        controls.appendChild( next );
        heading.appendChild( title );
        heading.appendChild( count );
        heading.appendChild( controls );
        section.appendChild( heading );
        if ( group.intro ) { section.appendChild( node( 'p', 'mba-pro-row-intro', group.intro ) ); }
        section.appendChild( rail );
        if ( context.rtl === undefined ) { context.rtl = getComputedStyle( context.root ).direction === 'rtl'; }
        var rtl = context.rtl;
        var scheduled = false;
        function sync() {
            scheduled = false;
            var position = Math.abs( rail.scrollLeft );
            var maximum = Math.max( 0, rail.scrollWidth - rail.clientWidth );
            // Arrows only when there is something to scroll to; "See all" only when
            // the row does not already show every case of its category.
            var overflow = maximum > 2;
            var shown = rail.querySelectorAll( '.mba-pro-layout-card' ).length;
            prev.hidden = next.hidden = !overflow;
            all.hidden = !group.onSelect && !overflow && shown >= ( section.mbaProTotal || 0 );
            section.classList.toggle( 'mba-pro-row-fits', !overflow );
            prev.disabled = position <= 2;
            next.disabled = position >= maximum - 2;
        }
        function schedule() {
            if ( scheduled ) { return; }
            scheduled = true;
            window.requestAnimationFrame( sync );
        }
        prev.addEventListener( 'click', function() { scrollRail( rail, rail.clientWidth * ( rtl ? 0.85 : -0.85 ) ); } );
        next.addEventListener( 'click', function() { scrollRail( rail, rail.clientWidth * ( rtl ? -0.85 : 0.85 ) ); } );
        rail.addEventListener( 'scroll', schedule, { passive: true } );
        rail.addEventListener( 'keydown', function( event ) {
            if ( event.target !== rail ) { return; }
            if ( event.key === 'ArrowLeft' || event.key === 'ArrowRight' ) {
                event.preventDefault();
                scrollRail( rail, rail.clientWidth * ( event.key === 'ArrowLeft' ? -0.85 : 0.85 ) );
            } else if ( event.key === 'Home' || event.key === 'End' ) {
                event.preventDefault();
                scrollRail( rail, event.key === 'Home' ? 0 : ( rtl ? -1 : 1 ) * rail.scrollWidth, true );
            }
        } );
        rail.addEventListener( 'pointerdown', function( event ) {
            if ( event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest( 'button, a, input, [role="slider"]' ) ) { return; }
            rowDrag = { rail: rail, pointer: event.pointerId, startX: event.clientX, startScroll: rail.scrollLeft, moved: false };
        }, true );
        rail.addEventListener( 'click', function( event ) {
            if ( rail.mbaProSuppressClick ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                rail.mbaProSuppressClick = false;
            }
        }, true );
        rail.addEventListener( 'dragstart', function( event ) { event.preventDefault(); } );
        section.mbaProRow = { rail: rail, count: count, schedule: schedule };
        if ( 'ResizeObserver' in window ) {
            // One shared observer; only button states change on resize.
            if ( !resizeRows ) { resizeRows = new ResizeObserver( function( entries ) { entries.forEach( function( entry ) { if ( entry.target.mbaProSchedule ) { entry.target.mbaProSchedule(); } } ); } ); }
            rail.mbaProSchedule = schedule;
            resizeRows.observe( rail );
        }
        return section;
    }

    var resizeRows = null;

    function renderRows( grid, context, cards ) {
        var state = engineState();
        var category = state && state.currentCategory;
        var active = !category || category === 'all' || category === 'ba_category_all';
        active = active && !( state && state.currentChildCategory );
        context.root.classList.toggle( 'mba-pro-rows-active', active );
        if ( !active ) { return; }
        var groups = rootCategories( filteredItems(), context.options );
        var available = new Map();
        cards.forEach( function( card ) { if ( !available.has( String( card.dataset.id ) ) ) { available.set( String( card.dataset.id ), card ); } } );
        var previous = new Map();
        Array.from( grid.children ).forEach( function( element ) {
            if ( element.classList.contains( 'mba-pro-procedure-row' ) ) { previous.set( element.getAttribute( 'data-mba-pro-row' ), element ); }
        } );
        var usedCards = new Set();
        var focus = document.activeElement;
        groups.forEach( function( group, slug ) {
            var section = previous.get( slug ) || createRow( group, context );
            previous.delete( slug );
            var row = section.mbaProRow;
            var offset = row.rail.scrollLeft;
            var existing = new Map();
            row.rail.querySelectorAll( '.medbeafgallery-gallery-item' ).forEach( function( card ) { existing.set( String( card.dataset.id ), card ); } );
            row.count.textContent = label( context.options, group.items.length === 1 ? 'caseSingular' : 'casePlural', [ group.items.length ] );
            section.mbaProTotal = group.items.length;
            var fragment = document.createDocumentFragment();
            group.items.forEach( function( item ) {
                var original = available.get( String( item.id ) );
                if ( !original ) { return; }
                var card = existing.get( String( item.id ) ) || original;
                if ( usedCards.has( card ) ) {
                    // A multi-category case needs a live card, never cloneNode().
                    card = window.createGalleryItem( item );
                }
                if ( card ) { usedCards.add( card ); fragment.appendChild( card ); }
            } );
            if ( !fragment.childNodes.length ) {
                var pending = node( 'p', 'mba-pro-row-pending', label( context.options, 'rowPending' ) );
                pending.setAttribute( 'role', 'listitem' );
                fragment.appendChild( pending );
            }
            while ( row.rail.firstChild ) { row.rail.removeChild( row.rail.firstChild ); }
            row.rail.appendChild( fragment );
            grid.appendChild( section );
            row.rail.scrollLeft = offset;
            row.schedule();
        } );
        previous.forEach( function( section ) {
            if ( resizeRows ) { resizeRows.unobserve( section.mbaProRow.rail ); }
            section.remove();
        } );
        Array.from( grid.children ).forEach( function( child ) {
            if ( child.classList.contains( 'medbeafgallery-gallery-item' ) ) { child.remove(); }
        } );
        if ( focus && focus.isConnected && document.activeElement !== focus ) { focusElement( focus ); }
    }

    function highlightSpotlight( grid, context, cards ) {
        if ( context.options.layout !== 'spotlight' ) { return; }
        cards.forEach( function( card, index ) {
            card.classList.toggle( 'mba-pro-featured-card', index === 0 );
            var old = card.querySelector( '.mba-pro-featured-badge' );
            if ( index !== 0 && old ) { old.remove(); }
            if ( index === 0 && !old ) {
                var media = card.querySelector( '.mba-pro-card-media' );
                if ( media ) { badge( card, media, label( context.options, 'featured' ), 'mba-pro-featured-badge' ); }
            }
        } );
    }

    function postRender( root ) {
        var context = readContext( root );
        var grid = root && root.querySelector( '.medbeafgallery-gallery-grid' );
        if ( !context || !grid ) { return; }
        var byId = new Map();
        allItems().forEach( function( item ) { byId.set( String( item.id ), item ); } );
        var cards = Array.from( grid.querySelectorAll( '.medbeafgallery-gallery-item' ) );
        cards.forEach( function( card, index ) {
            decorateCard( card, byId.get( String( card.dataset.id ) ) || card.mbaProLayoutItem, context );
            if ( context.options.motion === 'lively' ) {
                card.style.setProperty( '--mba-pro-entrance-delay', Math.min( index, 8 ) * 45 + 'ms' );
            }
        } );
        highlightSpotlight( grid, context, cards );
        if ( context.options.layout === 'rows' ) { renderRows( grid, context, cards ); }
        root.dispatchEvent( new CustomEvent( 'mba:layoutsRendered', { detail: { context: context, grid: grid, cards: cards } } ) );
        var visible = new Set();
        cards.forEach( function( card ) { visible.add( String( card.dataset.id ) ); } );
        announce( context, label( context.options, 'resultsStatus', [ visible.size, filteredItems().length ] ) );
    }

    function applyWindow( element, context ) {
        if ( !context ) { return; }
        var options = context.options;
        element.classList.add( 'mba-pro-layout-window' );
        presets.forEach( function( preset ) { element.classList.toggle( 'mba-pro-preset-' + preset, options.preset === preset ); } );
        element.classList.toggle( 'mba-pro-preset-active', options.preset !== 'default' );
        element.setAttribute( 'data-mba-pro-layout-dark', isDark( options ) ? 'true' : 'false' );
        windowContexts.set( element, context );
    }

    function tagWindows( context ) {
        document.querySelectorAll( windowSelector ).forEach( function( element ) { applyWindow( element, context ); } );
    }

    function installWrappers() {
        if ( typeof window.createGalleryItem === 'function' && !window.createGalleryItem.mbaProLayouts ) {
            var previousCard = window.createGalleryItem;
            var cardWrapper = function( item ) {
                var card = previousCard.apply( this, arguments );
                return decorateCard( card, item, readContext( renderRoot || primaryRoot() ) );
            };
            cardWrapper.mbaProLayouts = true;
            window.createGalleryItem = cardWrapper;
        }
        if ( typeof window.renderGalleryItems === 'function' && !window.renderGalleryItems.mbaProLayouts ) {
            var previousRender = window.renderGalleryItems;
            var renderWrapper = function() {
                var previousRoot = renderRoot;
                renderRoot = primaryRoot();
                // Disconnect removed row rails before core clears the grid.
                if ( !arguments[0] && resizeRows && renderRoot ) {
                    renderRoot.querySelectorAll( '.mba-pro-row-rail' ).forEach( function( rail ) { resizeRows.unobserve( rail ); } );
                }
                try {
                    var result = previousRender.apply( this, arguments );
                    postRender( renderRoot );
                    return result;
                } finally {
                    renderRoot = previousRoot;
                }
            };
            renderWrapper.mbaProLayouts = true;
            window.renderGalleryItems = renderWrapper;
        }
        if ( typeof window.openModal === 'function' && !window.openModal.mbaProLayouts ) {
            var previousOpen = window.openModal;
            var openWrapper = function() {
                var focusedRoot = document.activeElement && document.activeElement.closest( '.mba-pro-layouts' );
                var context = readContext( focusedRoot || lastOpenRoot || primaryRoot() );
                document.querySelectorAll( '.mba-pro-pair-notice' ).forEach( function( notice ) { notice.remove(); } );
                tagWindows( context );
                var result = previousOpen.apply( this, arguments );
                tagWindows( context );
                return result;
            };
            openWrapper.mbaProLayouts = true;
            window.openModal = openWrapper;
        }
    }

    function syncDark() {
        roots.forEach( function( root ) { var context = contexts.get( root ); if ( context ) { applyRoot( context ); } } );
        document.querySelectorAll( '.mba-pro-layout-window' ).forEach( function( element ) {
            applyWindow( element, windowContexts.get( element ) || readContext( lastOpenRoot || primaryRoot() ) );
        } );
    }

    function init() {
        document.querySelectorAll( '.medbeafgallery-container' ).forEach( readContext );
        installWrappers(); // Capture decorators installed during DOMContentLoaded.
        var root = primaryRoot();
        if ( root && root.querySelector( '.medbeafgallery-gallery-item' ) ) { postRender( root ); }
        tagWindows( readContext( root ) );
        roots.forEach( function( gallery ) {
            var context = contexts.get( gallery );
            if ( context.options.motion === 'lively' && context.options.layout !== 'uncropped' ) {
                gallery.appendChild( node( 'p', 'mba-pro-motion-note', label( context.options, 'hoverFit' ) ) );
            }
        } );
        if ( 'MutationObserver' in window ) {
            new MutationObserver( function( records ) {
                records.forEach( function( record ) {
                    record.addedNodes.forEach( function( added ) {
                        if ( added.nodeType !== 1 ) { return; }
                        var context = readContext( lastOpenRoot || primaryRoot() );
                        if ( added.matches( windowSelector ) ) { applyWindow( added, context ); }
                        added.querySelectorAll( windowSelector ).forEach( function( element ) { applyWindow( element, context ); } );
                    } );
                } );
            } ).observe( document.body, { childList: true, subtree: true } );
        }
        if ( darkQuery ) {
            if ( darkQuery.addEventListener ) { darkQuery.addEventListener( 'change', syncDark ); }
            else if ( darkQuery.addListener ) { darkQuery.addListener( syncDark ); }
        }
        if ( !('ResizeObserver' in window) ) {
            var frame = 0;
            window.addEventListener( 'resize', function() {
                if ( frame ) { return; }
                frame = window.requestAnimationFrame( function() {
                    frame = 0;
                    document.querySelectorAll( '.mba-pro-procedure-row' ).forEach( function( section ) { section.mbaProRow.schedule(); } );
                } );
            } );
        }
    }

    // Small additive seam: collections reuse the same cards, rails and controls.
    function registerItemTransform( transform ) {
        var runs = 0;
        function tracked( items ) { runs++; return transform( items ); }
        ( window.medbeafgalleryItemTransforms = window.medbeafgalleryItemTransforms || [] ).push( tracked );
        // Older free versions predate the native seam. Match Discovery's
        // fallback, and never apply the predicate twice when the seam exists.
        if ( typeof window.applyAllFilters === 'function' ) {
            var previous = window.applyAllFilters;
            window.applyAllFilters = function() {
                var before = runs;
                var result = previous.apply( this, arguments );
                var state = engineState();
                if ( before === runs && state && Array.isArray( state.filteredItems ) ) {
                    state.filteredItems = tracked( state.filteredItems );
                    state.totalPages = Math.ceil( state.filteredItems.length / ( state.itemsPerPage || 1 ) );
                }
                return result;
            };
        }
    }
    window.mbaProLayoutRows = { create: createRow, context: readContext, fallback: renderRows, transform: registerItemTransform, format: format };

    document.addEventListener( 'pointermove', function( event ) {
        if ( !rowDrag || event.pointerId !== rowDrag.pointer || !rowDrag.rail.isConnected ) { return; }
        if ( event.buttons === 0 ) { endRowDrag(); return; }
        var delta = event.clientX - rowDrag.startX;
        if ( !rowDrag.moved && Math.abs( delta ) < 6 ) { return; }
        rowDrag.moved = true;
        rowDrag.rail.mbaProSuppressClick = true;
        rowDrag.rail.classList.add( 'mba-pro-row-dragging' );
        rowDrag.rail.scrollLeft = rowDrag.startScroll - delta;
        event.preventDefault();
    }, { passive: false } );

    function endRowDrag() {
        if ( !rowDrag ) { return; }
        var rail = rowDrag.rail;
        rail.classList.remove( 'mba-pro-row-dragging' );
        window.setTimeout( function() { rail.mbaProSuppressClick = false; }, 0 );
        rowDrag = null;
    }
    document.addEventListener( 'pointerup', endRowDrag );
    document.addEventListener( 'pointercancel', endRowDrag );
    window.addEventListener( 'blur', endRowDrag );
    document.addEventListener( 'click', function( event ) {
        var root = event.target.closest && event.target.closest( '.mba-pro-layouts' );
        if ( root ) { lastOpenRoot = root; }
    }, true );
    document.addEventListener( 'medbeafgallery:dataReady', function() {
        installWrappers();
        var root = primaryRoot();
        if ( root ) { postRender( root ); }
    } );
    // Pro installs its classic card decorator on DOMContentLoaded. Install after
    // that callback so we always decorate its finished card, including its pills.
    if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', init ); }
    else { init(); }
})();
