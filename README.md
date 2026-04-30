<h1>
  <img src="extension/icons/icon-128.png" alt="XVDL icon" width="40" height="40" align="left">
  XVDL
</h1>

XVDL is a macOS Safari extension that adds an `XVDL` button to videos in X/Twitter posts and saves available MP4 variants to your Downloads folder. It also works in Safari web apps created with Add to Dock after the extension is enabled for that web app.

## Install

1. Download `XVDL-260430.0-macos.zip` from GitHub Releases.
2. Unzip it.
3. Move `XVDL.app` to `/Applications`.
4. Open `XVDL.app` once.
5. Open `Safari > Settings > Extensions`.
6. Enable XVDL.
7. Grant website access for `x.com` and `twitter.com`.

For Safari web apps created with Add to Dock, open the web app, choose the app name in the menu bar, then `Settings > Extensions`, enable XVDL, and grant website access.

## Usage

Open a post on X/Twitter that contains a video. When XVDL can find a downloadable MP4 variant, the `XVDL` button appears on the video. Click it to save the video to Downloads.

The button only appears when the page exposes downloadable video data for that post.

## Privacy and Use

- Only download videos that you own, have permission to save, or are otherwise authorized to download.
- XVDL does not collect, store, sell, or transmit user data.
- XVDL does not upload downloaded media or video metadata to any server.

## Build From Source

```sh
git clone https://github.com/cxa/xvdl.git
cd xvdl
npm run validate
npm run package:safari
open Safari/XVDL/XVDL.xcodeproj
```

In Xcode, select your signing team, build and run `XVDL`, then enable the extension in Safari settings.

---

Vibed with 💖 by [realazy](https://x.com/_c_x_a_). No copyright reserved.
