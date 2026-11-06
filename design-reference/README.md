# design-reference (read-only)

The approved Tonkpad.fun design, exported from the design canvas.

- `explore.html` is the Explore screen exactly as designed, running in your browser (double-click it). The radar sweep, live dots and hover effects move. The tabs, launchpad chips, All Chains menu and search all work. Links to other screens show a "later module" note.
- `explore.dc.html` is the canvas source for the same screen. Exact style values are in the markup; the data and filter logic are in the `<script type="text/x-dc">` block.
- `screenshots/explore-1440.png` is the full page at 1440 px wide.
- `assets/tokens/` holds the token art (SVG), named by ticker.
- `fonts/` has local copies of Bricolage Grotesque, Geist and Geist Mono (SIL Open Font License), so the page looks right offline.
- `runtime/dc-runtime.js` is a tiny script that lets the canvas source run on its own. It is not part of the app.
