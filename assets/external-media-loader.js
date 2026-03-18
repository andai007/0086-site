(function () {
  function normalizePath(path) {
    return String(path || "").replace(/^\.\//, "");
  }

  function getSettings() {
    const settings = window.__0086ExternalMedia || {};
    const base = typeof settings.base === "string" ? settings.base.replace(/\/+$/, "") : "";
    const overrides = settings.overrides && typeof settings.overrides === "object" ? settings.overrides : {};
    return { base, overrides };
  }

  function encodePath(path) {
    return path
      .split("/")
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join("/");
  }

  function resolveUrl(path) {
    path = normalizePath(path);
    const settings = getSettings();
    if (settings.overrides[path]) {
      return settings.overrides[path];
    }
    if (!settings.base || settings.base.indexOf("YOUR-PUBLIC-MEDIA-HOST") !== -1) {
      return "";
    }
    return settings.base + "/" + encodePath(path);
  }

  function ensureNoteStyle() {
    if (document.getElementById("external-media-note-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "external-media-note-style";
    style.textContent = [
      ".external-media-note {",
      "  margin-top: 12px;",
      "  font-size: 12px;",
      "  line-height: 1.5;",
      "  color: rgba(0, 0, 0, 0.72);",
      "}",
      ".external-media-note code {",
      "  font-family: inherit;",
      "}",
      "video[data-external-missing=\"true\"] {",
      "  min-height: 180px;",
      "  background: rgba(0, 0, 0, 0.06);",
      "}",
      "@media (max-width: 768px) {",
      "  video[data-external-missing=\"true\"] {",
      "    min-height: 120px;",
      "  }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function addMissingNote(video, path) {
    if (!video || (video.nextElementSibling && video.nextElementSibling.classList.contains("external-media-note"))) {
      return;
    }
    ensureNoteStyle();
    video.setAttribute("data-external-missing", "true");
    const note = document.createElement("p");
    note.className = "external-media-note";
    note.innerHTML = "This video is stored outside the GitHub repo. Update <code>assets/external-media-config.js</code> to point <code>" + path + "</code> to a public URL.";
    video.insertAdjacentElement("afterend", note);
  }

  function applyExternalSource(node) {
    const path = normalizePath(node.getAttribute("data-external-src"));
    if (!path) {
      return;
    }
    const url = resolveUrl(path);
    if (!url) {
      const owner = node.tagName === "SOURCE" ? node.parentElement : node;
      addMissingNote(owner, path);
      return;
    }

    if (node.tagName === "SOURCE") {
      node.src = url;
      const video = node.parentElement;
      if (video && video.tagName === "VIDEO") {
        video.load();
      }
      return;
    }

    node.src = url;
  }

  function applyExternalPoster(node) {
    const path = normalizePath(node.getAttribute("data-external-poster"));
    if (!path) {
      return;
    }
    const url = resolveUrl(path);
    if (!url) {
      return;
    }
    node.poster = url;
  }

  window.resolve0086ExternalMedia = function (path) {
    const normalized = normalizePath(path);
    return resolveUrl(normalized) || normalized;
  };

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("img[data-external-src], video[data-external-src], source[data-external-src]").forEach(applyExternalSource);
    document.querySelectorAll("video[data-external-poster]").forEach(applyExternalPoster);
  });
}());
