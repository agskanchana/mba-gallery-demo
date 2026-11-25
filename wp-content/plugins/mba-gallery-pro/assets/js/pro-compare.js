/** Persistent two-case selections; progressively decorates every gallery layout. */
(function() {
    'use strict';
    if ( window.mbaProCompareLoaded ) { return; }
    window.mbaProCompareLoaded = true;
    var strings = window.mbaProCompare || {};
    var config = window.medbeafgalleryGalleryConfig || {};
    var contexts = new WeakMap();
    var roots = [];
    var serial = 0;
    var active = null;
    var trayOwner = null;
    var trayFrame = 0;
    var template = document.createElement( 'template' );
    var cardSelector = '.medbeafgallery-gallery-item[data-id], .mba-pro-mcard[data-id], .mba-pro-case-card[data-id]';
    function plain( value ) { template.innerHTML = typeof value === 'string' || typeof value === 'number' ? String( value ) : ''; return ( template.content.textContent || '' ).trim(); }
    function t( key, args ) { var index = 0; return String( strings[key] || '' ).replace( /%(?:(\d+)\$)?s/g, function( match, n ) { return String( ( args || [] )[n ? Number( n ) - 1 : index++] ?? '' ); } ); }
    function node( tag, cls, value ) { var el = document.createElement( tag ); if ( cls ) { el.className = cls; } if ( value !== undefined ) { el.textContent = value; } return el; }
    function button( value, cls, action ) { var el = node( 'button', cls, value ); el.type = 'button'; el.addEventListener( 'click', action ); return el; }
    function data() { return typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ? galleryData : ( window.galleryData || [] ); }
    function url( value ) { try { var parsed = new URL( value || '', document.baseURI ); return value && /^https?:$/.test( parsed.protocol ) ? parsed.href : ''; } catch ( error ) { return ''; } }
    function image( src, alt, cls ) {
        var safe = url( src );
        if ( !safe ) { return node( 'span', 'mba-pro-compare-missing', t( 'missing' ) ); }
        var el = node( 'img', cls ); el.src = safe; el.alt = plain( alt ); el.loading = 'lazy'; el.decoding = 'async'; el.draggable = false; return el;
    }
    function sideLabel( side ) { return plain( config[side + 'Label'] || config[side + 'Text'] ) || t( side ); }
    function category( item ) { return Array.isArray( item.categories ) && item.categories.length ? item.categories.map( function( c ) { return plain( c.name || c.slug ); } ).join( ', ' ) : plain( item.categoryName || item.category ); }
    function dateLabel( value ) {
        if ( typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test( value ) ) { return ''; }
        var parsed = new Date( value + 'T00:00:00Z' );
        return !isNaN( parsed ) && parsed.toISOString().slice( 0, 10 ) === value ? parsed.toLocaleDateString( document.documentElement.lang || undefined, { timeZone: 'UTC' } ) : '';
    }
    function dates( item ) {
        var values = [];
        [ 'before', 'after' ].forEach( function( side ) { var date = dateLabel( item[side + 'Date'] ); if ( date ) { values.push( sideLabel( side ) + ': ' + date ); } } );
        // Only explicit extra photo dates. Existing item.timeline[0].date can
        // be the treatment date, so it is deliberately not a photo-date source.
        var stages = item.journey && item.journey.stages;
        if ( Array.isArray( stages ) ) { stages.forEach( function( stage ) { var date = dateLabel( stage.date ); if ( date ) { values.push( plain( stage.label ) + ': ' + date ); } } ); }
        return values.join( '; ' );
    }
    function details( cases ) {
        var definitions = Array.isArray( config.proFilterDefs ) ? config.proFilterDefs : [];
        var rows = [ { key: 'treatment', label: t( 'treatment' ), value: category } ];
        [ 'duration', 'recovery', 'results' ].forEach( function( key ) {
            if ( Array.isArray( config.enabledDetails ) && config.enabledDetails.indexOf( key ) === -1 ) { return; }
            if ( !cases.some( function( item ) { return plain( item[key] ); } ) ) { return; }
            var def = definitions.find( function( entry ) { return entry && entry.name === key; } );
            rows.push( { key: key, label: def ? plain( def.label ) : t( key ), value: function( item ) { return plain( item[key] ); } } );
        } );
        definitions.filter( function( def ) { return def && !def.standard && def.name; } ).forEach( function( def ) {
            if ( cases.some( function( item ) { return item.proFilters && plain( item.proFilters[def.name] ); } ) ) {
                rows.push( { key: def.name, label: plain( def.label ), value: function( item ) { return item.proFilters && plain( item.proFilters[def.name] ); } } );
            }
        } );
        rows.push( { key: 'doctor', label: t( 'doctor' ), value: function( item ) {
            var doctors = Array.isArray( item.doctors ) && item.doctors.length ? item.doctors : ( item.doctor ? [ item.doctor ] : [] );
            return doctors.map( function( doctor ) { return plain( doctor.name ); } ).filter( Boolean ).join( ', ' );
        } } );
        if ( cases.some( function( item ) { return dates( item ); } ) ) { rows.push( { key: 'dates', label: t( 'dates' ), value: dates } ); }
        return rows;
    }
    function focusable( dialog ) {
        return Array.from( dialog.querySelectorAll( 'button, input, a[href], select, textarea, [tabindex]' ) ).filter( function( el ) { return !el.disabled && el.tabIndex >= 0 && !el.closest( '[hidden], [inert]' ) && el.getClientRects().length; } );
    }
    function close( context ) {
        if ( !context.dialog ) { return; }
        var dialog = context.dialog;
        context.dialog = null;
        if ( typeof dialog.close === 'function' && dialog.open ) { dialog.close(); }
        dialog.remove();
        if ( active === context ) { active = null; }
        var target = context.returnFocus && context.returnFocus.isConnected ? context.returnFocus : context.compare;
        target.focus( { preventScroll: true } );
    }
    function open( context ) {
        if ( context.picked.size !== 2 ) { return; }
        if ( active ) { close( active ); }
        active = context;
        context.returnFocus = document.activeElement;
        var cases = Array.from( context.picked.values() );
        var rows = details( cases );
        var dialog = node( 'dialog', 'mba-pro-compare-dialog' );
        context.dialog = dialog;
        dialog.setAttribute( 'role', 'dialog' ); dialog.setAttribute( 'aria-modal', 'true' );
        var titleId = 'mba-pro-compare-title-' + ( ++serial );
        dialog.setAttribute( 'aria-labelledby', titleId );
        var panel = node( 'div', 'mba-pro-compare-panel' );
        var header = node( 'div', 'mba-pro-compare-header' );
        var title = node( 'h2', '', t( 'title' ) ); title.id = titleId;
        header.appendChild( title ); header.appendChild( button( t( 'close' ), 'mba-pro-compare-close', function() { close( context ); } ) );
        panel.appendChild( header );
        var tabs = node( 'div', 'mba-pro-compare-tabs' ); tabs.setAttribute( 'role', 'group' ); tabs.setAttribute( 'aria-label', t( 'title' ) );
        var columns = node( 'div', 'mba-pro-compare-columns' );
        var tabButtons = [];
        cases.forEach( function( item, index ) {
            var letter = index === 0 ? 'A' : 'B';
            var column = node( 'section', 'mba-pro-compare-case' );
            column.dataset.slot = String( index );
            var headingId = 'mba-pro-compare-case-' + serial + '-' + index;
            var heading = node( 'h3', 'mba-pro-compare-case-title', plain( item.title ) ); heading.id = headingId;
            column.setAttribute( 'aria-labelledby', headingId );
            column.appendChild( heading );
            var tab = button( letter, '', function() {
                dialog.dataset.active = String( index );
                tabButtons.forEach( function( el, n ) { el.setAttribute( 'aria-pressed', String( index === n ) ); } );
            } );
            tab.setAttribute( 'aria-label', t( 'case', [ letter, plain( item.title ) ] ) );
            tab.setAttribute( 'aria-controls', headingId );
            tab.setAttribute( 'aria-pressed', String( index === 0 ) );
            tabs.appendChild( tab ); tabButtons.push( tab );
            var media = node( 'div', 'mba-pro-compare-photo' );
            var switches = node( 'div', 'mba-pro-compare-switch' );
            switches.setAttribute( 'role', 'group' ); switches.setAttribute( 'aria-label', plain( item.title ) );
            var sides = [];
            function showSide( side ) {
                media.replaceChildren( image( item[side + 'Thumb'] || item[side + 'Img'], item[side + 'Alt'] || sideLabel( side ) + ' – ' + plain( item.title ) ) );
                sides.forEach( function( el ) { el.setAttribute( 'aria-pressed', String( el.dataset.side === side ) ); } );
            }
            [ 'before', 'after' ].forEach( function( side ) { var el = button( sideLabel( side ), '', function() { showSide( side ); } ); el.dataset.side = side; sides.push( el ); switches.appendChild( el ); } );
            showSide( 'after' );
            column.appendChild( media ); column.appendChild( switches );
            var dl = node( 'dl', 'mba-pro-compare-details' );
            rows.forEach( function( row ) {
                var pair = node( 'div', 'mba-pro-compare-detail' ); pair.dataset.key = row.key;
                pair.appendChild( node( 'dt', '', row.label ) ); pair.appendChild( node( 'dd', '', row.value( item ) || t( 'unknown' ) ) ); dl.appendChild( pair );
            } );
            column.appendChild( dl ); columns.appendChild( column );
        } );
        dialog.dataset.active = '0';
        panel.appendChild( tabs ); panel.appendChild( columns ); dialog.appendChild( panel ); context.root.appendChild( dialog );
        dialog.addEventListener( 'cancel', function( event ) { event.preventDefault(); close( context ); } );
        dialog.addEventListener( 'click', function( event ) { if ( event.target === dialog ) { close( context ); } } );
        dialog.addEventListener( 'close', function() { if ( context.dialog ) { close( context ); } } );
        if ( typeof dialog.showModal === 'function' ) { dialog.showModal(); } else { dialog.setAttribute( 'open', '' ); }
        dialog.querySelector( 'button' ).focus( { preventScroll: true } );
        // Align the same detail rows despite unequal titles, notes or line wraps.
        function align() {
            if ( !dialog.isConnected ) { return; }
            if ( window.innerWidth < 700 ) {
                columns.querySelectorAll( '.mba-pro-compare-case-title, .mba-pro-compare-detail' ).forEach( function( el ) { el.style.removeProperty( 'min-height' ); } );
                return;
            }
            var titles = columns.querySelectorAll( '.mba-pro-compare-case-title' );
            titles.forEach( function( el ) { el.style.removeProperty( 'min-height' ); } );
            var height = Math.max.apply( null, Array.from( titles ).map( function( el ) { return el.getBoundingClientRect().height; } ) );
            titles.forEach( function( el ) { el.style.setProperty( 'min-height', height + 'px', 'important' ); } );
            rows.forEach( function( row, index ) {
                var pairs = Array.from( columns.querySelectorAll( '.mba-pro-compare-details' ) ).map( function( el ) { return el.children[index]; } );
                pairs.forEach( function( el ) { el.style.removeProperty( 'min-height' ); } );
                var max = Math.max.apply( null, pairs.map( function( el ) { return el.getBoundingClientRect().height; } ) );
                pairs.forEach( function( el ) { el.style.setProperty( 'min-height', max + 'px', 'important' ); } );
            } );
        }
        if ( window.ResizeObserver ) { var observer = new ResizeObserver( align ); observer.observe( panel ); dialog.addEventListener( 'close', function() { observer.disconnect(); }, { once: true } ); }
        window.requestAnimationFrame( align );
    }
    function syncChecks( context ) {
        context.grid.querySelectorAll( '.mba-pro-compare-check' ).forEach( function( input ) {
            var card = input.closest( cardSelector );
            var id = card && card.dataset.id;
            var on = context.picked.has( String( id ) );
            input.checked = on; input.disabled = !on && context.picked.size >= 2;
            if ( card ) { card.classList.toggle( 'mba-pro-compare-selected', on ); }
        } );
    }
    // Anchor the tray to the visible gallery, including themes whose body
    // overflow creates a separate scroll container and defeats sticky bottom.
    function positionTrays() {
        trayFrame = 0;
        var visible = roots.filter( function( context ) {
            var rect = context.root.getBoundingClientRect();
            context.trayRect = rect;
            return context.picked.size && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        } );
        var owner = visible.indexOf( trayOwner ) !== -1 ? trayOwner : visible[0];
        roots.forEach( function( context ) {
            context.tray.hidden = context !== owner;
            context.space.hidden = context.picked.size === 0;
            if ( context !== owner ) { context.root.style.setProperty( '--mbc-tray-clearance', '0px' ); }
            if ( context !== owner ) { return; }
            var rect = context.trayRect;
            var style = getComputedStyle( context.root );
            var padding = parseFloat( style.paddingLeft ) || 0;
            var width = Math.min( Math.max( 0, rect.width - padding - ( parseFloat( style.paddingRight ) || 0 ) ), window.innerWidth - 24 );
            var left = Math.max( 12, Math.min( rect.left + padding, window.innerWidth - width - 12 ) );
            context.tray.style.setProperty( '--mbc-tray-left', left + 'px' );
            context.tray.style.setProperty( '--mbc-tray-width', width + 'px' );
            context.tray.style.setProperty( '--mbc-tray-bottom', Math.max( 12, window.innerHeight - rect.bottom + 12 ) + 'px' );
            var clearance = context.tray.getBoundingClientRect().height + 24 + 'px';
            context.space.style.setProperty( 'height', clearance, 'important' );
            context.root.style.setProperty( '--mbc-tray-clearance', clearance );
        } );
    }
    function scheduleTrays() {
        if ( !trayFrame ) { trayFrame = window.requestAnimationFrame( positionTrays ); }
    }
    function tray( context ) {
        context.tray.hidden = context.picked.size === 0;
        context.count.textContent = t( 'count', [ context.picked.size ] );
        context.compare.disabled = context.picked.size !== 2;
        context.slots.replaceChildren();
        context.picked.forEach( function( item, id ) {
            var slot = node( 'div', 'mba-pro-compare-slot' );
            slot.appendChild( image( item.afterThumb || item.afterImg || item.beforeThumb || item.beforeImg, '', '' ) );
            slot.appendChild( node( 'span', '', plain( item.title ) ) );
            var remove = button( '×', '', function() {
                context.picked.delete( id ); tray( context );
                var target = context.picked.size ? context.clear : context.grid.querySelector( '.mba-pro-compare-check' );
                if ( target ) { target.focus( { preventScroll: true } ); }
            } );
            remove.setAttribute( 'aria-label', t( 'remove', [ plain( item.title ) ] ) ); slot.appendChild( remove ); context.slots.appendChild( slot );
        } );
        syncChecks( context );
        if ( context.picked.size ) { trayOwner = context; }
        scheduleTrays();
    }
    function decorate( context ) {
        var lookup = new Map(); data().forEach( function( item ) { lookup.set( String( item.id ), item ); } );
        context.grid.querySelectorAll( cardSelector ).forEach( function( card ) {
            var item = lookup.get( String( card.dataset.id ) ) || card.mbaProLayoutItem;
            if ( !item ) { return; }
            var label = card.querySelector( 'label.mba-pro-compare-label' );
            if ( !label ) {
                label = node( 'label', 'mba-pro-compare-label' );
                var input = node( 'input', 'mba-pro-compare-check' ); input.type = 'checkbox';
                label.appendChild( input ); label.appendChild( node( 'span', '', t( 'compare' ) ) );
                // Keep native label/checkbox behaviour; isolate card open/hold handlers.
                [ 'click', 'pointerdown', 'mousedown', 'touchstart', 'keydown' ].forEach( function( type ) { label.addEventListener( type, function( event ) { event.stopPropagation(); } ); } );
                input.addEventListener( 'change', function() {
                    var current = input.closest( cardSelector ); var id = current && String( current.dataset.id );
                    var selected = data().find( function( entry ) { return String( entry.id ) === id; } );
                    if ( !selected ) { return; }
                    if ( input.checked && context.picked.size < 2 ) { context.picked.set( id, selected ); } else if ( !input.checked ) { context.picked.delete( id ); }
                    tray( context );
                } );
                var host = card.querySelector( '.mba-pro-journey-info, .mba-pro-story-info, .mba-pro-mcard-body, .medbeafgallery-gallery-item-info' ) || card;
                // Photo cards hide their caption (the title is on the photo): under the photo instead.
                if ( card.classList.contains( 'mba-pro-photo-card' ) && !card.classList.contains( 'mba-pro-editorial-card' ) ) {
                    host = card;
                    label.classList.add( 'mba-pro-compare-label-below' );
                }
                host.appendChild( label );
            }
            label.querySelector( 'input' ).setAttribute( 'aria-label', t( 'select', [ plain( item.title ) ] ) );
        } );
        syncChecks( context );
    }
    function init() {
        document.querySelectorAll( '.medbeafgallery-container[data-mba-pro-layouts]' ).forEach( function( root ) {
            if ( contexts.has( root ) ) { return; }
            var options;
            try { options = JSON.parse( root.getAttribute( 'data-mba-pro-layouts' ) ); } catch ( error ) { return; }
            if ( !options || options.compare !== 'on' ) { return; }
            var grid = root.querySelector( '#medbeafgallery-gallery-grid, .medbeafgallery-gallery-grid' ); if ( !grid ) { return; }
            root.classList.add( 'mba-pro-compare' );
            var context = { root: root, grid: grid, picked: new Map(), dialog: null };
            context.space = node( 'div', 'mba-pro-compare-space' ); context.space.hidden = true;
            context.space.setAttribute( 'aria-hidden', 'true' ); root.appendChild( context.space );
            context.tray = node( 'aside', 'mba-pro-compare-tray' ); context.tray.hidden = true; context.tray.setAttribute( 'aria-label', t( 'title' ) );
            context.count = node( 'p', 'mba-pro-compare-count', t( 'count', [ 0 ] ) ); context.count.setAttribute( 'role', 'status' );
            context.slots = node( 'div', 'mba-pro-compare-slots' );
            context.compare = button( t( 'compare' ), 'mba-pro-compare-open', function() { open( context ); } ); context.compare.disabled = true;
            context.clear = button( t( 'clear' ), 'mba-pro-compare-clear', function() { context.picked.clear(); tray( context ); var first = grid.querySelector( '.mba-pro-compare-check' ); if ( first ) { first.focus( { preventScroll: true } ); } } );
            var help = node( 'p', 'mba-pro-compare-help', t( 'help' ) );
            context.tray.appendChild( context.count ); context.tray.appendChild( context.slots ); context.tray.appendChild( context.compare ); context.tray.appendChild( context.clear ); context.tray.appendChild( help ); root.appendChild( context.tray );
            contexts.set( root, context ); roots.push( context );
            if ( window.ResizeObserver ) { new ResizeObserver( scheduleTrays ).observe( root ); }
            var scheduled = false;
            function schedule() { if ( scheduled ) { return; } scheduled = true; window.requestAnimationFrame( function() { scheduled = false; decorate( context ); } ); }
            new MutationObserver( schedule ).observe( grid, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'data-id' ] } );
            root.addEventListener( 'mba-pro:cases-rendered', schedule );
            decorate( context );
        } );
    }
    window.addEventListener( 'scroll', scheduleTrays, { passive: true, capture: true } );
    window.addEventListener( 'resize', scheduleTrays );
    document.addEventListener( 'keydown', function( event ) {
        if ( !active || !active.dialog ) { return; }
        var context = active;
        if ( event.key === 'Escape' ) { event.preventDefault(); event.stopImmediatePropagation(); close( context ); return; }
        if ( event.key === 'Tab' ) {
            var list = focusable( context.dialog );
            var first = list[0]; var last = list[list.length - 1];
            if ( !first ) { event.preventDefault(); return; }
            if ( event.shiftKey && ( document.activeElement === first || !context.dialog.contains( document.activeElement ) ) ) { event.preventDefault(); last.focus(); }
            else if ( !event.shiftKey && ( document.activeElement === last || !context.dialog.contains( document.activeElement ) ) ) { event.preventDefault(); first.focus(); }
        }
    }, true );
    document.addEventListener( 'focusin', function( event ) { if ( active && active.dialog && !active.dialog.contains( event.target ) ) { var first = focusable( active.dialog )[0]; if ( first ) { first.focus(); } } } );
    document.addEventListener( 'medbeafgallery:dataReady', function() { init(); roots.forEach( decorate ); } );
    if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', init ); } else { init(); }
})();
