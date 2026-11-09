# app10-next migration backup

This directory preserves the uncommitted app10 work that existed before the app10-next isolation work.

- Source HEAD: 35120ea (Consolidate organic compound routes and audit duplicate entries)
- data.js.txt: working-copy data.js at backup time (HEAD + 46 added compounds, +570 lines)
- data-46.patch.txt: git diff of the 570-line addition (pure additions, 0 deletions)
- index-manifest.js.txt: untracked 431-page fetch manifest at backup time
- index-audit.js.txt: untracked 65-finding name audit at backup time
- pp10-concept-index.html.txt / pp10-concept-README.md.txt: copy of the existing design-lab mock (also left in place)
- manifest.json: byte sizes and SHA-256 hashes

These files are intentionally saved with .txt extensions. They are reference data, not scripts, and must not be loaded as application code. No credentials or personal information are included.

Restored site/app10/data.js is the verified HEAD content; the untracked index-manifest.js / index-audit.js were moved into the app10-next version after review. site/app10 tracked diff is expected to be zero.
