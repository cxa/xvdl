# XVDL v260502.0

## What's Changed

- Adds XVDL download buttons to video thumbnails on X/Twitter profile media grids.
- Adds an XVDL download button to the opened video detail view.
- Resolves video variants lazily when X/Twitter does not expose media data during the initial page render.
- Saves videos to the real macOS Downloads folder and shows the saved path in the success message.
- Adds Homebrew cask distribution with checksum pinning after release publication.

## Install

### Homebrew

```sh
brew tap cxa/xvdl https://github.com/cxa/xvdl
brew install --cask xvdl
open -a XVDL
```

Then enable XVDL in `Safari > Settings > Extensions` and grant website access for `x.com` and `twitter.com`.

### Manual

1. Download `XVDL-260502.0-macos.zip` from this release.
2. Unzip it and move `XVDL.app` to `/Applications`.
3. Open `XVDL.app` once.
4. Enable XVDL in `Safari > Settings > Extensions`.
5. Grant website access for `x.com` and `twitter.com`.

For Safari web apps created with Add to Dock, open the web app, choose the app name in the menu bar, then `Settings > Extensions`, enable XVDL, and grant website access.
