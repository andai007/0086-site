# External Media Setup

This GitHub-ready copy keeps normal assets in the repo and serves only the very large videos from GitHub Release assets.

## Files
- Repo copy: HTML, CSS, JS, images, and all assets up to 100 MiB
- External media bundle: `/Users/andai007/Desktop/0086-large-media-20260318`

## Fast Path
1. The release asset URLs are already wired in `assets/external-media-config.js`.
2. Publish this repo to GitHub Pages from `main`.
3. If you ever move these files away from GitHub Releases, update `overrides` in `assets/external-media-config.js`.

## If Paths Change
- `overrides` is the source of truth for the 13 externalized videos.
- `base` is unused in the current setup and can stay as a placeholder.

## Manifest
- See `external-media-manifest.json` for the exact file list, sizes, page dependencies, and GitHub Release URLs.
- The current externalization threshold in this publish variant is 100 MiB.
