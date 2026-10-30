// Originally a Cloudflare Access replacement for azuread.js (Part C Phase 2
// of plans/glyco-me-dev-deploy-auth.md, glycome repo); as of
// plans/orcid-self-service-login.md (same repo, 2026-10-21) the backend
// itself moved off Access's ORCID-whitelist login onto a Worker-hosted
// session talking to ORCID's own OIDC directly — this file's job is
// unchanged from the frontend's point of view: "ask /api/whoami, let the
// Worker's own cookie (httpOnly — never readable from JS) carry the
// session." No token management here at all, same as before; only the
// login/logout endpoint URLs changed.
// Importing the full 'mascp-jstools' barrel would drag in TrackRendererComponent
// and GatorComponent, which pull in glycan.js/sviewer (~800KB) purely for the
// genome-track drawing feature — nothing this file touches. Import just the
// lightweight MASCP core + GatorDataReader instead, and wire them together the
// same way mascp-jstools/js/index.js does.
import MASCP from 'mascp-jstools/js/lib/MASCP';
import GatorDataReader from 'mascp-jstools/js/lib/GatorDataReader';
MASCP.GatorDataReader = GatorDataReader;

// GatorDataReader sends this as the x-api-key header on every request (see
// mascp-jstools/js/lib/Service.js) — ccg-shared-backend's /api/data/latest/*
// checks it as a Worker-side shared secret (src/lib/dataindex.mjs's
// DATA_API_KEY), reusing this existing mechanism rather than adding a
// Cloudflare Access Service Token (which would need new frontend code to
// send its own two headers, for no real security gain). basic.js (the
// module this replaces) set this too — easy to miss that it needs
// re-setting here, since nothing else in this file touches GatorDataReader
// config.
MASCP.GATOR_CLIENT_ID = process.env.CLIENT_ID;

// Without this, GatorDataReader.js falls back to its own hardcoded default
// (test.glycocode.com, or same-origin "/api") — completely ignoring
// ROOT_API, so a test deploy (ROOT_API=https://test.glyco.me) silently kept
// hitting the wrong backend. The old azuread.js-era auth.js this file
// replaces set this too (same "easy to miss" class of bug as
// GATOR_CLIENT_ID above) — lost when that file was removed, since nothing
// else in the new Cloudflare Access flow touches GatorDataReader config
// either.
MASCP.GatorDataReader.server = process.env.ROOT_API;

const WHOAMI_URL = `${process.env.ROOT_API}/api/whoami`;
// Starts the ORCID OAuth round trip directly against ccg-shared-backend
// (src/lib/orcid-auth.mjs) — previously this was Access's own auto-login,
// triggered just by requesting an Access-gated URL. Now the Worker fronts
// nothing at the edge for this, so the frontend must explicitly kick off
// login via this endpoint rather than just asking for a protected resource.
const LOGIN_URL = `${process.env.ROOT_API}/api/login`;
// Was Access's own `/cdn-cgi/access/logout`; now the Worker's own endpoint
// (src/lib/orcid-auth.mjs's handleLogout) — a new capability Access itself
// never exposed in this codebase at all.
const LOGOUT_URL = `${process.env.ROOT_API}/api/logout`;
// Generic per-user JSON bucket (src/lib/prefs.mjs in ccg-shared-backend) —
// GET returns the whole blob, PUT replaces it wholesale (no server-side
// merge), so setPrefs() below has to read-modify-write.
const PREFS_URL = `${process.env.ROOT_API}/api/prefs`;
const LAST_ORCID_KEY = 'lastOrcidId';

// Identity is cached in memory only — no localStorage token/profile, unlike the
// Auth0 path this replaces. The session cookie is httpOnly and inaccessible to
// JS; that's a deliberate security improvement, not a gap, per the plan.
let currentOrcidId = null;
let currentName = null;
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
let prefsPromise = null;

// Cached the same way getLoginStatus() caches loginStatusPromise — one fetch
// per login session, not one per caller. Cleared whenever the login/logout
// paths below clear loginStatusPromise, so a fresh session re-fetches.
const getPrefs = () => {
    if (!prefsPromise) {
        prefsPromise = fetch(PREFS_URL, { credentials: 'include' })
            .then(response => response.ok ? response.json() : {})
            .catch(err => {
                console.log('[auth] getPrefs: /api/prefs unreachable', err);
                return {};
            });
    }
    return prefsPromise;
};

// The endpoint replaces the whole blob (no server-side merge), so this reads
// the current one, merges `partial` in, and writes the merged result back —
// fine for a single user editing their own settings from one tab at a time.
const setPrefs = (partial) => {
    return getPrefs()
        .then(current => ({ ...current, ...partial }))
        .then(merged => fetch(PREFS_URL, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(merged),
        }).then(() => { prefsPromise = Promise.resolve(merged); }));
};

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
                        currentName = null;
                        currentGivenName = null;
                        currentFamilyName = null;
                        return false;
                    }
                    return response.json().then(body => {
                        currentOrcidId = body.orcidId;
                        currentName = body.name ?? null;
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
                    currentName = null;
                    currentGivenName = null;
                    currentFamilyName = null;
                    return false;
                });
        }
    }
    return loginStatusPromise;
};

const getUserId = () => currentOrcidId;

// givenName/familyName are populated only via a still-valid pre-cutover
// Access session (see plans/orcid-self-service-login.md's Phase 2b/4 —
// ORCID's own token response used by the new login flow returns a single
// `name` field, not a given/family breakdown) — both null once that fallback
// is retired (Phase 4). getFullName() below is the one that's always
// populated for any real login, old or new; prefer it for display.
const getUserName = () => [currentGivenName, currentFamilyName];

const getFullName = () => currentName;

const getLastUserName = () => localStorage.getItem(LAST_ORCID_KEY);

const clearLastUser = () => localStorage.removeItem(LAST_ORCID_KEY);

// A no-cors fetch to Access's old logout endpoint (the previous approach
// here) turned out not to reliably clear the session cookie at all —
// confirmed in Firefox, the cookie was still live afterward. Browsers are
// inconsistent about applying Set-Cookie from an opaque cross-site response;
// a real navigation doesn't have that problem, and the session cookie is
// SameSite=Lax (see session.mjs) — same known/accepted cross-site-fetch
// constraint as the login flow below, a real navigation sidesteps it the
// same way. A popup gets a real navigation without a full-page redirect away
// from the current page (which would strand the user on test.glyco.me — a
// different origin with no site content routed to it, and there's no
// returnTo param to redirect back with). Nothing on the other end signals
// completion, so this just waits a beat for the (practically instant, no
// user interaction) logout to land, then closes the popup itself — closing a
// window you opened is allowed regardless of its current cross-origin content.
const performLogout = () => {
    return new Promise(resolve => {
        const popup = window.open(LOGOUT_URL, 'cloudflare-logout', 'width=500,height=600');
        const finish = () => {
            if (popup && !popup.closed) popup.close();
            loginStatusPromise = null;
            prefsPromise = null;
            currentOrcidId = null;
            currentName = null;
            currentGivenName = null;
            currentFamilyName = null;
            resolve();
        };
        if (!popup) {
            // Popup blocked — fall back to a full-page redirect; logout still
            // completes, the user just lands wherever handleLogout redirects
            // to afterward (the site root, per src/lib/orcid-auth.mjs) instead
            // of staying on the current page.
            window.location.href = LOGOUT_URL;
            return;
        }
        setTimeout(finish, 1000);
    });
};

// There's no "redirect back to an arbitrary page after login" — only
// ccg-shared-backend's own hardcoded redirect to /api/whoami (or
// /api/whoami?popup) once the ORCID round trip completes (see
// src/lib/orcid-auth.mjs's handleOAuthCallback). The frontend's own origin is
// also never the same as this Worker's (see Part C), so the popup can't
// signal completion by navigating back to "our" origin the way the old Auth0
// popup flow did — reading popup.location from a cross-origin popup throws a
// SecurityError even once login has fully succeeded, it's cross-origin from
// first open to last close. Instead, `?popup` tells /api/login to carry that
// flag through to its final redirect, landing on a tiny self-closing page
// (src/worker.mjs's handleSelfService) rather than raw JSON — the popup
// closes itself, and `popup.closed` (same-window property, no cross-origin
// read involved) is what the poll below actually detects.
const tryLoggingIn = () => {
    return new Promise(resolve => {
        const popup = window.open(`${LOGIN_URL}?popup`, 'cloudflare-login', 'width=500,height=600');
        if (!popup) {
            // Popup blocked — fall back to a full-page redirect; the user ends up
            // looking at raw JSON momentarily, but login still completes.
            window.location.href = LOGIN_URL;
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
                prefsPromise = null;
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
        window.location.href = LOGIN_URL;
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
    getFullName,
    performLogout,
    getPrefs,
    setPrefs,
};
