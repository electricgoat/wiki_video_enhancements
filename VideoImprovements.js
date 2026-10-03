/**
 * VideoImprovements: TimedMediaHandler (TMH) video player improvements
 * https://github.com/electricgoat/wiki_video_enhancements
 *
 * - Play the uploaded original by default, keeping the transcodes selectable
 * - Size the media dialog to the video, without black bars, within the viewport
 */
( function () {
	'use strict';

	// Videos narrower than UPSCALE_BELOW get the first factor that makes them
	// wider than UPSCALE_TO, or else the last factor (widths in video pixels)
	var UPSCALE_BELOW = 480;
	var UPSCALE_TO = 640;
	var UPSCALE_FACTORS = [ 1.5, 2 ];

	/* Prefer Source quality over transcodes */

	function preferOriginal( videojs ) {
		if ( !videojs || typeof videojs.hook !== 'function' ||
			videojs.tmhPreferOriginalInstalled ) {
			return;
		}
		videojs.tmhPreferOriginalInstalled = true;

		videojs.hook( 'beforesetup', function ( element, options ) {
			// Scope this to TMH videos using its resolution switcher
			if ( element.nodeName.toLowerCase() !== 'video' ||
				!element.hasAttribute( 'data-mw-tmh' ) ||
				!options.plugins || !options.plugins.videoJsResolutionSwitcher ||
				options.sources ) {
				return {};
			}

			// TMH labels originals with res=99999
			// Respect the browser's codec support and keep every transcode
			var sources = element.querySelectorAll( 'source' );
			for ( var i = 0; i < sources.length; i++ ) {
				var source = sources[ i ];
				if ( source.getAttribute( 'res' ) === '99999' &&
					!source.hasAttribute( 'data-transcodekey' ) &&
					source.type && element.canPlayType( source.type ) ) {
					// Also prefer it during Video.js's initial source selection,
					// before the resolution switcher initializes
					element.insertBefore( source, element.firstChild );
					return {
						plugins: {
							videoJsResolutionSwitcher: { default: 99999 }
						}
					};
				}
			}
			return {};
		} );
	}

	/* Size the media dialog to the video */

	// TMH marks the original as the source without data-transcodekey;
	// fall back to the largest transcode
	function sourceSize( video ) {
		var sources = video.querySelectorAll( 'source' );
		var best = null;
		for ( var i = 0; i < sources.length; i++ ) {
			var width = parseInt( sources[ i ].getAttribute( 'data-width' ), 10 );
			var height = parseInt( sources[ i ].getAttribute( 'data-height' ), 10 );
			if ( !( width > 0 && height > 0 ) ) {
				continue;
			}
			if ( !sources[ i ].hasAttribute( 'data-transcodekey' ) ) {
				return { width: width, height: height };
			}
			if ( !best || width > best.width ) {
				best = { width: width, height: height };
			}
		}
		return best;
	}

	// The box fixed-position dialogs are laid out in. Unlike
	// documentElement.clientWidth, it excludes the scrollbar gutter that OOUI
	// reserves while a modal is open.
	function viewportSize() {
		var probe = document.createElement( 'div' );
		probe.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;' +
			'visibility:hidden;pointer-events:none';
		document.body.appendChild( probe );
		var rect = probe.getBoundingClientRect();
		document.body.removeChild( probe );
		return rect;
	}

	function upscaleFactor( width ) {
		if ( width >= UPSCALE_BELOW ) {
			return 1;
		}
		for ( var i = 0; i < UPSCALE_FACTORS.length - 1; i++ ) {
			if ( width * UPSCALE_FACTORS[ i ] > UPSCALE_TO ) {
				return UPSCALE_FACTORS[ i ];
			}
		}
		return UPSCALE_FACTORS[ UPSCALE_FACTORS.length - 1 ];
	}

	function sizeDialog( MediaDialog ) {
		var proto = MediaDialog && MediaDialog.prototype;
		if ( !proto || proto.tmhBodySize ) {
			return;
		}
		var getSize = proto.getSize;
		var getSizeProperties = proto.getSizeProperties;
		var getBodyHeight = proto.getBodyHeight;

		// Body size in CSS pixels with the video's aspect ratio: one pixel per
		// video pixel (upscaled if small), shrunk to fit the viewport.
		// Null leaves the dialog to TMH.
		proto.tmhBodySize = function () {
			var video = this.$video && this.$video.get( 0 );
			// TMH asks for a full-window dialog on devices without the Fullscreen API
			var size = this.size !== 'full' && video &&
				video.nodeName.toLowerCase() === 'video' && sourceSize( video );
			if ( !size ) {
				return null;
			}
			var style = window.getComputedStyle( this.$frame.get( 0 ) );
			// OOUI only clips an oversized frame, one side at a time, so fit it here.
			// Keep its 1em inset at the top and bottom, and use it at the sides too.
			var inset = parseFloat( style.top ) + parseFloat( style.bottom );
			// Computed styles, not rects: the frame is scaled during its open transition
			var chromeX = parseFloat( style.borderLeftWidth ) +
				parseFloat( style.borderRightWidth );
			var chromeY = parseFloat( style.borderTopWidth ) +
				parseFloat( style.borderBottomWidth ) +
				this.$head.outerHeight( true ) + this.$foot.outerHeight( true );
			var viewport = viewportSize();
			var scale = Math.min(
				upscaleFactor( size.width ),
				( viewport.width - inset - chromeX ) / size.width,
				( viewport.height - inset - chromeY ) / size.height
			);
			// Unrounded, so no sub-pixel bars
			return scale > 0 ? {
				width: size.width * scale,
				height: size.height * scale,
				chromeX: chromeX
			} : null;
		};

		// OOUI switches to a full-window layout whenever the viewport is narrower
		// than the named size (900px); keep a floating dialog that fits instead
		proto.getSize = function () {
			var size = getSize.call( this );
			return size === 'full' && this.tmhBodySize() ? this.size : size;
		};

		proto.getSizeProperties = function () {
			var body = this.tmhBodySize();
			return body ? { width: body.width + body.chromeX } :
				getSizeProperties.call( this );
		};

		proto.getBodyHeight = function () {
			var body = this.tmhBodySize();
			return body ? body.height : getBodyHeight.call( this );
		};
	}

	// Load TMH's player code only on pages with TMH videos, and early:
	// both changes must be in place before a player is created
	var loading = false;
	mw.hook( 'wikipage.content' ).add( function ( $content ) {
		if ( loading || !$content.find( 'video[data-mw-tmh]' ).length ) {
			return;
		}
		loading = true;
		// Separately, so that one failing leaves the other working
		mw.loader.using( 'ext.tmh.video-js' ).then( function () {
			preferOriginal( window.videojs );
		} );
		mw.loader.using( 'ext.tmh.player.dialog' ).then( function ( require ) {
			sizeDialog( require( 'ext.tmh.player.dialog' ).MediaDialog );
		} );
	} );
}() );
