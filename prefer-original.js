/* 
 * TMH — Prefer Source quality over transcodes 
 * https://github.com/electricgoat/wiki_video_enhancements
 * 
 * TimedMediaPlayer sets source video a to a fake resolution of 99999, ensuring it will never be automatically selected.
 * Override this behaviour and default to source video over TMH-made reencodes, which can be encoded 
 * with significantly higher quality and lower bitrate than Wikitide default of VP9 1080P 2Mbps. 
 * This also helps avoid rescaling for oddly-sized videos.
 * 
 * THIS RELIES ON SOURCE VIDEO FILES BEING ENCODED WELL FOR WEB USE
 * Do not use it unless all the video files uploaded to the wiki are already encoded well to begin with.
 */
( function () {
	'use strict';

	mw.loader.using( 'ext.tmh.video-js' ).then( function () {
		var videojs = window.videojs;
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
	} );
}() );
