/* global galleryData, galleryConfig */
(function() {
    'use strict';
    var contexts = [];
    var ready = false;
    var navigating = false;
    function el( tag, cls, text ) {
        var node = document.createElement( tag );
        if ( cls ) { node.className = cls; }
        if ( text !== undefined ) { node.textContent = text; }
        return node;
    }
    function fmt( text, value ) { return String( text || '' ).replace( /%(?:1\$)?s/g, String( value ) ); }
    function button( text, callback, cls ) {
        var node = el( 'button', 'mba-pro-organise-button ' + ( cls || '' ), text );
        node.type = 'button';
        node.addEventListener( 'click', callback );
        return node;
    }
    function items() { return typeof galleryData !== 'undefined' && Array.isArray( galleryData ) ? galleryData : []; }
    function state() { return typeof galleryConfig !== 'undefined' ? galleryConfig : {}; }
    function url( value ) {
        try { var parsed = new URL( value, document.baseURI ); return value && /^https?:$/.test( parsed.protocol ) ? parsed.href : ''; } catch ( error ) { return ''; }
    }
    function photo( src, alt, cls ) {
        if ( !url( src ) ) { return null; }
        var image = el( 'img', cls ); image.src = url( src ); image.alt = alt || ''; image.loading = 'lazy'; image.decoding = 'async'; return image;
    }
    function category( ctx, slug ) { return ctx.data.categories.find( function( cat ) { return cat.slug === slug; } ); }
    function matches( ctx, slugs, item ) {
        var key = slugs.join( '|' );
        var wanted = ctx.matchers.get( key );
        if ( !wanted ) {
            wanted = new Set( slugs );
            var changed = true;
            while ( changed ) {
                changed = false;
                ctx.data.categories.forEach( function( cat ) {
                    var parent = ctx.byId.get( cat.parent );
                    if ( parent && wanted.has( parent.slug ) && !wanted.has( cat.slug ) ) { wanted.add( cat.slug ); changed = true; }
                } );
            }
            ctx.matchers.set( key, wanted );
        }
        return wanted.has( item.category ) || ( item.categories || [] ).some( function( cat ) { return wanted.has( cat.slug ); } );
    }
    function doctorMatches( item, slug ) {
        return ( item.doctors || ( item.doctor ? [ item.doctor ] : [] ) ).some( function( doctor ) { return doctor.slug === slug; } );
    }
    function count( ctx, list ) { return fmt( ctx.s[ list.length === 1 ? 'case' : 'cases' ], list.length ); }
    function render() { if ( ready && typeof window.renderGalleryItems === 'function' ) { window.renderGalleryItems(); } }
    function selectCategory( ctx, slug ) {
        var tile = Array.from( ctx.root.querySelectorAll( '.medbeafgallery-carousel-item[data-id]' ) ).find( function( item ) {
            return item.dataset.id === slug || ( slug === 'all' && item.dataset.id === 'ba_category_all' );
        } );
        navigating = true;
        if ( tile ) { tile.click(); }
        else {
            // Hidden category bars and child terms still use the core predicate.
            state().currentCategory = slug; state().currentChildCategory = '';
            render();
        }
        navigating = false;
    }
    function write( ctx, push ) {
        if ( ctx.index !== 0 ) { return; }
        var next = new URL( location.href );
        [ 'mbcat', 'mbhub', 'mbconcern', 'mbdoctor' ].forEach( function( key ) { next.searchParams.delete( key ); } );
        if ( ctx.category && ctx.category !== 'all' ) { next.searchParams.set( 'mbcat', ctx.category ); }
        if ( ctx.mode === 'hub' && ctx.open && ctx.category === 'all' ) { next.searchParams.set( 'mbhub', 'all' ); }
        if ( ctx.concern ) { next.searchParams.set( 'mbconcern', ctx.concern ); }
        if ( ctx.doctor ) { next.searchParams.set( 'mbdoctor', ctx.doctor ); }
        if ( next.href !== location.href ) { try { history[ push ? 'pushState' : 'replaceState' ]( history.state, '', next ); } catch ( error ) {} }
    }
    function focusHeading( ctx ) {
        var headings = ctx.host.querySelectorAll( '.mba-pro-organise-header h2' );
        var heading = headings[ headings.length - 1 ];
        if ( heading ) { heading.tabIndex = -1; heading.focus( { preventScroll: true } ); }
    }
    function choose( ctx, slug ) {
        ctx.open = true; ctx.category = slug || 'all';
        write( ctx, true );
        selectCategory( ctx, ctx.category );
        update( ctx ); focusHeading( ctx );
    }
    function link( text, href ) {
        if ( !url( href ) ) { return null; }
        var node = el( 'a', 'mba-pro-organise-button', text ); node.href = url( href ); return node;
    }
    function booking( ctx, host ) { var node = link( ctx.s.book, ctx.data.booking ); if ( node ) { host.appendChild( node ); } }
    function chips( ctx, host, cats, base, allSlug ) {
        var wrap = el( 'div', 'mba-pro-organise-chips' );
        var all = button( ctx.s.all + ' · ' + base.length, function() { choose( ctx, allSlug || 'all' ); } );
        all.setAttribute( 'aria-pressed', String( ctx.category === ( allSlug || 'all' ) ) ); wrap.appendChild( all );
        cats.forEach( function( cat ) {
            var total = base.filter( function( item ) { return matches( ctx, [ cat.slug ], item ); } ).length;
            if ( !total ) { return; }
            var chip = button( cat.name + ' · ' + total, function() { choose( ctx, cat.slug ); } );
            chip.setAttribute( 'aria-pressed', String( ctx.category === cat.slug ) ); wrap.appendChild( chip );
        } );
        host.appendChild( wrap );
    }
    function title( host, text, intro ) {
        host.appendChild( el( 'h2', '', text ) );
        if ( intro ) { host.appendChild( el( 'p', 'mba-pro-organise-intro', intro ) ); }
    }
    var ARROW = '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var BACK = '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
    function icon( node, svg, after ) {
        var holder = document.createElement( 'span' ); holder.className = 'mba-pro-organise-icon'; holder.innerHTML = svg;
        if ( after ) { node.appendChild( holder ); } else { node.insertBefore( holder, node.firstChild ); }
        return node;
    }
    // A before | after pair: the clearest way to say what a treatment card leads to.
    function pairCover( ctx, item ) {
        var pair = el( 'span', 'mba-pro-organise-pair' );
        [ [ item.beforeThumb || item.beforeImg, item.beforeAlt, ctx.s.before ], [ item.afterThumb || item.afterImg, item.afterAlt, ctx.s.after ] ].forEach( function( side ) {
            var half = el( 'span', 'mba-pro-organise-half' );
            var img = photo( side[0], side[1] || '', '' );
            if ( img ) { half.appendChild( img ); }
            half.appendChild( el( 'span', 'mba-pro-organise-tag', side[2] ) );
            pair.appendChild( half );
        } );
        return pair;
    }
    // Placeholder cards while the gallery's data loads (the hub replaces the grid).
    function hubSkeleton( ctx ) {
        var header = el( 'div', 'mba-pro-organise-header' ); title( header, ctx.s.hub, ctx.s.hubIntro ); ctx.host.appendChild( header );
        var cards = el( 'div', 'mba-pro-organise-cards is-loading' ); cards.setAttribute( 'aria-hidden', 'true' );
        for ( var i = 0; i < 6; i++ ) { var card = el( 'div', 'mba-pro-organise-treatment mba-pro-organise-ghost' ); card.appendChild( el( 'span', 'mba-pro-organise-pair' ) ); card.appendChild( el( 'span', 'mba-pro-organise-ghost-line' ) ); card.appendChild( el( 'span', 'mba-pro-organise-ghost-line is-short' ) ); cards.appendChild( card ); }
        ctx.host.appendChild( cards );
    }
    function hub( ctx ) {
        var header = el( 'div', 'mba-pro-organise-header' ); ctx.host.appendChild( header );
        ctx.root.classList.toggle( 'mba-pro-organise-opening', !ctx.open );
        if ( !ctx.open ) {
            title( header, ctx.s.hub, ctx.s.hubIntro );
            var cards = el( 'div', 'mba-pro-organise-cards' ); ctx.host.appendChild( cards );
            ctx.data.categories.filter( function( cat ) { return !cat.parent && ![ 'all', 'ba_category_all' ].includes( cat.slug ); } ).forEach( function( cat ) {
                var cases = items().filter( function( item ) { return matches( ctx, [ cat.slug ], item ); } );
                if ( !cases.length ) { return; }
                cases.sort( function( a, b ) { return Number( b.timestamp ) - Number( a.timestamp ); } );
                var open = function() { choose( ctx, cat.slug ); };
                var card = el( 'article', 'mba-pro-organise-treatment' );
                // The photo is a second, mouse-only way in; keyboard and screen readers use the name.
                var cover = button( '', open, 'mba-pro-organise-cover' ); cover.tabIndex = -1; cover.setAttribute( 'aria-hidden', 'true' );
                cover.appendChild( pairCover( ctx, cases[0] ) );
                card.appendChild( cover );
                var body = el( 'div', 'mba-pro-organise-body' );
                var heading = el( 'h3', 'mba-pro-organise-name-wrap' );
                var name = button( cat.name, open, 'mba-pro-organise-name' );
                name.setAttribute( 'aria-label', cat.name + ', ' + count( ctx, cases ) );
                heading.appendChild( name ); body.appendChild( heading );
                body.appendChild( el( 'p', 'mba-pro-organise-meta', count( ctx, cases ) ) );
                var subs = el( 'div', 'mba-pro-organise-chips is-small' );
                ctx.data.categories.filter( function( sub ) { return sub.parent === cat.id; } ).forEach( function( sub ) {
                    if ( cases.some( function( item ) { return matches( ctx, [ sub.slug ], item ); } ) ) { subs.appendChild( button( sub.name, function() { choose( ctx, sub.slug ); } ) ); }
                } );
                if ( subs.children.length ) { body.appendChild( subs ); }
                body.appendChild( icon( el( 'span', 'mba-pro-organise-more', ctx.s.viewResults ), ARROW, true ) );
                card.appendChild( body );
                card.addEventListener( 'click', function( event ) { if ( !event.target.closest( 'button, a' ) ) { open(); } } );
                cards.appendChild( card );
            } );
            var foot = el( 'div', 'mba-pro-organise-foot' );
            foot.appendChild( icon( button( fmt( ctx.s.seeAll, items().length ), function() { choose( ctx, 'all' ); }, 'mba-pro-organise-all' ), ARROW, true ) );
            ctx.host.appendChild( foot );
            return;
        }
        var cat = [ 'all', 'ba_category_all' ].includes( ctx.category ) ? null : category( ctx, ctx.category );
        var crumb = el( 'nav', 'mba-pro-organise-breadcrumb' ); crumb.setAttribute( 'aria-label', ctx.s.breadcrumb );
        crumb.appendChild( icon( button( ctx.s.back, function() {
            ctx.open = false; ctx.category = ''; write( ctx, true ); selectCategory( ctx, 'all' ); update( ctx );
            var heading = ctx.host.querySelector( 'h2' ); if ( heading ) { heading.tabIndex = -1; heading.focus(); }
        }, 'mba-pro-organise-back' ), BACK ) );
        header.appendChild( crumb );
        var row = el( 'div', 'mba-pro-organise-title-row' );
        var text = el( 'div', 'mba-pro-organise-title-text' );
        title( text, cat ? cat.name : ctx.s.allCases, cat ? cat.intro : '' );
        row.appendChild( text ); booking( ctx, row ); header.appendChild( row );
        if ( cat ) {
            var parent = cat.parent && ctx.byId.get( cat.parent ) || cat;
            chips( ctx, header, ctx.data.categories.filter( function( child ) { return child.parent === parent.id; } ), items().filter( function( item ) { return matches( ctx, [ parent.slug ], item ); } ), parent.slug );
            var chipRow = header.querySelector( '.mba-pro-organise-chips:last-child' );
            if ( chipRow && chipRow.children.length < 2 ) { chipRow.remove(); }
        }
    }
    function concerns( ctx ) {
        var header = el( 'div', 'mba-pro-organise-header' ); ctx.host.appendChild( header ); title( header, ctx.s.concerns );
        var cards = el( 'div', 'mba-pro-organise-cards mba-pro-organise-concerns' ); ctx.host.appendChild( cards );
        ctx.data.concerns.forEach( function( concern, index ) {
            var card = button( '', function() { ctx.concern = String( index + 1 ); choose( ctx, 'all' ); }, 'mba-pro-organise-concern' );
            card.setAttribute( 'aria-pressed', String( ctx.concern === String( index + 1 ) ) );
            card.appendChild( el( 'strong', '', concern.name ) ); if ( concern.hint ) { card.appendChild( el( 'span', '', concern.hint ) ); } cards.appendChild( card );
        } );
        var concern = ctx.data.concerns[ Number( ctx.concern ) - 1 ];
        ctx.root.classList.toggle( 'mba-pro-organise-opening', !concern );
        if ( concern ) {
            var treatments = el( 'div', 'mba-pro-organise-header' ); ctx.host.appendChild( treatments );
            title( treatments, fmt( ctx.s.treatmentsFor, concern.name ) );
            chips( ctx, treatments, concern.categories.map( function( slug ) { return category( ctx, slug ); } ).filter( Boolean ), items().filter( function( item ) { return matches( ctx, concern.categories, item ); } ) );
        }
    }
    function avatar( doctor ) {
        return photo( doctor.photo, doctor.photoAlt || doctor.name, 'mba-pro-organise-avatar' ) || el( 'span', 'mba-pro-organise-avatar', doctor.name.split( /\s+/ ).map( function( word ) { return word[0]; } ).slice( 0, 2 ).join( '' ) );
    }
    // Doctor portfolios: one compact row of doctors, then one profile card for the
    // chosen doctor (who, where, book) with that doctor's treatments as chips. The
    // gallery's own category bar is hidden in this view (the chips replace it).
    function doctors( ctx ) {
        var available = ctx.data.doctors.filter( function( doctor ) { return items().some( function( item ) { return doctorMatches( item, doctor.slug ); } ); } );
        if ( !available.length ) { ctx.root.classList.remove( 'mba-pro-organise-doctors', 'mba-pro-organise-root' ); return; }
        if ( !available.some( function( doc ) { return doc.slug === ctx.doctor; } ) ) { ctx.doctor = available[0].slug; }
        ctx.root.classList.add( 'mba-pro-organise-doctors' );
        var header = el( 'div', 'mba-pro-organise-header' ); ctx.host.appendChild( header );
        header.appendChild( el( 'h2', 'mba-pro-organise-doctors-title', ctx.s.ourDoctors ) );
        if ( available.length > 1 ) {
            var row = el( 'div', 'mba-pro-organise-doctor-list' ); row.setAttribute( 'role', 'group' ); row.setAttribute( 'aria-label', ctx.s.doctors );
            available.forEach( function( doctor ) {
                var choice = button( '', function() { if ( ctx.doctor !== doctor.slug ) { ctx.doctor = doctor.slug; choose( ctx, 'all' ); } }, 'mba-pro-organise-doctor' );
                choice.setAttribute( 'aria-pressed', String( doctor.slug === ctx.doctor ) ); choice.appendChild( avatar( doctor ) );
                var text = el( 'span', 'mba-pro-organise-doctor-text' ); text.appendChild( el( 'strong', '', doctor.name ) );
                if ( doctor.credentials ) { text.appendChild( el( 'span', '', doctor.credentials ) ); }
                choice.appendChild( text ); row.appendChild( choice );
            } );
            header.appendChild( row );
        }
        var doctor = available.find( function( doc ) { return doc.slug === ctx.doctor; } );
        var base = items().filter( function( item ) { return doctorMatches( item, ctx.doctor ); } );
        var card = el( 'div', 'mba-pro-organise-profile' );
        card.appendChild( avatar( doctor ) );
        var who = el( 'div', 'mba-pro-organise-profile-text' );
        who.appendChild( el( 'h3', 'mba-pro-organise-profile-name', doctor.name ) );
        var meta = [ doctor.credentials, doctor.location, count( ctx, base ) ].filter( Boolean ).join( ' · ' );
        who.appendChild( el( 'p', 'mba-pro-organise-meta', meta ) );
        card.appendChild( who );
        var actions = el( 'div', 'mba-pro-organise-actions' );
        var profile = link( ctx.s.profile, doctor.url ); if ( profile ) { actions.appendChild( profile ); }
        var book = link( ctx.s.book, ctx.data.booking ); if ( book ) { book.classList.add( 'is-primary' ); actions.appendChild( book ); }
        if ( actions.children.length ) { card.appendChild( actions ); }
        chips( ctx, card, ctx.data.categories.filter( function( cat ) { return ![ 'all', 'ba_category_all' ].includes( cat.slug ) && base.some( function( item ) { return matches( ctx, [ cat.slug ], item ); } ); } ), base );
        var chipRow = card.querySelector( '.mba-pro-organise-chips' );
        if ( chipRow && chipRow.children.length < 3 ) { chipRow.remove(); }
        header.appendChild( card );
    }
    function update( ctx ) {
        if ( !ready ) { return; }
        // Preserve keyboard focus when only the underlying result set changes.
        var key = [ ctx.open, ctx.category, ctx.concern, ctx.doctor, items().length ].join( '|' );
        if ( key === ctx.key ) { return; } ctx.key = key;
        ctx.host.replaceChildren();
        if ( ctx.mode === 'hub' ) { hub( ctx ); }
        if ( ctx.mode === 'concerns' ) { concerns( ctx ); }
        if ( ctx.mode === 'doctors' ) { doctors( ctx ); }
    }
    function restore( ctx ) {
        var params = new URLSearchParams( location.search );
        ctx.category = params.get( 'mbcat' ) || 'all';
        ctx.open = !!params.get( 'mbcat' ) || params.get( 'mbhub' ) === 'all';
        ctx.concern = params.get( 'mbconcern' ) || '';
        ctx.doctor = params.get( 'mbdoctor' ) || '';
        ctx.key = ''; update( ctx );
        if ( ready ) { selectCategory( ctx, ctx.category ); }
    }
    function init() {
        document.querySelectorAll( '[data-mba-pro-organise]' ).forEach( function( root, index ) {
            var data, options;
            try { data = JSON.parse( root.dataset.mbaProOrganise ); options = JSON.parse( root.dataset.mbaProLayouts ); } catch ( error ) { return; }
            if ( options.structure === 'concerns' && !data.concerns.length ) { return; }
            var ctx = { root: root, data: data, s: data.i18n, mode: options.structure, index: index, category: 'all', doctor: '', concern: '', open: false };
            ctx.byId = new Map( data.categories.map( function( cat ) { return [ cat.id, cat ]; } ) );
            ctx.matchers = new Map();
            ctx.host = el( 'section', 'mba-pro-organise' ); root.prepend( ctx.host ); contexts.push( ctx );
            // The server adds these classes from the first paint (free 1.5.0's
            // medbeafgallery_container_classes); older free plugins get them here.
            root.classList.add( 'mba-pro-organise-root', 'mba-pro-structure-' + ctx.mode );
            if ( ctx.mode === 'hub' ) {
                var params = new URLSearchParams( location.search );
                if ( !params.get( 'mbcat' ) && params.get( 'mbhub' ) !== 'all' ) { root.classList.add( 'mba-pro-organise-opening' ); }
                if ( root.classList.contains( 'mba-pro-organise-opening' ) && !items().length ) { hubSkeleton( ctx ); }
            }
            root.addEventListener( 'mba:layoutsRendered', function() {
                if ( !ready ) { return; }
                ctx.category = state().currentChildCategory || state().currentCategory || 'all';
                update( ctx );
            } );
            root.addEventListener( 'click', function( event ) {
                if ( navigating || !event.target.closest( '.medbeafgallery-carousel-item, .mba-pro-subcategory-pill' ) ) { return; }
                setTimeout( function() { ctx.category = state().currentChildCategory || state().currentCategory || 'all'; ctx.open = true; update( ctx ); write( ctx, false ); }, 0 );
            } );
        } );
        window.mbaProLayoutRows.transform( function( list ) {
            var primary = document.getElementById( 'medbeafgallery-gallery-grid' );
            var ctx = contexts.find( function( entry ) { return primary && entry.root.contains( primary ); } );
            if ( !ctx ) { return list; }
            if ( ctx.mode === 'concerns' && ctx.concern ) {
                var concern = ctx.data.concerns[ Number( ctx.concern ) - 1 ];
                if ( concern ) { list = list.filter( function( item ) { return matches( ctx, concern.categories, item ); } ); }
            }
            if ( ctx.mode === 'doctors' && ctx.doctor ) { list = list.filter( function( item ) { return doctorMatches( item, ctx.doctor ); } ); }
            return list;
        } );
        if ( items().length ) { onReady(); }
    }
    function onReady() {
        ready = true;
        contexts.forEach( function( ctx ) { restore( ctx ); } );
        render();
    }
    document.addEventListener( 'medbeafgallery:dataReady', function() { setTimeout( onReady, 0 ); } );
    window.addEventListener( 'popstate', function() { setTimeout( function() { contexts.forEach( restore ); render(); }, 0 ); } );
    if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', init ); } else { init(); }
})();
