// Cloudflare Access replacement for azuread.js — see Part C Phase 2 of
// plans/glyco-me-dev-deploy-auth.md (glycome repo). The frontend's job shrinks to
// "ask /api/whoami, let Access's own cookie (CF_Authorization, httpOnly — never
// readable from JS, by design) carry the session." No token management here at all.
import MASCP from 'mascp-jstools';

const WHOAMI_URL = `${process.env.ROOT_API}/api/whoami`;
const LOGOUT_URL = `${process.env.ROOT_API}/cdn-cgi/access/logout`;
const LAST_ORCID_KEY = 'lastOrcidId';

// Identity is cached in memory only — no localStorage token/profile, unlike the
// Auth0 path this replaces. Access's own cookie is httpOnly and inaccessible to JS;
// that's a deliberate security improvement, not a gap, per the plan.
let currentOrcidId = null;
let currentGivenName = null;
let currentFamilyName = null;

const ensureApiLogin = () => {
    // Compatibility shim for any code still reading MASCP.GatorDataReader's own
    // auth flags (e.g. glycodomain data fetching, pre-R2-migration) — does not
    // participate in the Cloudflare Access session itself.
    return Promise.resolve().then(() => {
        MASCP.GatorDataReader.anonymous = true;
    });
};

let loginStatusPromise = null;

// Reuses the existing SKIP_AUTHENTICATION convention (config/dev.env.js already
// sets this when ROOT_API isn't configured — previously unconsumed anywhere).
// Also short-circuits to anonymous on any fetch failure (backend unreachable in
// local dev without Cloudflare in front), not just when the flag is explicitly set.
const getLoginStatus = () => {
    if (!loginStatusPromise) {
        if (process.env.SKIP_AUTHENTICATION) {
            loginStatusPromise = Promise.resolve(false);
        } else {
            loginStatusPromise = fetch(WHOAMI_URL, { credentials: 'include' })
                .then(response => {
                    if (!response.ok) {
                        currentOrcidId = null;
                        currentGivenName = null;
                        currentFamilyName = null;
                        return false;
                    }
                    return response.json().then(body => {
                        currentOrcidId = body.orcidId;
                        currentGivenName = body.givenName ?? null;
                        currentFamilyName = body.familyName ?? null;
                        if (currentOrcidId) {
                            localStorage.setItem(LAST_ORCID_KEY, currentOrcidId);
                        }
                        return !!currentOrcidId;
                    });
                })
                .catch(err => {
                    console.log('[auth] getLoginStatus: /api/whoami unreachable', err);
                    currentOrcidId = null;
                    currentGivenName = null;
                    currentFamilyName = null;
                    return false;
                });
        }
    }
    return loginStatusPromise;
};

const getUserId = () => currentOrcidId;

// ORCID's name claims land in the Access JWT's custom.* fields, not the top
// level — /api/whoami (worker.mjs) already unpacks that; nulls here just mean
// ORCID itself didn't have a name on file for this iD, not a missing feature.
// ccg-userstatus.js falls back to displaying the raw ORCID iD in that case.
const getUserName = () => [currentGivenName, currentFamilyName];

const getLastUserName = () => localStorage.getItem(LAST_ORCID_KEY);

const clearLastUser = () => localStorage.removeItem(LAST_ORCID_KEY);

// A no-cors fetch to this endpoint (the previous approach here) turned out not
// to reliably clear CF_Authorization at all — confirmed in Firefox, the cookie
// was still live afterward. Browsers are inconsistent about applying
// Set-Cookie from an opaque cross-site response, and Access's own docs only
// ever describe logout as something a user "visits" — a real navigation, not
// a fetch. A popup gets a real navigation without a full-page redirect away
// from the current page (which would strand the user on test.glyco.me — a
// different origin with no site content routed to it, and logout has no
// documented returnTo param to redirect back with). Unlike login, nothing on
// the other end signals completion, so this just waits a beat for the
// (practically instant, no user interaction) logout to land, then closes the
// popup itself — closing a window you opened is allowed regardless of its
// current cross-origin content.
const performLogout = () => {
    return new Promise(resolve => {
        const popup = window.open(LOGOUT_URL, 'cloudflare-logout', 'width=500,height=600');
        const finish = () => {
            if (popup && !popup.closed) popup.close();
            loginStatusPromise = null;
            currentOrcidId = null;
            currentGivenName = null;
            currentFamilyName = null;
            resolve();
        };
        if (!popup) {
            // Popup blocked — fall back to a full-page redirect; logout still
            // completes, the user just lands on Access's own logged-out page.
            window.location.href = LOGOUT_URL;
            return;
        }
        setTimeout(finish, 1000);
    });
};

// Access has no "redirect back to an arbitrary page after login" for a page that
// isn't itself behind Access (the public Hugo site isn't) — only "redirect back to
// the exact protected URL you came from". The frontend's own origin is also never
// the same as this Worker's (see Part C), so the popup can't signal completion by
// navigating back to "our" origin the way the old Auth0 popup flow did — reading
// popup.location from a cross-origin popup throws a SecurityError even once
// login has fully succeeded, it's cross-origin from first open to last close.
// Instead, `?popup=1` tells the Worker's /api/whoami (src/worker.mjs) to serve a
// tiny self-closing page rather than raw JSON once Access lets the request
// through — the popup closes itself, and `popup.closed` (same-window property,
// no cross-origin read involved) is what the poll below actually detects.
const tryLoggingIn = () => {
    return new Promise(resolve => {
        const popup = window.open(`${WHOAMI_URL}?popup=1`, 'cloudflare-login', 'width=500,height=600');
        if (!popup) {
            // Popup blocked — fall back to a full-page redirect; the user ends up
            // looking at raw JSON momentarily, but login still completes.
            window.location.href = WHOAMI_URL;
            return;
        }
        const poll = setInterval(() => {
            if (popup.closed) {
                clearInterval(poll);
                // getLoginStatus() caches its result — an earlier (pre-login)
                // check already resolved it to "logged out", and without
                // clearing that cache here this would just return the same
                // stale answer instead of actually re-checking.
                loginStatusPromise = null;
                resolve(getLoginStatus());
            }
        }, 500);
    });
};

// A plain full-page redirect, for entry points that aren't a click handler on an
// already-loaded page (e.g. a dedicated /login/ page bootstrapped on load —
// popping a window from there would be a worse UX, not better). Lands on raw
// JSON after login; there's no "return to where I came from" step (see above).
const tryLoggingInRedirect = () => {
    return Promise.resolve().then(() => {
        window.location.href = WHOAMI_URL;
    });
};

export {
    ensureApiLogin,
    getLoginStatus,
    tryLoggingIn,
    tryLoggingInRedirect,
    getLastUserName,
    clearLastUser,
    getUserId,
    getUserName,
    performLogout,
};
