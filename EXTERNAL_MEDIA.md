# External Media Setup

This GitHub-ready copy externalizes large videos and images so the repository stays practical to push and publish.

## Files
- Repo copy: HTML, CSS, JS, and smaller local assets
- External media bundle: upload the contents of `/Users/andai007/Desktop/0086-large-media-20260318`

## Fast Path
1. Upload the large media bundle to any public static host while preserving its folder structure.
2. Edit `assets/external-media-config.js`.
3. Replace `https://YOUR-PUBLIC-MEDIA-HOST/0086-media` with the public base URL of that upload.
4. Publish this repo to GitHub and enable GitHub Pages.

## If Paths Change
- Keep `base` as-is if your external host preserves the same folder structure.
- Use `overrides` if one or more files must point to fully custom URLs.

## Manifest
- See `external-media-manifest.json` for the exact file list, sizes, and page dependencies.
- The current externalization threshold in this publish variant is 5 MiB.
