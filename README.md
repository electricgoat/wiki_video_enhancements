# Improving video presentation TimedMediaHandler

JavaScript can make the original upload the default while keeping the transcodes in the quality menu. `prefer-original.js` implements this for the Video.js player currently deployed on Blue Archive Wiki. No server configuration change is required.

## Findings

Inspected the live [Anna file page](https://bluearchive.wiki/wiki/File:Anna_interact_1.webm), its source markup, the wiki's siteinfo API and the JavaScript served by ResourceLoader on 2026-09-26.

- MediaWiki: **1.46.0**.
- TimedMediaHandler: **0.6.0**, commit [`78f38abb37c8e2a2811aa45ca0b81f33fb15042c`](https://github.com/wikimedia/mediawiki-extensions-TimedMediaHandler/commit/78f38abb37c8e2a2811aa45ca0b81f33fb15042c).
- Video.js: **8.21.1**.
- The example upload is VP9, 1920 × 1080, listed as **3.99 MB / 1.26 Mbps**. The 1080p VP9 transcode is listed at **1.99 Mbps**. These figures support the bandwidth concern; this investigation did not measure perceptual quality.

The deployed `InlinePlayer.extractResolutions()` assigns originals a synthetic resolution of `99999`. `infuse()` calculates the default from player height and device pixel ratio, excluding resolutions above 1080. Originals are therefore excluded from normal automatic selection even when they are smaller than a transcode.

Simply moving the original `<source>` first does not override that resolution selection. Setting `InlinePlayer.videoConfig.plugins.videoJsResolutionSwitcher.default` is also insufficient: `infuse()` overwrites it for each video.

## Implementation

The script uses Video.js's documented [`beforesetup` hook](https://legacy.videojs.org/guides/hooks/). This runs after TMH prepares its options and before Video.js constructs the player. Returning a partial options object merges it into those options.

For TMH videos with a browser-supported original, the script returns a resolution-switcher default of `99999`. It also moves that source first for Video.js's initial source selection. All source elements, labels and alternative resolutions remain available. The override runs once at creation, so it does not fight a viewer's later quality selection.

The check uses TMH's numeric marker rather than the translated menu text. Audio and unrelated players are left alone. If the original is absent or `canPlayType()` reports it unsupported, TMH retains control of the default. Explicit `options.sources` configurations are left alone as well; the inspected TMH player obtains sources from its HTML instead.

This uses a public Video.js lifecycle hook but relies on TMH's internal resolution marker and plugin name. Recheck after a TMH upgrade. The corresponding [upstream source](https://doc.wikimedia.org/TimedMediaHandler/master/js/js/ext.tmh.player.inline.js.html) is useful background; the downloaded deployed module is the authority for the tested wiki version.

## Try it

1. Copy all of [`prefer-original.js`](prefer-original.js) into [Special:MyPage/common.js](https://bluearchive.wiki/wiki/Special:MyPage/common.js). This affects your account only.
2. Reload the file page, allow its scripts to load, and open the player. The quality selection should be **Source**.
3. Select 480p or 1080p manually, then select Source again. Both should remain usable.
4. In browser developer tools, the active video's `currentSrc` should end with `/9/97/Anna_interact_1.webm`, without `/transcoded/`.

For a temporary test, paste the script into the browser console **before opening a player** and allow `ext.tmh.video-js` to finish loading. It does not change already-created players. Remove the script and reload to undo it.

After testing on the site's supported browsers, an interface administrator can install it as an opt-in gadget, a default gadget, or in `MediaWiki:Common.js`. A ResourceLoader gadget can declare `ext.tmh.video-js` as a dependency. The standalone version explicitly loads that module wherever the script is installed, including pages without videos; a sitewide rollout may want to load the gadget only on pages containing media. Installation must precede player creation, especially for pages with automatic playback.

## Validation and limitations

Tested in a temporary, signed-out headless Chrome 153 profile against the live wiki:

| Check | Result |
| --- | --- |
| Unmodified file-page player | Selected SD 480p at the test viewport |
| Script installed before opening the dialog | Selected Source; decoded at 1920 × 1080 and advanced playback without an error |
| Quality menu | Kept Source, 1080p, 480p, 360p and 240p |
| Manual Source → 480p → Source | Worked; preserved the test position of 5 seconds |
| Additional inline player using the file's source markup | Selected Source |
| Original MIME type changed to an unsupported test type | Selected 480p; kept four playable transcodes |
| Original source removed | Selected 480p; kept four transcodes |
| Non-TMH element | Kept TMH's calculated 480p default |
| Original label translated | Still selected the original by numeric marker |

The last five checks use additional players created in the test tab from the live file's markup. The unsupported-codec case simulates a negative codec-support result; it is not a test on a different browser. Safari, Firefox and mobile playback remain untested.

TMH's launcher calls the original DOM element's `play()` before initializing Video.js to preserve the user gesture. A short request for the server-listed first transcode can therefore occur before this hook. That request was observed in Chrome. The initialized player still selects and plays the uploaded file. Eliminating every startup transcode request would require an earlier change to TMH's source ordering/launcher and is outside this small override.

`canPlayType()` is a capability hint, not a guarantee that a particular file will decode. This script adds no new recovery behavior for corrupt files or network failures. It preserves the deployed switcher's behavior.

The preference applies to every qualifying video, including large originals. That matches the stated upload policy; if future uploads are much larger, a scoped or size-aware policy may be preferable.

`research/` contains the deployed HTML/JS snapshots, their hashes, and the browser inspection/check helpers. These files are investigation evidence and should not be installed on the wiki.

## VideoImprovements gadget

[`VideoImprovements.js`](VideoImprovements.js) and [`VideoImprovements.css`](VideoImprovements.css) combine three changes into one gadget. Each is also available as a standalone file for testing in personal `common.js` or `common.css`:

- [`prefer-original.js`](prefer-original.js) plays the uploaded original by default, as described above.
- [`native-size.js`](native-size.js) sizes the media dialog to the video: one CSS pixel per video pixel, without black bars, and shrunk to fit within the viewport. Videos narrower than 480 pixels are enlarged 1.5×, or 2× if 1.5× would not make them wider than 640 pixels; these values are constants at the top of the script. Narrow windows keep a fitted dialog instead of OOUI's full-window layout, except where TMH requests full-window playback because the device lacks the Fullscreen API.
- [`dialog-separators.css`](dialog-separators.css) keeps OOUI's separator outlines off the video. TMH hides the empty dialog foot only in its full-window layout, so elsewhere the foot's outline covers the bottom row of the video area. The header's outline similarly covers the top row.

The gadget requests TMH's player modules only when the page content contains a TMH video. It requests them as soon as that content loads, so both changes are in place before a player is created unless a video is opened while the page is still loading. Running it alongside the standalone files is harmless: each change installs once.

To install it, an interface administrator creates:

- `MediaWiki:Gadget-VideoImprovements.js` from `VideoImprovements.js`
- `MediaWiki:Gadget-VideoImprovements.css` from `VideoImprovements.css`
- `MediaWiki:Gadget-VideoImprovements` with a description for Special:Preferences, such as "Prefer the source quality for video playback and size the player widnow to the video"
- this line in `MediaWiki:Gadgets-definition`:

```
* VideoImprovements[ResourceLoader|supportsUrlLoad]|VideoImprovements.js|VideoImprovements.css
```

`supportsUrlLoad` allows testing on any page by adding `withgadget=VideoImprovements` to its URL query. Add `default` to enable the gadget for everyone, including logged-out readers.

The gadget was tested in headless Chrome 153 against the live wiki on a file page and an article embedding the same video. Pages without videos did not load TMH's player modules.
