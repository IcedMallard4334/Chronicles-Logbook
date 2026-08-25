const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

// server.js is deployed INSIDE the dist folder (see deploy.yml), so
// __dirname already points at the built frontend output.
const DIST_DIR = __dirname;
const DOCS_DIR = path.join(DIST_DIR, "docs");

// Serve the MkDocs site as real static files, with directory-index resolution
// (e.g. /docs/ -> docs/index.html, /docs/getting-started/ -> .../index.html)
app.use(
  "/docs",
  express.static(DOCS_DIR, {
    extensions: ["html"],
  })
);

// Serve the React app's static assets (JS, CSS, images, etc.)
app.use(express.static(DIST_DIR));

// SPA fallback: any other route that isn't a real file or under /docs
// goes to the React app's index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});