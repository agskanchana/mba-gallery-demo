/**
 * Progress stages in the default case windows.
 *
 * The free plugin's modal (#medbeafgallery-modal, used by the classic layout)
 * and Pro's masonry modal (#mba-pro-mmodal) show a case's before/after pairs
 * only. When the opened case has progress stages — item.timeline from Pro's
 * Progress timeline, three or more photos — this adds a progress timeline under
 * the photo area: a "Progress" header and one stop per stage on a line, the
 * same look as the Pro viewer's timeline (pro-viewer.css "Progress timeline:
 * stops on a line"). Choosing a stop shows that photo, whole, in the photo
 * area; choosing it again (or the header's "Before / After", shown only while
 * a stage is on show) goes back to the comparison.
 *
 * Neither window's code is changed:
 *   - window.openModal is wrapped once, at parse time (this file loads after the
 *     masonry modal and the viewer have installed theirs), to learn which case
 *     is being opened; later wrappers (deep links, Layouts & Style) wrap ours;
 *   - MutationObservers on both windows catch opens, closes and case changes
 *     that do not pass through window.openModal;
 *   - the case is confirmed against the title the window shows before its
 *     stages are used.
 * Pro's own viewer styles have their own timeline; the PHP side loads this file
 * only with the Default case window. Case text is always set as text.
 */
(function () {
    'use strict';

    var options = window.mbaProStagesConfig || {};
    var strings = options.i18n || {};
    // wp_localize_script() sends top-level numbers as strings.
    var MIN_STAGES = Math.max( 2, parseInt( options.minStages, 10 ) || 3 );
    var motionQuery = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : null;
    var ICON_COMPARE = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="12" y1="4" x2="12" y2="20"></line><polyline points="8 10 6 12 8 14"></polyline><polyline points="16 10 18 12 16 14"></polyline></svg>';

    var WINDOWS = [
        {
            kind: 'masonry',
            find: function () { return document.getElementById( 'mba-pro-mmodal' ); },
            isOpen: function ( root ) { return root.classList.contains( 'mba-pro-mmodal-open' ); },
            title: '.mba-pro-mmodal-title',
            close: '.mba-pro-mmodal-close',
            // The strip goes under the stage, the photo layer over the photo.
            stripParent: '.mba-pro-mmodal-main',
            layerParent: '.mba-pro-mmodal-imgwrap',
            stateEl: function ( root ) { return root; },
            exits: '.mba-pro-mmodal-seg, .mba-pro-mmodal-arrow',
            exitKeys: {}
        },
        {
            kind: 'free',
            find: function () { return document.getElementById( 'medbeafgallery-modal' ); },
            isOpen: function ( root ) { return root.classList.contains( 'active' ) && root.getAttribute( 'aria-hidden' ) !== 'true'; },
            title: '#medbeafgallery-case-title',
            close: '.medbeafgallery-modal-close',
            stripParent: '.medbeafgallery-comparison-container',
            layerParent: '.medbeafgallery-image-sets-container',
            stateEl: function ( root ) { return root.querySelector( '.medbeafgallery-comparison-container' ); },
            exits: '.medbeafgallery-control-btn, .medbeafgallery-pair-nav, .medbeafgallery-pair-indicator',
            // gallery.js: 1 / 2 / 3 switch the comparison view.
            exitKeys: { '1': true, '2': true, '3': true }
        }
    ];

    var uid = 0;
    var current = null;
    var lastOpenedId = null;
    var pending = false;
    var decoder = null;

    function t( key ) {
        return typeof strings[ key ] === 'string' ? strings[ key ] : '';
    }

    function fill( template, value ) {
        // A function replacement: "$&" in a label must stay literal.
        return template.indexOf( '%s' ) === -1 ? value : template.replace( '%s', function () { return value; } );
    }

    function reducedMotion() {
        return !!( motionQuery && motionQuery.matches );
    }

    function node( tag, className, text ) {
        var element = document.createElement( tag );
        if ( className ) {
            element.className = className;
        }
        if ( text !== undefined ) {
            element.textContent = text;
        }
        return element;
    }

    // REST titles and alt texts arrive entity-encoded ("&#8211;"). A <textarea>
    // decodes without running any markup (the gallery does the same).
    function decode( value ) {
        if ( value === null || value === undefined ) {
            return '';
        }
        decoder = decoder || document.createElement( 'textarea' );
        decoder.innerHTML = String( value );
        return decoder.value;
    }

    function clean( value ) {
        return String( value === null || value === undefined ? '' : value ).replace( /\s+/g, ' ' ).trim();
    }

    function connected( element ) {
        return !!element && ( element.isConnected !== undefined ? element.isConnected : document.documentElement.contains( element ) );
    }

    /* ── Case data ──────────────────────────────────────────────────────── */

    // gallery.js keeps its data in top-level lexical bindings, which every
    // classic script can read by name (but not through window).
    function itemLists() {
        var lists = [];
        try {
            if ( typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ) {
                lists.push( galleryData );
            }
        } catch ( e ) {}
        if ( Array.isArray( window.galleryData ) ) {
            lists.push( window.galleryData );
        }
        try {
            if ( typeof galleryConfig !== 'undefined' && galleryConfig && Array.isArray( galleryConfig.filteredItems ) ) {
                lists.push( galleryConfig.filteredItems );
            }
        } catch ( e ) {}
        return lists;
    }

    function eachItem( callback ) {
        var seen = {};
        var lists = itemLists();
        for ( var i = 0; i < lists.length; i++ ) {
            for ( var j = 0; j < lists[ i ].length; j++ ) {
                var item = lists[ i ][ j ];
                if ( !item || item.id === undefined || seen[ String( item.id ) ] ) {
                    continue;
                }
                seen[ String( item.id ) ] = true;
                if ( callback( item ) === false ) {
                    return;
                }
            }
        }
    }

    function findItem( id ) {
        if ( id === null || id === undefined || id === '' ) {
            return null;
        }
        var key = String( id );
        var found = null;
        eachItem( function ( item ) {
            if ( String( item.id ) === key ) {
                found = item;
                return false;
            }
            return true;
        } );
        return found;
    }

    function linkedCaseId() {
        try {
            return new URLSearchParams( window.location.search ).get( 'mbcase' );
        } catch ( e ) {
            return null;
        }
    }

    // Both windows print the decoded title (or a stock "Case Study" when empty).
    function titleMatches( item, shown ) {
        var title = clean( decode( item.title ) );
        return !title || !shown || title === shown;
    }

    function resolveItem( win, root ) {
        var heading = root.querySelector( win.title );
        var shown = heading ? clean( heading.textContent ) : '';
        var candidates = [ lastOpenedId ];
        if ( win.kind === 'free' ) {
            try {
                if ( typeof currentItemId !== 'undefined' ) {
                    candidates.push( currentItemId );
                }
            } catch ( e ) {}
        }
        candidates.push( linkedCaseId() );
        for ( var i = 0; i < candidates.length; i++ ) {
            var item = findItem( candidates[ i ] );
            if ( item && titleMatches( item, shown ) ) {
                return item;
            }
        }
        // Last resort: the one case with exactly the title on show.
        if ( !shown ) {
            return null;
        }
        var match = null;
        var count = 0;
        eachItem( function ( candidate ) {
            if ( clean( decode( candidate.title ) ) === shown ) {
                match = candidate;
                count++;
            }
            return count < 2;
        } );
        return count === 1 ? match : null;
    }

    function stagesOf( item ) {
        if ( !item || !Array.isArray( item.timeline ) ) {
            return null;
        }
        var stages = item.timeline.filter( function ( stage ) {
            return stage && typeof stage.image === 'string' && stage.image !== '';
        } );
        return stages.length >= MIN_STAGES ? stages : null;
    }

    function stageLabel( stage, index ) {
        return clean( decode( stage.label ) ) || String( index + 1 );
    }

    function formatDate( iso ) {
        var match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec( iso ) : null;
        if ( !match ) {
            return '';
        }
        var date = new Date( Date.UTC( +match[ 1 ], +match[ 2 ] - 1, +match[ 3 ] ) );
        var format = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
        var locales = [ document.documentElement.lang, options.locale ];
        for ( var i = 0; i < locales.length; i++ ) {
            if ( !locales[ i ] ) {
                continue;
            }
            try {
                return new Intl.DateTimeFormat( locales[ i ], format ).format( date );
            } catch ( e ) {}
        }
        try {
            return new Intl.DateTimeFormat( undefined, format ).format( date );
        } catch ( e ) {
            return iso;
        }
    }

    function viewerShowing() {
        var viewer = window.mbaProViewer;
        try {
            return !!( viewer && typeof viewer.isOpen === 'function' && viewer.isOpen() );
        } catch ( e ) {
            return false;
        }
    }

    function openWindow() {
        for ( var i = 0; i < WINDOWS.length; i++ ) {
            var root = WINDOWS[ i ].find();
            if ( root && WINDOWS[ i ].isOpen( root ) ) {
                return { win: WINDOWS[ i ], root: root };
            }
        }
        return null;
    }

    /* ── Timeline ───────────────────────────────────────────────────────── */

    function preload( url ) {
        if ( url && !preload.done[ url ] ) {
            preload.done[ url ] = true;
            ( new Image() ).src = url;
        }
    }
    preload.done = {};

    // One stop on the line: a dot, the label, the date when there is one.
    function stageButton( stage, index ) {
        var button = node( 'button', 'mba-pro-stages-item' );
        button.type = 'button';
        button.setAttribute( 'data-stage', String( index ) );
        var dot = node( 'span', 'mba-pro-stages-dot' );
        dot.setAttribute( 'aria-hidden', 'true' );
        button.appendChild( dot );
        button.appendChild( node( 'span', 'mba-pro-stages-label', stageLabel( stage, index ) ) );
        var date = formatDate( stage.date );
        if ( date ) {
            var time = node( 'time', 'mba-pro-stages-date', date );
            time.setAttribute( 'datetime', stage.date );
            button.appendChild( time );
        }
        var warm = function () { preload( stage.image ); };
        button.addEventListener( 'pointerenter', warm );
        button.addEventListener( 'focus', warm );
        return button;
    }

    function build( win, root, item, stages, key ) {
        var stripParent = root.querySelector( win.stripParent );
        var layerParent = root.querySelector( win.layerParent );
        var stateEl = win.stateEl( root );
        if ( !stripParent || !layerParent || !stateEl ) {
            return;
        }
        var id = 'mba-pro-stages-' + ( ++uid );

        var strip = node( 'div', 'mba-pro-stages mba-pro-stages-' + win.kind );
        strip.setAttribute( 'role', 'group' );
        strip.setAttribute( 'aria-label', t( 'group' ) );
        strip.setAttribute( 'aria-describedby', id + '-help' );

        // Header: the section title, and "Before / After" while a stage shows.
        var head = node( 'div', 'mba-pro-stages-head' );
        var title = node( 'span', 'mba-pro-stages-title', t( 'title' ) || t( 'group' ) );
        // The group's own name says it already.
        title.setAttribute( 'aria-hidden', 'true' );
        var back = node( 'button', 'mba-pro-stages-back' );
        back.type = 'button';
        back.hidden = true;
        var icon = node( 'span', 'mba-pro-stages-icon' );
        icon.innerHTML = ICON_COMPARE; // A fixed icon; no case data.
        back.appendChild( icon );
        back.appendChild( node( 'span', 'mba-pro-stages-back-text', t( 'compare' ) ) );
        head.appendChild( title );
        head.appendChild( back );

        // The rail scrolls inside the track when its stops do not fit.
        var track = node( 'div', 'mba-pro-stages-track' );
        var rail = node( 'div', 'mba-pro-stages-rail' );
        var buttons = [];
        stages.forEach( function ( stage, index ) {
            var button = stageButton( stage, index );
            buttons.push( button );
            rail.appendChild( button );
        } );
        rail.style.setProperty( '--mba-pro-stages-count', String( stages.length ) );
        track.appendChild( rail );

        var help = node( 'p', 'mba-pro-stages-sr', t( 'help' ) );
        help.id = id + '-help';
        var live = node( 'p', 'mba-pro-stages-sr' );
        live.setAttribute( 'role', 'status' );
        live.setAttribute( 'aria-live', 'polite' );
        live.setAttribute( 'aria-atomic', 'true' );
        strip.appendChild( head );
        strip.appendChild( track );
        strip.appendChild( help );
        strip.appendChild( live );

        // The stage photo, over the window's own photo area.
        var layer = node( 'figure', 'mba-pro-stages-view' );
        layer.hidden = true;
        var photo = document.createElement( 'img' );
        photo.className = 'mba-pro-stages-view-img';
        photo.alt = '';
        photo.decoding = 'async';
        photo.draggable = false;
        var caption = node( 'figcaption', 'mba-pro-stages-view-cap' );
        var capLabel = node( 'span', 'mba-pro-stages-view-label' );
        var capDate = node( 'time', 'mba-pro-stages-view-date' );
        var capNote = node( 'span', 'mba-pro-stages-view-note' );
        caption.appendChild( capLabel );
        caption.appendChild( capDate );
        caption.appendChild( capNote );
        layer.appendChild( photo );
        layer.appendChild( caption );

        stripParent.appendChild( strip );
        layerParent.appendChild( layer );
        stateEl.classList.add( 'mba-pro-stages-on' );

        var state = {
            win: win,
            root: root,
            item: item,
            stages: stages,
            key: key,
            strip: strip,
            track: track,
            rail: rail,
            back: back,
            buttons: buttons,
            live: live,
            layer: layer,
            photo: photo,
            capLabel: capLabel,
            capDate: capDate,
            capNote: capNote,
            stateEl: stateEl,
            active: -1,
            cleanup: []
        };
        current = state;

        track.addEventListener( 'click', function ( event ) {
            var button = event.target.closest ? event.target.closest( '.mba-pro-stages-item' ) : null;
            if ( !button || !track.contains( button ) || current !== state ) {
                return;
            }
            var index = parseInt( button.getAttribute( 'data-stage' ), 10 );
            // Choosing the stage on show again goes back to the comparison.
            choose( index === state.active ? -1 : index, true );
        } );
        track.addEventListener( 'keydown', onStripKey );
        back.addEventListener( 'click', function () {
            if ( current === state ) {
                choose( -1, true );
            }
        } );

        // The layer belongs to us: the window's photo handlers (flip on click,
        // zoom, pair swipes) must not act on presses over it.
        [ 'click', 'dblclick', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'dragstart', 'wheel', 'touchmove' ].forEach( function ( type ) {
            layer.addEventListener( type, function ( event ) { event.stopPropagation(); }, { passive: true } );
        } );
        var swipe = null;
        layer.addEventListener( 'touchstart', function ( event ) {
            event.stopPropagation();
            swipe = event.touches.length === 1 ? { x: event.touches[ 0 ].clientX, y: event.touches[ 0 ].clientY, t: Date.now() } : null;
        }, { passive: true } );
        layer.addEventListener( 'touchend', function ( event ) {
            event.stopPropagation();
            if ( !swipe || event.changedTouches.length !== 1 || current !== state || state.active < 0 ) {
                swipe = null;
                return;
            }
            var dx = event.changedTouches[ 0 ].clientX - swipe.x;
            var dy = event.changedTouches[ 0 ].clientY - swipe.y;
            var quick = Date.now() - swipe.t < 700;
            swipe = null;
            if ( quick && Math.abs( dx ) > 45 && Math.abs( dx ) > Math.abs( dy ) * 1.5 ) {
                var next = state.active + ( ( dx < 0 ) !== isRtl( track ) ? 1 : -1 );
                if ( next >= 0 && next < state.stages.length ) {
                    choose( next, true );
                }
            }
        }, { passive: true } );
        photo.addEventListener( 'load', function () {
            layer.classList.remove( 'is-loading', 'is-missing' );
        } );
        photo.addEventListener( 'error', function () {
            if ( photo.getAttribute( 'src' ) ) {
                layer.classList.remove( 'is-loading' );
                layer.classList.add( 'is-missing' );
            }
        } );

        // The window's own view controls (and pair navigation) bring its view back.
        var onRootClick = function ( event ) {
            if ( current !== state || state.active < 0 || !event.target || !event.target.closest ) {
                return;
            }
            var control = event.target.closest( win.exits );
            if ( control && root.contains( control ) ) {
                choose( -1, false );
            }
        };
        root.addEventListener( 'click', onRootClick, true );
        state.cleanup.push( function () { root.removeEventListener( 'click', onRootClick, true ); } );

        var onResize = function () {
            measure( state );
            updateEdges( state );
        };
        track.addEventListener( 'scroll', function () { updateEdges( state ); }, { passive: true } );
        if ( typeof ResizeObserver === 'function' ) {
            var resizer = new ResizeObserver( onResize );
            resizer.observe( strip );
            resizer.observe( track );
            state.cleanup.push( function () { resizer.disconnect(); } );
        } else {
            window.addEventListener( 'resize', onResize );
            state.cleanup.push( function () { window.removeEventListener( 'resize', onResize ); } );
        }
        onResize();
        if ( win.kind === 'free' ) {
            refitFreeSlider( root );
        }

        choose( -1, false );
    }

    // A soft fade on an edge with more stages beyond it (phones).
    function updateEdges( state ) {
        if ( current !== state ) {
            return;
        }
        var track = state.track;
        var max = track.scrollWidth - track.clientWidth;
        // RTL scrollLeft runs from 0 (start, right) to -max (end, left).
        var pos = Math.abs( track.scrollLeft );
        var before = max > 1 && pos > 1;
        var after = max > 1 && pos < max - 1;
        var rtl = isRtl( track );
        track.classList.toggle( 'is-fade-left', rtl ? after : before );
        track.classList.toggle( 'is-fade-right', rtl ? before : after );
    }

    // The free window's pair navigation and labels are placed from the bottom
    // of the photo area; the CSS lifts them by the strip's height.
    function measure( state ) {
        if ( current === state && state.win.kind === 'free' && connected( state.strip ) ) {
            state.stateEl.style.setProperty( '--mba-pro-stages-h', state.strip.offsetHeight + 'px' );
        }
    }

    // The free slider measures its box once, when it starts. If the strip came
    // or went after that, let it measure again (gallery.js listens for resize).
    function refitFreeSlider( root ) {
        var wrapper = root.querySelector( '.medbeafgallery-before-after-wrapper.active' );
        if ( !wrapper || !wrapper.querySelector( 'cocoen-component' ) ) {
            return;
        }
        window.requestAnimationFrame( function () {
            window.dispatchEvent( new Event( 'resize' ) );
            if ( typeof window.fitCocoenToContainer === 'function' ) {
                try {
                    window.fitCocoenToContainer( wrapper );
                } catch ( e ) {}
            }
        } );
    }

    function isRtl( element ) {
        try {
            return window.getComputedStyle( element ).direction === 'rtl';
        } catch ( e ) {
            return false;
        }
    }

    // Keep a button in view inside the strip without scrolling the page.
    function reveal( state, button ) {
        var track = state.track;
        if ( !button || track.scrollWidth <= track.clientWidth + 1 ) {
            return;
        }
        if ( isRtl( track ) ) {
            if ( button.scrollIntoView ) {
                button.scrollIntoView( { block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' } );
            }
            return;
        }
        // Positions in the track's scroll space (the stops sit in the rail).
        var start = button.getBoundingClientRect().left - track.getBoundingClientRect().left - track.clientLeft + track.scrollLeft;
        var end = start + button.offsetWidth;
        var left = track.scrollLeft;
        var pad = 32; // Clear of the edge fade.
        if ( start - pad < left ) {
            left = start - pad;
        } else if ( end + pad > left + track.clientWidth ) {
            left = end + pad - track.clientWidth;
        } else {
            return;
        }
        left = Math.max( 0, left );
        if ( typeof track.scrollTo === 'function' ) {
            track.scrollTo( { left: left, behavior: reducedMotion() ? 'auto' : 'smooth' } );
        } else {
            track.scrollLeft = left;
        }
    }

    function onStripKey( event ) {
        var state = current;
        if ( !state || event.altKey || event.ctrlKey || event.metaKey ) {
            return; // Alt + arrows still change case in both windows.
        }
        var index = state.buttons.indexOf( document.activeElement );
        if ( index < 0 ) {
            return;
        }
        var step = isRtl( state.track ) ? -1 : 1;
        var next;
        if ( event.key === 'ArrowRight' ) {
            next = index + step;
        } else if ( event.key === 'ArrowLeft' ) {
            next = index - step;
        } else if ( event.key === 'Home' ) {
            next = 0;
        } else if ( event.key === 'End' ) {
            next = state.buttons.length - 1;
        } else {
            return;
        }
        // The windows use these keys for their own pairs; inside the strip they
        // move between stages only.
        event.preventDefault();
        event.stopPropagation();
        next = Math.max( 0, Math.min( state.buttons.length - 1, next ) );
        var button = state.buttons[ next ];
        try {
            button.focus( { preventScroll: true } );
        } catch ( e ) {
            button.focus();
        }
        reveal( state, button );
    }

    function announce( state, message ) {
        state.live.textContent = '';
        window.setTimeout( function () {
            if ( current === state ) {
                state.live.textContent = message;
            }
        }, 60 );
    }

    function setBackdrop( layer, url ) {
        if ( !url ) {
            layer.style.removeProperty( '--mba-pro-stages-backdrop' );
            return;
        }
        var safe = String( url ).replace( /[\r\n]/g, '' ).replace( /"/g, '%22' ).replace( /\\/g, '%5C' );
        layer.style.setProperty( '--mba-pro-stages-backdrop', 'url("' + safe + '")' );
    }

    function choose( index, speak ) {
        var state = current;
        if ( !state || isNaN( index ) || index < -1 || index >= state.stages.length ) {
            return;
        }
        var previous = state.active;
        state.active = index;
        state.buttons.forEach( function ( button, position ) {
            var on = position === index;
            button.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
            if ( on ) {
                button.setAttribute( 'aria-current', 'step' );
            } else {
                button.removeAttribute( 'aria-current' );
            }
            button.classList.toggle( 'is-current', on );
            // Stops before the current one: filled dots, the line filled to here.
            button.classList.toggle( 'is-past', position < index );
        } );
        var last = state.buttons.length - 1;
        state.rail.style.setProperty( '--mba-pro-stages-progress', index > 0 && last > 0 ? String( index / last ) : '0' );
        var showing = index >= 0;
        // The header's "Before / After" is there only while a stage shows. If it
        // had focus, hand it to the stop that was on show (not to the page).
        var backHadFocus = state.back.contains( document.activeElement );
        state.back.hidden = !showing;
        if ( !showing && backHadFocus && state.buttons[ previous ] ) {
            try {
                state.buttons[ previous ].focus( { preventScroll: true } );
            } catch ( e ) {
                state.buttons[ previous ].focus();
            }
        }
        var label = '';
        if ( showing ) {
            var stage = state.stages[ index ];
            label = stageLabel( stage, index );
            var date = formatDate( stage.date );
            state.photo.alt = clean( decode( stage.alt ) ) || label;
            state.layer.classList.remove( 'is-missing' );
            if ( state.photo.getAttribute( 'src' ) !== stage.image ) {
                state.layer.classList.add( 'is-loading' );
                state.photo.src = stage.image;
            } else if ( state.photo.complete && !state.photo.naturalWidth ) {
                // The same photo failed before; no new error event will come.
                state.layer.classList.add( 'is-missing' );
            }
            if ( state.photo.complete && state.photo.naturalWidth > 0 ) {
                state.layer.classList.remove( 'is-loading' );
            }
            state.layer.setAttribute( 'data-missing', t( 'missing' ) );
            setBackdrop( state.layer, stage.thumb || stage.image );
            state.capLabel.textContent = label;
            state.capDate.textContent = date;
            state.capDate.hidden = !date;
            if ( date ) {
                state.capDate.setAttribute( 'datetime', stage.date );
            } else {
                state.capDate.removeAttribute( 'datetime' );
            }
            var note = clean( decode( stage.note ) );
            state.capNote.textContent = note;
            state.capNote.hidden = !note;
            // Neighbours load while this one is looked at.
            [ index - 1, index + 1 ].forEach( function ( near ) {
                if ( state.stages[ near ] ) {
                    preload( state.stages[ near ].image );
                }
            } );
        }
        state.layer.hidden = !showing;
        state.stateEl.classList.toggle( 'mba-pro-stages-showing', showing );
        if ( showing ) {
            reveal( state, state.buttons[ index ] );
        }
        if ( speak ) {
            announce( state, showing ? fill( t( 'showing' ), label ) : t( 'back' ) );
        }
    }

    function teardown() {
        var state = current;
        if ( !state ) {
            return;
        }
        current = null;
        state.cleanup.forEach( function ( fn ) {
            try {
                fn();
            } catch ( e ) {}
        } );
        if ( state.strip.parentNode ) {
            state.strip.parentNode.removeChild( state.strip );
        }
        if ( state.layer.parentNode ) {
            state.layer.parentNode.removeChild( state.layer );
        }
        state.stateEl.classList.remove( 'mba-pro-stages-on', 'mba-pro-stages-showing' );
        state.stateEl.style.removeProperty( '--mba-pro-stages-h' );
        if ( state.win.kind === 'free' && state.win.isOpen( state.root ) ) {
            refitFreeSlider( state.root );
        }
    }

    function intact( state ) {
        return connected( state.strip ) && connected( state.layer );
    }

    /* ── Watching the windows ───────────────────────────────────────────── */

    function refresh( force ) {
        observeWindows();
        var found = viewerShowing() ? null : openWindow();
        var item = found ? resolveItem( found.win, found.root ) : null;
        var stages = stagesOf( item );
        var key = stages ? found.win.kind + ':' + String( item.id ) : '';
        if ( !force && current && stages && current.key === key && current.root === found.root && intact( current ) ) {
            return;
        }
        var hadFocus = !!( current && current.strip.contains( document.activeElement ) );
        teardown();
        if ( stages ) {
            build( found.win, found.root, item, stages, key );
        }
        // Alt + arrow from inside the strip changes case: keep focus in the window.
        if ( hadFocus && found ) {
            var target = current ? current.buttons[ 0 ] : found.root.querySelector( found.win.close );
            if ( target ) {
                try {
                    target.focus( { preventScroll: true } );
                } catch ( e ) {
                    target.focus();
                }
            }
        }
    }

    function safeRefresh( force ) {
        try {
            refresh( force );
        } catch ( e ) {
            if ( window.console && window.console.error ) {
                window.console.error( '[MBA Gallery Pro] Progress stages:', e );
            }
        }
    }

    function schedule() {
        if ( pending ) {
            return;
        }
        pending = true;
        Promise.resolve().then( function () {
            pending = false;
            safeRefresh( false );
        } );
    }

    function observeWindows() {
        if ( typeof MutationObserver !== 'function' ) {
            return;
        }
        WINDOWS.forEach( function ( win ) {
            var root = win.find();
            if ( !root || root.mbaProStagesObserved ) {
                return;
            }
            root.mbaProStagesObserved = true;
            var observer = new MutationObserver( schedule );
            observer.observe( root, { attributes: true, attributeFilter: [ 'class', 'aria-hidden' ] } );
            var heading = root.querySelector( win.title );
            if ( heading ) {
                observer.observe( heading, { childList: true, characterData: true, subtree: true } );
            }
            // gallery.js empties this on every open, taking our photo layer with it.
            var photos = win.kind === 'free' ? root.querySelector( win.layerParent ) : null;
            if ( photos ) {
                observer.observe( photos, { childList: true } );
            }
        } );
    }

    // A stage is on show and the window acts on its own pairs or views
    // (arrows, 1 / 2 / 3 in the free window): give it its photo area back.
    // Arrows pressed inside the strip never get here (it stops them).
    document.addEventListener( 'keydown', function ( event ) {
        var state = current;
        if ( !state || state.active < 0 || !state.win.isOpen( state.root ) ) {
            return;
        }
        var pairKey = ( event.key === 'ArrowLeft' || event.key === 'ArrowRight' ) && !event.altKey;
        if ( pairKey || ( state.win.exitKeys[ event.key ] && !event.altKey && !event.ctrlKey && !event.metaKey ) ) {
            choose( -1, false );
        }
    } );

    function wrapOpen() {
        var inner = window.openModal;
        if ( typeof inner !== 'function' || inner.mbaProStages ) {
            return;
        }
        var wrapped = function ( id ) {
            lastOpenedId = id;
            var result = inner.apply( this, arguments );
            // Synchronously: the free slider measures its box a frame later.
            safeRefresh( true );
            return result;
        };
        wrapped.mbaProStages = true;
        window.openModal = wrapped;
    }

    wrapOpen();
    observeWindows();
    // The masonry window is built on its first open.
    if ( typeof MutationObserver === 'function' && document.body ) {
        var bodyObserver = new MutationObserver( function () {
            var masonry = WINDOWS[ 0 ].find();
            if ( masonry ) {
                bodyObserver.disconnect();
                observeWindows();
                schedule();
            }
        } );
        bodyObserver.observe( document.body, { childList: true } );
    }
    document.addEventListener( 'DOMContentLoaded', function () {
        observeWindows();
        schedule();
    } );
    document.addEventListener( 'medbeafgallery:dataReady', schedule );

    window.mbaProStages = {
        refresh: function () { safeRefresh( true ); },
        isShowing: function () { return !!( current && current.active >= 0 ); }
    };
}());
