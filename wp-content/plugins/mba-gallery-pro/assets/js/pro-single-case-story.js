/**
 * Scroll story ([mba_case layout="story"]).
 *
 * The server prints a list of stage photos with captions. Here the list becomes one
 * pinned photo that changes while the page scrolls, with the stage in large type beside
 * it. Pinning is position: sticky; where a wrapper of the theme is a scroll container
 * (overflow), sticky cannot work and the photo is pinned with position: fixed instead.
 * It stays a plain list with reduced motion, or where neither can work.
 */
( function () {
    'use strict';

    var motion = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : null;

    // 'sticky', 'fixed' or '' (leave the list as it is).
    function pinMode( node ) {
        var sticky = true;
        for ( var parent = node.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement ) {
            var style = window.getComputedStyle( parent );
            if ( /auto|scroll|hidden/.test( style.overflowY ) ) {
                // The body's overflow belongs to the window, unless the root has its own.
                if ( parent !== document.body || !/^visible/.test( window.getComputedStyle( document.documentElement ).overflowY ) ) { sticky = false; }
            }
            if ( style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none' || /paint|layout|strict|content/.test( style.contain ) || /transform|filter|perspective/.test( style.willChange ) ) {
                if ( !sticky ) { return ''; } // Fixed would be relative to this wrapper.
                node.mbaNoFixed = true;
            }
        }
        return sticky ? 'sticky' : ( node.mbaNoFixed ? '' : 'fixed' );
    }

    // "3 months" → [ 3, 'months' ]; anything else is shown as it is.
    function split( label ) {
        var found = /^\s*(\d+)\s+(\D.*)$/.exec( label );
        return found ? [ Number( found[1] ), found[2].trim() ] : null;
    }

    function init( root ) {
        var stages = Array.prototype.slice.call( root.querySelectorAll( '.mba-pro-sstory-stage' ) ).map( function ( item ) {
            var label = item.querySelector( 'strong' );
            var note = item.querySelector( 'figcaption span' );
            return { item: item, label: label ? label.textContent : '', note: note ? note.textContent : '', parts: split( label ? label.textContent : '' ) };
        } );
        var mode = pinMode( root );
        if ( stages.length < 2 || ( motion && motion.matches ) || !mode ) { return; }
        var pin = root.querySelector( '.mba-pro-sstory-pin' );
        var number = root.querySelector( '.mba-pro-sstory-number' );
        var unit = root.querySelector( '.mba-pro-sstory-unit' );
        var line = root.querySelector( '.mba-pro-sstory-line' );
        var last = stages.length - 1;
        // The stages' dates give a counter (weeks for a short treatment, else months).
        // Without them it needs every label after the first in one unit: "3 months",
        // "6 months". Otherwise the stage's own name is shown.
        var dates = stages.map( function ( stage ) { return Date.parse( stage.item.getAttribute( 'data-date' ) || '' ); } );
        var dated = dates.every( function ( date, index ) { return !isNaN( date ) && ( !index || date > dates[ index - 1 ] ); } );
        var one = '';
        var many = '';
        var same = false;
        if ( dated ) {
            var days = dates.map( function ( date ) { return ( date - dates[0] ) / 864e5; } );
            var weeks = days[ last ] < 84;
            days.forEach( function ( day, index ) { stages[ index ].value = Math.round( day / ( weeks ? 7 : 30.44 ) ); } );
            one = root.getAttribute( weeks ? 'data-week' : 'data-month' );
            many = root.getAttribute( weeks ? 'data-weeks' : 'data-months' );
            same = stages[ last ].value > 0;
        } else if ( stages.slice( 1 ).every( function ( stage ) { return !!stage.parts; } ) ) {
            many = stages[ last ].parts[1];
            one = many.replace( /s$/, '' );
            same = stages.slice( 1 ).every( function ( stage ) { return stage.parts[1].replace( /s$/, '' ) === one; } );
            stages.forEach( function ( stage ) { stage.value = stage.parts ? stage.parts[0] : 0; } );
        }
        var shown = -1;
        var queued = false;
        // Where a fixed header covers the top of the window, the story starts under it.
        function headerHeight() {
            var bar = document.getElementById( 'wpadminbar' );
            return bar && window.getComputedStyle( bar ).position === 'fixed' ? bar.offsetHeight : 0;
        }
        var top = headerHeight();
        root.style.setProperty( '--sstory-top', top + 'px' );
        root.classList.add( 'is-live' );

        function set( name, value ) { pin.style.setProperty( name, value, 'important' ); }
        function place( box ) {
            var inside = box.top <= top && box.bottom - pin.offsetHeight >= top;
            set( 'position', inside ? 'fixed' : 'absolute' );
            set( 'top', inside ? top + 'px' : ( box.top > top ? '0px' : 'auto' ) );
            set( 'bottom', !inside && box.top <= top ? '0px' : 'auto' );
            set( 'left', inside ? box.left + 'px' : '0px' );
            set( 'width', box.width + 'px' );
        }

        function draw() {
            queued = false;
            var box = root.getBoundingClientRect();
            if ( mode === 'fixed' ) { place( box ); }
            var span = Math.max( 1, box.height - pin.offsetHeight );
            var p = Math.max( 0, Math.min( 1, ( top - box.top ) / span ) ) * last;
            stages.forEach( function ( stage, index ) {
                var q = Math.max( 0, Math.min( 1, ( p - ( index - 1 ) ) * 1.25 - 0.12 ) );
                stage.item.style.clipPath = index ? 'inset(' + ( ( 1 - q ) * 100 ).toFixed( 2 ) + '% 0 0 0)' : '';
            } );
            var now = Math.min( last, Math.floor( p + 0.35 ) );
            if ( same ) {
                var from = Math.min( last, Math.floor( p ) );
                var to = Math.min( last, from + 1 );
                var value = Math.round( stages[ from ].value + ( stages[ to ].value - stages[ from ].value ) * ( p - from ) );
                number.textContent = String( value );
                unit.textContent = value === 1 ? one : many;
            }
            if ( now === shown ) { return; }
            shown = now;
            if ( !same ) { number.textContent = stages[ now ].label; unit.textContent = ''; }
            line.textContent = stages[ now ].note || ( same ? stages[ now ].label : '' );
            stages.forEach( function ( stage, index ) { stage.item.classList.toggle( 'is-now', index === now ); } );
        }
        function queue() { if ( !queued ) { queued = true; window.requestAnimationFrame( draw ); } }
        root.classList.toggle( 'is-words', !same );
        window.addEventListener( 'scroll', queue, { passive: true } );
        window.addEventListener( 'resize', function () { top = headerHeight(); root.style.setProperty( '--sstory-top', top + 'px' ); queue(); } );
        draw();
    }

    function start() { document.querySelectorAll( '.mba-pro-sstory' ).forEach( init ); }
    if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', start ); } else { start(); }
} )();
