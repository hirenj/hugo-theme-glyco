import { queueBootstrapSlot } from '../js/bootstrap';

// Auth0's redirect flow landed back here with a token in the URL hash to
// parse (see azuread.js's parseLogin) — Cloudflare Access has no equivalent
// callback step, it returns the browser straight to the originally
// requested protected URL instead (see cloudflare.js). Nothing should link
// here anymore; this just sends anyone who still does back home.
queueBootstrapSlot(() => {
  window.location.href = '/';
});