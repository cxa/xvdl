# XVDL v260907.0

## What's Changed

- Fixes false download failures for large videos by keeping the Safari extension active until the download result arrives.
- Shows an unknown-status message when communication is interrupted, so an unconfirmed result is not reported as a failed download.
- Prevents repeated clicks from starting another download while the current one is still pending.

## Install

### Homebrew

```sh
brew tap cxa/xvdl https://github.com/cxa/xvdl
brew install --cask xvdl
open -a XVDL
```

Then enable XVDL in `Safari > Settings > Extensions` and grant website access for `x.com` and `twitter.com`.

### Manual

1. Download `XVDL-260907.0-macos.zip` from this release.
2. Unzip it and move `XVDL.app` to `/Applications`.
3. Open `XVDL.app` once.
4. Enable XVDL in `Safari > Settings > Extensions`.
5. Grant website access for `x.com` and `twitter.com`.

For Safari web apps created with Add to Dock, open the web app, choose the app name in the menu bar, then `Settings > Extensions`, enable XVDL, and grant website access.
