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
    // The treatment index is the hub with another opening view.
    function isHub( ctx ) { return ctx.mode === 'hub' || ctx.mode === 'index'; }
    /** Does the link ask for cases (a category, all of them, a search, a sort order, a filter)? */
    function linkOpens( ctx ) {
        var params = new URLSearchParams( location.search );
        return !!params.get( 'mbcat' ) || params.get( 'mbhub' ) === 'all' || ( ctx.data.linkParams || [] ).some( function( name ) { return !!params.get( name ); } );
    }
    function write( ctx, push ) {
        if ( ctx.index !== 0 ) { return; }
        var next = new URL( location.href );
        [ 'mbcat', 'mbhub', 'mbconcern', 'mbdoctor' ].forEach( function( key ) { next.searchParams.delete( key ); } );
        if ( ctx.category && ctx.category !== 'all' ) { next.searchParams.set( 'mbcat', ctx.category ); }
        if ( isHub( ctx ) && ctx.open && ctx.category === 'all' ) { next.searchParams.set( 'mbhub', 'all' ); }
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
    // The treatments' names are known before the cases are.
    function indexSkeleton( ctx ) {
        var params = new URLSearchParams( location.search );
        if ( params.get( 'mbcat' ) || params.get( 'mbhub' ) === 'all' ) { return; }
        var header = el( 'div', 'mba-pro-organise-header' ); title( header, ctx.s.hub, ctx.s.hubIntro ); ctx.host.appendChild( header );
        var list = el( 'div', 'mba-pro-index is-loading' ); list.setAttribute( 'aria-hidden', 'true' );
        ctx.data.categories.filter( function( cat ) { return !cat.parent && ![ 'all', 'ba_category_all' ].includes( cat.slug ); } ).forEach( function( cat ) {
            var row = el( 'span', 'mba-pro-organise-button mba-pro-index-row' ); row.appendChild( el( 'span', 'mba-pro-index-name', cat.name ) ); list.appendChild( row );
        } );
        ctx.host.appendChild( list );
    }
    function browseAll( ctx ) {
        var foot = el( 'div', 'mba-pro-organise-foot' );
        foot.appendChild( icon( button( fmt( ctx.s.seeAll, items().length ), function() { choose( ctx, 'all' ); }, 'mba-pro-organise-all' ), ARROW, true ) );
        ctx.host.appendChild( foot );
    }
    // A large list of treatments. With a mouse the newest result of the one pointed at
    // floats beside the list; on touch screens each row has its own small pair.
    function treatmentIndex( ctx ) {
        var list = el( 'div', 'mba-pro-index' );
        var float = el( 'div', 'mba-pro-index-float' ); float.setAttribute( 'aria-hidden', 'true' );
        ctx.data.categories.filter( function( cat ) { return !cat.parent && ![ 'all', 'ba_category_all' ].includes( cat.slug ); } ).forEach( function( cat ) {
            var cases = items().filter( function( item ) { return matches( ctx, [ cat.slug ], item ); } );
            if ( !cases.length ) { return; }
            cases.sort( function( a, b ) { return Number( b.timestamp ) - Number( a.timestamp ); } );
            var row = button( '', function() { choose( ctx, cat.slug ); }, 'mba-pro-index-row' );
            row.setAttribute( 'aria-label', cat.name + ', ' + count( ctx, cases ) );
            row.appendChild( el( 'span', 'mba-pro-index-name', cat.name ) );
            row.appendChild( el( 'span', 'mba-pro-index-count', count( ctx, cases ) ) );
            var small = el( 'span', 'mba-pro-index-small' ); small.appendChild( pairCover( ctx, cases[0] ) ); row.appendChild( small );
            var show = function() {
                float.replaceChildren( pairCover( ctx, cases[0] ) );
                list.querySelectorAll( '.mba-pro-index-row' ).forEach( function( other ) { other.classList.toggle( 'is-on', other === row ); } );
                var top = row.offsetTop + row.offsetHeight / 2 - float.offsetHeight / 2;
                float.style.setProperty( '--mba-pro-index-y', Math.max( 0, Math.min( list.clientHeight - float.offsetHeight, top ) ) + 'px' );
                float.classList.add( 'is-on' );
            };
            row.addEventListener( 'mouseenter', show ); row.addEventListener( 'focus', show );
            list.appendChild( row );
        } );
        list.addEventListener( 'mouseleave', function() {
            if ( list.contains( document.activeElement ) ) { return; }
            float.classList.remove( 'is-on' );
            list.querySelectorAll( '.is-on' ).forEach( function( row ) { row.classList.remove( 'is-on' ); } );
        } );
        list.appendChild( float );
        ctx.host.appendChild( list );
        browseAll( ctx );
    }
    function hub( ctx ) {
        var header = el( 'div', 'mba-pro-organise-header' ); ctx.host.appendChild( header );
        ctx.root.classList.toggle( 'mba-pro-organise-opening', !ctx.open );
        if ( !ctx.open ) {
            title( header, ctx.s.hub, ctx.s.hubIntro );
            if ( ctx.mode === 'index' ) { treatmentIndex( ctx ); return; }
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
            browseAll( ctx );
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
    // The concern's icon (markup made by this plugin's own icon library, never user input).
    function concernIcon( concern ) {
        if ( !concern.iconSvg ) { return null; }
        var holder = el( 'span', 'mba-pro-organise-concern-icon' ); holder.setAttribute( 'aria-hidden', 'true' ); holder.innerHTML = concern.iconSvg;
        return holder;
    }
    // Opening view: one card per concern. Once one is chosen, the concerns become a
    // compact row above that concern's heading, treatments and cases.
    function concerns( ctx ) {
        var concern = ctx.data.concerns[ Number( ctx.concern ) - 1 ];
        ctx.root.classList.toggle( 'mba-pro-organise-opening', !concern );
        var header = el( 'div', 'mba-pro-organise-header mba-pro-organise-concerns-header' ); ctx.host.appendChild( header );
        title( header, ctx.s.concerns, concern ? '' : ctx.s.concernsIntro );
        var cards = el( 'div', concern ? 'mba-pro-organise-concern-row' : 'mba-pro-organise-cards mba-pro-organise-concerns' ); ctx.host.appendChild( cards );
        ctx.data.concerns.forEach( function( entry, index ) {
            var open = function() { ctx.concern = String( index + 1 ); choose( ctx, 'all' ); };
            var card = button( '', open, 'mba-pro-organise-concern' );
            card.setAttribute( 'aria-pressed', String( ctx.concern === String( index + 1 ) ) );
            var glyph = concernIcon( entry ); if ( glyph ) { card.appendChild( glyph ); }
            if ( concern ) { card.appendChild( el( 'strong', '', entry.name ) ); cards.appendChild( card ); return; }
            var text = el( 'span', 'mba-pro-organise-concern-text' );
            text.appendChild( el( 'strong', '', entry.name ) );
            if ( entry.hint ) { text.appendChild( el( 'span', 'mba-pro-organise-concern-hint', entry.hint ) ); }
            card.appendChild( text );
            var cases = items().filter( function( item ) { return matches( ctx, entry.categories, item ); } );
            var known = entry.categories.map( function( slug ) { return category( ctx, slug ); } ).filter( Boolean ).length;
            var foot = el( 'span', 'mba-pro-organise-concern-foot' );
            foot.appendChild( el( 'span', 'mba-pro-organise-concern-count', fmt( ctx.s[ known === 1 ? 'treatment' : 'treatments' ], known ) + ' · ' + count( ctx, cases ) ) );
            icon( foot, ARROW, true );
            card.appendChild( foot );
            cards.appendChild( card );
        } );
        if ( concern ) {
            var chosen = cards.querySelector( '[aria-pressed="true"]' );
            if ( chosen && cards.scrollWidth > cards.clientWidth ) { cards.scrollLeft = Math.max( 0, chosen.offsetLeft - cards.offsetLeft - 16 ); }
            var treatments = el( 'div', 'mba-pro-organise-header mba-pro-organise-concern-panel' ); ctx.host.appendChild( treatments );
            var row = el( 'div', 'mba-pro-organise-title-row' );
            var heading = el( 'div', 'mba-pro-organise-title-text' );
            title( heading, fmt( ctx.s.treatmentsFor, concern.name ), concern.hint );
            row.appendChild( heading ); booking( ctx, row ); treatments.appendChild( row );
            // One treatment: "All" and the treatment would be the same list.
            if ( concern.categories.length > 1 ) { chips( ctx, treatments, concern.categories.map( function( slug ) { return category( ctx, slug ); } ).filter( Boolean ), items().filter( function( item ) { return matches( ctx, concern.categories, item ); } ) ); }
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
    /*
     * Someone like you: gender, age and a concern (or treatment). The cases stay ordinary
     * cards; this only filters by the concern and puts the closest people first. Nothing a
     * visitor says about themselves is stored, sent or written into the address.
     */
    function ageOf( item ) {
        var numbers = String( item.age || '' ).match( /\d+/g );
        if ( !numbers ) { return NaN; }
        if ( numbers.length > 1 ) { return ( Number( numbers[0] ) + Number( numbers[1] ) ) / 2; }
        return Number( numbers[0] ) + ( /\+/.test( String( item.age ) ) ? 5 : 0 );
    }
    function genderOf( item ) { return String( item.gender || '' ).trim().toLowerCase(); }
    function distance( ctx, item ) {
        var score = 0;
        if ( ctx.me.gender ) { score += genderOf( item ) === ctx.me.gender ? 0 : 60; }
        if ( ctx.me.age ) { var age = ageOf( item ); score += isNaN( age ) ? 25 : Math.abs( age - ctx.me.age ); }
        return score;
    }
    function match( ctx ) {
        var genders = [];
        items().forEach( function( item ) { var gender = genderOf( item ); if ( gender && genders.indexOf( gender ) === -1 ) { genders.push( gender ); } } );
        genders.sort();
        var ages = items().map( ageOf ).filter( function( age ) { return !isNaN( age ); } );
        // Without gender and age on the cases there is nothing to compare: a plain gallery.
        if ( genders.length < 2 && ages.length < 2 ) { ctx.root.classList.remove( 'mba-pro-structure-match', 'mba-pro-match-on' ); return; }
        ctx.root.classList.add( 'mba-pro-match-on' );
        var form = el( 'div', 'mba-pro-match' );
        form.setAttribute( 'role', 'group' ); form.setAttribute( 'aria-label', ctx.s.match );
        form.appendChild( el( 'h2', '', ctx.s.match ) );
        var number = 'mba-pro-match-' + ctx.index;
        function changed() { ctx.key = ''; ctx.touched = true; render(); update( ctx ); }
        function group( name, entries, isOn, pick, cls ) {
            var label = el( 'p', 'mba-pro-match-label', name ); label.id = number + '-' + cls.replace( /\W+/g, '' );
            var wrap = el( 'div', 'mba-pro-match-choices ' + cls ); wrap.setAttribute( 'role', 'group' ); wrap.setAttribute( 'aria-labelledby', label.id );
            entries.forEach( function( entry ) {
                var choice = button( entry.name, function() { pick( entry ); }, 'mba-pro-match-choice' );
                choice.setAttribute( 'aria-pressed', String( !!isOn( entry ) ) );
                choice.mbaEntry = entry; wrap.appendChild( choice );
            } );
            form.appendChild( label ); form.appendChild( wrap );
        }
        if ( genders.length > 1 ) {
            group( ctx.s.matchGender, genders.slice( 0, 4 ).map( function( gender ) { return { id: gender, name: ctx.s[ gender ] || gender.charAt( 0 ).toUpperCase() + gender.slice( 1 ) }; } ),
                function( entry ) { return ctx.me.gender === entry.id; },
                function( entry ) { ctx.me.gender = ctx.me.gender === entry.id ? '' : entry.id; changed(); }, 'is-pair' );
        }
        var ranges = [];
        items().forEach( function( item ) { var age = String( item.age || '' ).trim(); if ( age && !isNaN( ageOf( item ) ) && ranges.indexOf( age ) === -1 ) { ranges.push( age ); } } );
        ranges.sort( function( a, b ) { return ageOf( { age: a } ) - ageOf( { age: b } ); } );
        var asRanges = ranges.length > 1 && ranges.length < 9 && ranges.some( function( age ) { return !/^\d+$/.test( age ); } );
        if ( asRanges ) {
            group( ctx.s.matchAge, ranges.map( function( age ) { return { id: age, name: age.replace( /\s*-\s*/, '–' ), age: ageOf( { age: age } ) }; } ),
                function( entry ) { return ctx.me.age === entry.age; },
                function( entry ) { ctx.me.age = ctx.me.age === entry.age ? 0 : entry.age; changed(); }, 'is-pair is-ages' );
        } else if ( ages.length > 1 ) {
            var low = Math.max( 16, Math.floor( Math.min.apply( null, ages ) / 5 ) * 5 );
            var high = Math.ceil( Math.max.apply( null, ages ) / 5 ) * 5;
            var label = el( 'label', 'mba-pro-match-label', ctx.s.matchAge ); label.htmlFor = number + '-age';
            var line = el( 'div', 'mba-pro-match-age' );
            var range = el( 'input' ); range.type = 'range'; range.id = number + '-age'; range.min = low; range.max = high; range.step = 1;
            range.value = ctx.me.age || Math.round( ( low + high ) / 2 );
            var out = el( 'output', '', ctx.me.age ? String( ctx.me.age ) : ctx.s.matchAny ); out.htmlFor = range.id;
            if ( ctx.me.age ) { range.setAttribute( 'aria-valuetext', fmt( ctx.s.matchYears, ctx.me.age ) ); }
            range.addEventListener( 'input', function() { out.textContent = range.value; range.setAttribute( 'aria-valuetext', fmt( ctx.s.matchYears, range.value ) ); } );
            range.addEventListener( 'change', function() { ctx.me.age = Number( range.value ); changed(); } );
            line.appendChild( range ); line.appendChild( out );
            form.appendChild( label ); form.appendChild( line );
        }
        var wants = ctx.data.concerns.length
            ? ctx.data.concerns.map( function( entry, index ) { return { id: 'c' + ( index + 1 ), name: entry.name, categories: entry.categories }; } )
            : ctx.data.categories.filter( function( cat ) { return !cat.parent && ![ 'all', 'ba_category_all' ].includes( cat.slug ); } ).map( function( cat ) { return { id: cat.slug, name: cat.name, categories: [ cat.slug ] }; } );
        wants = wants.filter( function( entry ) { return items().some( function( item ) { return matches( ctx, entry.categories, item ); } ); } );
        if ( wants.length > 1 ) {
            group( ctx.data.concerns.length ? ctx.s.matchWant : ctx.s.matchTreatment, wants,
                function( entry ) { return ctx.me.want && ctx.me.want.id === entry.id; },
                function( entry ) { ctx.me.want = ctx.me.want && ctx.me.want.id === entry.id ? null : entry; changed(); }, 'is-chips' );
        }
        var chosen = ctx.me.gender || ctx.me.age || ctx.me.want;
        var status = el( 'p', 'mba-pro-match-status' ); status.setAttribute( 'role', 'status' );
        if ( chosen ) { status.textContent = fmt( ctx.s.matchStatus, ( state().filteredItems || [] ).length ); }
        form.appendChild( status );
        if ( chosen ) { form.appendChild( button( ctx.s.matchReset, function() { ctx.me = { gender: '', age: 0, want: null }; changed(); }, 'mba-pro-match-reset' ) ); }
        // Keep the keyboard where it was when the form is drawn again.
        var active = document.activeElement;
        var place = active && ctx.host.contains( active ) ? Array.from( ctx.host.querySelectorAll( 'button, input' ) ).indexOf( active ) : -1;
        ctx.host.replaceChildren( form );
        if ( place > -1 ) { var again = form.querySelectorAll( 'button, input' )[ place ]; if ( again ) { again.focus( { preventScroll: true } ); } }
    }
    // The closest person gets the large card (grids only) and a badge.
    function markBest( ctx ) {
        var best = ( ctx.me.gender || ctx.me.age ) && ctx.root.querySelector( '.medbeafgallery-gallery-grid > .medbeafgallery-gallery-item' );
        ctx.root.querySelectorAll( '.mba-pro-match-best' ).forEach( function( card ) { if ( card !== best ) { card.classList.remove( 'mba-pro-match-best' ); var old = card.querySelector( '.mba-pro-match-badge' ); if ( old ) { old.remove(); } } } );
        if ( !best || best.classList.contains( 'mba-pro-match-best' ) ) { return; }
        best.classList.add( 'mba-pro-match-best' );
        var media = best.querySelector( '.mba-pro-card-media, .medbeafgallery-gallery-image-container' );
        if ( media ) { media.appendChild( el( 'span', 'mba-pro-match-badge', ctx.s.matchBest ) ); }
    }
    function update( ctx ) {
        if ( !ready ) { return; }
        if ( ctx.mode === 'match' ) {
            var now = JSON.stringify( [ ctx.me.gender, ctx.me.age, ctx.me.want && ctx.me.want.id, items().length, ( state().filteredItems || [] ).length ] );
            if ( now !== ctx.key ) { ctx.key = now; match( ctx ); }
            markBest( ctx );
            return;
        }
        // Preserve keyboard focus when only the underlying result set changes.
        var key = [ ctx.open, ctx.category, ctx.concern, ctx.doctor, items().length ].join( '|' );
        if ( key === ctx.key ) { return; } ctx.key = key;
        ctx.host.replaceChildren();
        if ( isHub( ctx ) ) { hub( ctx ); }
        if ( ctx.mode === 'concerns' ) { concerns( ctx ); }
        if ( ctx.mode === 'doctors' ) { doctors( ctx ); }
    }
    function restore( ctx ) {
        if ( ctx.mode === 'match' ) { ctx.key = ''; update( ctx ); return; }
        var params = new URLSearchParams( location.search );
        ctx.category = params.get( 'mbcat' ) || 'all';
        ctx.open = linkOpens( ctx );
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
            ctx.me = { gender: '', age: 0, want: null };
            ctx.byId = new Map( data.categories.map( function( cat ) { return [ cat.id, cat ]; } ) );
            ctx.matchers = new Map();
            ctx.host = el( 'section', 'mba-pro-organise' ); root.prepend( ctx.host ); contexts.push( ctx );
            // Something in its place while the cases load.
            if ( !items().length && ctx.mode === 'match' && root.classList.contains( 'mba-pro-match-on' ) ) {
                var ghost = el( 'div', 'mba-pro-match is-loading' ); ghost.setAttribute( 'aria-hidden', 'true' );
                ghost.appendChild( el( 'h2', '', ctx.s.match ) );
                [ '40%', '100%', '30%', '100%', '55%', '100%', '80%' ].forEach( function( width ) { var line = el( 'span', 'mba-pro-match-ghost' ); line.style.width = width; ghost.appendChild( line ); } );
                ctx.host.appendChild( ghost );
            }
            if ( !items().length && ctx.mode === 'index' ) { indexSkeleton( ctx ); }
            // The server adds these classes from the first paint (free 1.5.0's
            // medbeafgallery_container_classes); older free plugins get them here.
            root.classList.add( 'mba-pro-structure-' + ctx.mode );
            if ( ctx.mode !== 'match' ) { root.classList.add( 'mba-pro-organise-root' ); }
            if ( isHub( ctx ) ) {
                if ( !linkOpens( ctx ) ) { root.classList.add( 'mba-pro-organise-opening' ); }
                if ( ctx.mode === 'hub' && root.classList.contains( 'mba-pro-organise-opening' ) && !items().length ) { hubSkeleton( ctx ); }
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
            if ( ctx.mode === 'match' ) {
                if ( ctx.me.want ) { list = list.filter( function( item ) { return matches( ctx, ctx.me.want.categories, item ); } ); }
                if ( ctx.me.gender || ctx.me.age ) {
                    list = list.map( function( item, place ) { return [ distance( ctx, item ), place, item ]; } ).sort( function( a, b ) { return a[0] - b[0] || a[1] - b[1]; } ).map( function( entry ) { return entry[2]; } );
                }
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
