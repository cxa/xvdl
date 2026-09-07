# XVDL v260907.1

## What's Changed

- Adds Sparkle updates with signed feeds and archives, plus **XVDL > Check for Updates…**.
- Shows an **Update / Later** prompt near a visible video on X at most once a day, after downloads and their result messages finish.
- Opens XVDL from the update prompt to download, verify, install, and relaunch the app.
- Publishes a universal macOS app for Apple silicon and Intel.

Existing users need to install this release once through Homebrew or by replacing `XVDL.app`. Subsequent releases can use the built-in updater.

## Install

### Homebrew

```sh
brew tap cxa/xvdl https://github.com/cxa/xvdl
brew install --cask xvdl
open -a XVDL
```

Then enable XVDL in `Safari > Settings > Extensions` and grant website access for `x.com` and `twitter.com`.

### Manual

1. Download `XVDL-260907.1-macos.zip` from this release.
2. Unzip it and move `XVDL.app` to `/Applications`.
3. Open `XVDL.app` once.
4. Enable XVDL in `Safari > Settings > Extensions`.
5. Grant website access for `x.com` and `twitter.com`.

For Safari web apps created with Add to Dock, open the web app, choose the app name in the menu bar, then `Settings > Extensions`, enable XVDL, and grant website access.
