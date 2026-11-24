/* global galleryData, galleryConfig */
(function() {
    'use strict';
    var contexts = [];
    function el( tag, cls, text ) { var node = document.createElement( tag ); node.className = cls; if ( text !== undefined ) { node.textContent = text; } return node; }
    function state() { return typeof galleryConfig !== 'undefined' ? galleryConfig : {}; }
    function render() { if ( typeof window.renderGalleryItems === 'function' ) { window.renderGalleryItems(); } }
    function select( ctx, slug, push ) {
        ctx.selected = slug;
        if ( ctx.index === 0 ) {
            var next = new URL( location.href ); next.searchParams.delete( 'mbcollection' );
            if ( slug ) { next.searchParams.set( 'mbcollection', slug ); }
            if ( next.href !== location.href ) { try { history[ push ? 'pushState' : 'replaceState' ]( history.state, '', next ); } catch ( error ) {} }
        }
        render();
        ctx.heading.tabIndex = -1; ctx.heading.focus( { preventScroll: true } );
    }
    function group( ctx, detail ) {
        var api = window.mbaProLayoutRows;
        if ( !api ) { return; }
        ctx.toolbar.replaceChildren();
        var current = ctx.data.collections.find( function( entry ) { return entry.slug === ctx.selected; } );
        ctx.heading.textContent = current ? current.name : ctx.data.i18n.title;
        if ( ctx.selected ) {
            var back = el( 'button', 'mba-pro-row-button', ctx.data.i18n.back ); back.type = 'button';
            back.addEventListener( 'click', function() { select( ctx, '', true ); } ); ctx.toolbar.appendChild( back );
            if ( current && current.intro ) { ctx.toolbar.appendChild( el( 'p', 'mba-pro-row-intro', current.intro ) ); }
            ctx.root.classList.remove( 'mba-pro-rows-active' ); return;
        }
        if ( !ctx.data.collections.length ) { api.fallback( detail.grid, detail.context, detail.cards ); return; }
        ctx.root.classList.add( 'mba-pro-rows-active' );
        var filtered = Array.isArray( state().filteredItems ) ? state().filteredItems : [];
        var groups = ctx.data.collections.map( function( collection ) {
            return Object.assign( {}, collection, { items: filtered.filter( function( item ) { return ( item.collections || [] ).includes( collection.slug ); } ) } );
        } ).filter( function( entry ) { return entry.items.length; } );
        var ungrouped = filtered.filter( function( item ) { return !( item.collections || [] ).length; } );
        if ( ungrouped.length ) { groups.push( { slug: '', name: ctx.data.i18n.more, intro: '', items: ungrouped } ); }
        var available = new Map(); detail.cards.forEach( function( card ) { available.set( String( card.dataset.id ), card ); } );
        var used = new Set();
        var old = new Map(); Array.from( detail.grid.children ).forEach( function( row ) { if ( row.mbaProRow ) { old.set( row.dataset.mbaProRow, row ); } } );
        groups.forEach( function( entry ) {
            var section = old.get( entry.slug );
            if ( !section ) {
                var options = Object.assign( {}, entry );
                if ( entry.slug ) { options.onSelect = function() { select( ctx, entry.slug, true ); }; }
                section = api.create( options, detail.context );
            }
            old.delete( entry.slug );
            var row = section.mbaProRow; var offset = row.rail.scrollLeft;
            row.rail.replaceChildren();
            entry.items.forEach( function( item ) {
                var card = available.get( String( item.id ) );
                if ( !card ) { return; }
                if ( used.has( card ) ) { card = window.createGalleryItem( item ); }
                if ( card ) { used.add( card ); row.rail.appendChild( card ); }
            } );
            if ( !row.rail.children.length ) { return; }
            section.mbaProTotal = entry.items.length;
            row.count.textContent = api.format( detail.context.options.i18n[ entry.items.length === 1 ? 'caseSingular' : 'casePlural' ], [ entry.items.length ] );
            var all = section.querySelector( '.mba-pro-row-all' );
            if ( all ) { all.textContent = api.format( ctx.data.i18n.seeAll, [ entry.items.length ] ); all.setAttribute( 'aria-label', all.textContent + ' · ' + entry.name ); }
            detail.grid.appendChild( section ); row.rail.scrollLeft = offset; row.schedule();
        } );
        old.forEach( function( row ) { row.remove(); } );
        Array.from( detail.grid.children ).forEach( function( child ) { if ( child.classList.contains( 'medbeafgallery-gallery-item' ) ) { child.remove(); } } );
    }
    function init() {
        document.querySelectorAll( '[data-mba-pro-collections]' ).forEach( function( root, index ) {
            var data; try { data = JSON.parse( root.dataset.mbaProCollections ); } catch ( error ) { return; }
            var selected = index === 0 ? new URLSearchParams( location.search ).get( 'mbcollection' ) || '' : '';
            if ( !data.collections.some( function( collection ) { return collection.slug === selected; } ) ) { selected = ''; }
            var ctx = { root: root, data: data, selected: selected, index: index };
            ctx.header = el( 'section', 'mba-pro-collections-header' ); ctx.heading = el( 'h2', 'mba-pro-collections-title', data.i18n.title );
            ctx.header.hidden = !data.collections.length;
            ctx.toolbar = el( 'div', 'mba-pro-collections-toolbar' ); ctx.header.append( ctx.heading, ctx.toolbar );
            var main = root.querySelector( '.medbeafgallery-main-content' ); if ( !main ) { return; } main.prepend( ctx.header );
            root.addEventListener( 'mba:layoutsRendered', function( event ) { group( ctx, event.detail ); } ); contexts.push( ctx );
        } );
        window.mbaProLayoutRows.transform( function( list ) {
            var grid = document.getElementById( 'medbeafgallery-gallery-grid' );
            var ctx = contexts.find( function( entry ) { return grid && entry.root.contains( grid ); } );
            return ctx && ctx.selected ? list.filter( function( item ) { return ( item.collections || [] ).includes( ctx.selected ); } ) : list;
        } );
        if ( typeof galleryData !== 'undefined' && galleryData.length ) { render(); }
    }
    window.addEventListener( 'popstate', function() {
        contexts.forEach( function( ctx ) {
            if ( ctx.index === 0 ) { ctx.selected = new URLSearchParams( location.search ).get( 'mbcollection' ) || ''; }
        } ); render();
    } );
    if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', init ); } else { init(); }
})();
