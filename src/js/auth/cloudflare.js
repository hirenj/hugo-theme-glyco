// Originally a Cloudflare Access replacement for azuread.js (Part C Phase 2
// of plans/glyco-me-dev-deploy-auth.md, glycome repo); as of
// plans/orcid-self-service-login.md (same repo, 2026-10-21) the backend
// itself moved off Access's ORCID-whitelist login onto a Worker-hosted
// session talking to ORCID's own OIDC directly — this file's job is
// unchanged from the frontend's point of view: "ask /api/whoami, let the
// Worker's own cookie (httpOnly — never readable from JS) carry the
// session." No token management here at all, same as before; only the
// login/logout endpoint URLs changed.
// This file only needs MASCP.GatorDataReader for auth — not the
// TrackRendererComponent/GatorComponent glycan-drawing components also in the
// full 'mascp-jstools' barrel (js/index.js), which pull in glycan.js/sviewer
// (~800KB) for nothing. Import the two public subpaths mascp-jstools's
// package.json exports instead, and wire them together the same way
// js/index.js does (MASCP.GatorDataReader = GatorDataReader). A prior attempt
// used an unexported deep path (mascp-jstools/js/lib/MASCP) that only
// resolved in glycome, whose webpack config aliases the bare 'mascp-jstools'
// specifier to an absolute path (needed to dedupe symlinked copies) in a way
// that happened to bypass the "exports" field check entirely — other sites'
// builds enforced it normally and failed. These two subpaths are officially
// exported, so plain `import 'mascp-jstools/<subpath>'` resolves everywhere.
import MASCP from 'mascp-jstools/MASCP';
import GatorDataReader from 'mascp-jstools/GatorDataReader';
MASCP.GatorDataReader = GatorDataReader;

// Passkeys as a fast return-visit login, ORCID required before one can be
// registered at all (a passkey has no recoverable identity of its own — see
// ccg-shared-backend's webauthn.mjs) — plans/analytics-passkeys-user-content.md
// section (b) (glycome repo). @simplewebauthn/browser wraps
// navigator.credentials.create()/.get()'s
// base64url<->ArrayBuffer conversions, the same "don't hand-roll the one
// genuinely fiddly part" reasoning as the backend using
// @simplewebauthn/server instead of hand-rolling attestation/assertion
// parsing. A real bundled dependency, not the CDN-script-injection approach
// used for the throwaway manual spike (spikes/webauthn-cpu-spike/ in
// ccg-shared-backend) — this is shipped UI, not a one-off test page.
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

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
// UI feature flags (ccg-shared-backend's src/lib/policy.mjs `flag`-type
// policies) — deliberately identity-optional on the backend (anonymous
// callers get `{ flags: [] }`, not a 401), so this is safe to call
// unconditionally rather than gating it behind getLoginStatus() first.
const FLAGS_URL = `${process.env.ROOT_API}/api/account/flags`;
// Passkey register/login (src/lib/webauthn.mjs in ccg-shared-backend).
const REGISTER_OPTIONS_URL = `${process.env.ROOT_API}/api/webauthn/register/options`;
const REGISTER_VERIFY_URL = `${process.env.ROOT_API}/api/webauthn/register/verify`;
const LOGIN_OPTIONS_URL = `${process.env.ROOT_API}/api/webauthn/login/options`;
const LOGIN_VERIFY_URL = `${process.env.ROOT_API}/api/webauthn/login/verify`;
// ORCID account linking (src/lib/orcid-auth.mjs's handleLinkOrcid/
// handleUnlinkOrcid) — a thin variant of the LOGIN_URL round trip above,
// tagged server-side with the current session rather than starting a fresh
// one; see that file's comments.
const LINK_ORCID_URL = `${process.env.ROOT_API}/api/account/link-orcid`;
const UNLINK_ORCID_URL = `${process.env.ROOT_API}/api/account/orcid-link`;
const PASSKEYS_URL = `${process.env.ROOT_API}/api/account/passkeys`;
// User-uploaded content (src/lib/usercontent.mjs in ccg-shared-backend) —
// plans/analytics-passkeys-user-content.md section (c) / glycome's
// plans/mydata-datasets-consolidation.md Phase 1.
const USERCONTENT_UPLOAD_URL = `${process.env.ROOT_API}/api/usercontent`;
const USERCONTENT_LIST_URL = `${process.env.ROOT_API}/api/account/usercontent`;
// Curated platform dataset listing (src/lib/dataindex.mjs's
// serveDataCatalog in ccg-shared-backend) — glycome's
// plans/mydata-datasets-consolidation.md Phase 4b.
const DATA_CATALOG_URL = `${process.env.ROOT_API}/api/data/catalog`;
const LAST_ORCID_KEY = 'lastOrcidId';

// Identity is cached in memory only — no localStorage token/profile, unlike the
// Auth0 path this replaces. The session cookie is httpOnly and inaccessible to
// JS; that's a deliberate security improvement, not a gap, per the plan.
// currentUserId is the generic "is anyone logged in" identity (set whenever
// /api/whoami returns 200, by ANY login method); currentOrcidId is specifically
// "is this account ORCID-linked" and is null for a passkey-only account with
// nothing linked yet — mirrors the same two-identity split
// getSessionIdentity()/getOrcidIdentity() have on the backend (orcid-auth.mjs).
let currentUserId = null;
let currentOrcidId = null;
let currentName = null;
let currentGivenName = null;
let currentFamilyName = null;
// Set only by the dev-only __ccgAuthDebug hook near the bottom of this file
// — listPasskeys() below checks it first, bypassing the network entirely.
let debugPasskeysOverride = null;

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
let flagsPromise = null;

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

// Cached per session like getPrefs()/getLoginStatus(), cleared alongside
// them on login/logout below. Unlike those two, the endpoint itself works
// for an anonymous caller too (returns an empty array rather than 401), so
// this never needs to wait on getLoginStatus() first.
const getFlags = () => {
    if (!flagsPromise) {
        flagsPromise = process.env.SKIP_AUTHENTICATION
            ? Promise.resolve([])
            : fetch(FLAGS_URL, { credentials: 'include' })
                .then(response => response.ok ? response.json() : { flags: [] })
                .then(body => body.flags ?? [])
                .catch(err => {
                    console.log('[auth] getFlags: /api/account/flags unreachable', err);
                    return [];
                });
    }
    return flagsPromise;
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
                        currentUserId = null;
                        currentOrcidId = null;
                        currentName = null;
                        currentGivenName = null;
                        currentFamilyName = null;
                        return false;
                    }
                    return response.json().then(body => {
                        // userId is what "logged in at all" means now — a
                        // passkey-only account has orcidId: null but is
                        // still logged in (section (b)). Keying this on
                        // orcidId the way it used to be would report such
                        // an account as logged OUT.
                        currentUserId = body.userId ?? null;
                        currentOrcidId = body.orcidId ?? null;
                        currentName = body.name ?? null;
                        currentGivenName = body.givenName ?? null;
                        currentFamilyName = body.familyName ?? null;
                        if (currentOrcidId) {
                            localStorage.setItem(LAST_ORCID_KEY, currentOrcidId);
                        }
                        return !!currentUserId;
                    });
                })
                .catch(err => {
                    console.log('[auth] getLoginStatus: /api/whoami unreachable', err);
                    currentUserId = null;
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

// Account-wide "which glycan renderer style" setting, riding on the same
// generic prefs blob as the `color` field (see getPrefs/setPrefs above) —
// no backend change needed, prefs.mjs stores any JSON shape as-is. Logged
// out, there's no account to attach it to, so it falls back to a plain
// localStorage key instead of just always resetting to the default — once
// a real login happens, the account-wide value takes over (no migration of
// a prior anonymous choice into the account; the two are independent).
const DEFAULT_RENDERER = 'svg';
const LOCAL_RENDERER_KEY = 'preferredRenderer';

const getPreferredRenderer = () => getLoginStatus().then(loggedIn => {
    if (!loggedIn) {
        return localStorage.getItem(LOCAL_RENDERER_KEY) || DEFAULT_RENDERER;
    }
    return getPrefs().then(prefs => prefs.renderer || DEFAULT_RENDERER);
});

const setPreferredRenderer = (name) => getLoginStatus().then(loggedIn => {
    if (!loggedIn) {
        localStorage.setItem(LOCAL_RENDERER_KEY, name);
        return;
    }
    return setPrefs({ renderer: name });
});

const getUserId = () => currentOrcidId;

// Explicit alias for new call sites that specifically want "is this account
// ORCID-linked" (e.g. the linked-accounts UI) rather than the historical
// getUserId() name, which section (b) doesn't repurpose — see this file's
// currentUserId/currentOrcidId comment above for why there are now two.
const getOrcidId = () => currentOrcidId;

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
            invalidateSessionCaches();
            currentUserId = null;
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
                invalidateSessionCaches();
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

// Forces every cached per-session fetch to re-run — needed after anything
// that changes who's logged in or what's linked (register/login/link/unlink
// below), same as the existing login/logout code paths above already do by
// hand in three places each.
const invalidateSessionCaches = () => {
    loginStatusPromise = null;
    prefsPromise = null;
    flagsPromise = null;
};

// Registers a new passkey — either a brand-new, passkey-first account (not
// currently logged in) or a second credential on the already-logged-in
// account (ccg-shared-backend's webauthn.mjs decides which from the
// session, not this call). Rejects with whatever error
// navigator.credentials.create() throws (e.g. the user cancelling the OS
// prompt, 'NotAllowedError') or a plain Error if the server-side verify step
// fails — callers already have a .catch(console.error) pattern for the
// login/logout calls above; this fits the same shape.
const registerPasskey = () => {
    return fetch(REGISTER_OPTIONS_URL, { method: 'POST', credentials: 'include' })
        .then(res => res.json())
        .then(options => startRegistration({ optionsJSON: options }))
        .then(attestationResponse => fetch(REGISTER_VERIFY_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(attestationResponse),
        }))
        .then(res => {
            if (!res.ok) throw new Error('Passkey registration could not be verified.');
            invalidateSessionCaches();
            return getLoginStatus();
        });
};

// Logs in with an existing passkey — discoverable-credential ("usernameless")
// flow, so there's no identity to supply up front: the OS/browser's own
// picker surfaces whichever passkey(s) this origin has stored.
const loginWithPasskey = () => {
    return fetch(LOGIN_OPTIONS_URL, { method: 'POST', credentials: 'include' })
        .then(res => res.json())
        .then(options => startAuthentication({ optionsJSON: options }))
        .then(assertionResponse => fetch(LOGIN_VERIFY_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assertionResponse),
        }))
        .then(res => {
            if (!res.ok) throw new Error('Passkey login could not be verified.');
            invalidateSessionCaches();
            return getLoginStatus();
        });
};

// Links an ORCID iD to the CURRENT account — requires already being logged
// in (by any method); ccg-shared-backend's handleLinkOrcid 401s otherwise.
// Same popup-and-poll shape as tryLoggingIn above (and for the same reason:
// no way to signal completion back across origins except closing the
// popup), reusing the exact same self-closing /api/whoami?popup page on the
// success path. A 409 conflict (this ORCID iD already belongs to a
// different account) lands as a plain-text page IN the popup instead of
// closing it — a rough edge for now; the popup just needs manually closing,
// not a broken flow.
const linkOrcid = () => {
    return new Promise(resolve => {
        const popup = window.open(`${LINK_ORCID_URL}?popup`, 'cloudflare-link-orcid', 'width=500,height=600');
        if (!popup) {
            window.location.href = LINK_ORCID_URL;
            return;
        }
        const poll = setInterval(() => {
            if (popup.closed) {
                clearInterval(poll);
                invalidateSessionCaches();
                resolve(getLoginStatus());
            }
        }, 500);
    });
};

// Removes the ORCID link from the current account. The backend refuses
// (400) if this is the account's only login method — returns
// { ok: false, message } in that case rather than throwing, so the caller
// can show the server's own explanation directly instead of a generic error.
const unlinkOrcid = () => {
    return fetch(UNLINK_ORCID_URL, { method: 'DELETE', credentials: 'include' })
        .then(res => {
            if (res.ok) {
                invalidateSessionCaches();
                return getLoginStatus().then(() => ({ ok: true }));
            }
            return res.text().then(message => ({ ok: false, message }));
        });
};

// Lists the current account's passkeys — [{ credentialId, transports,
// createdAt }], oldest first. Lets the linked-accounts UI show what's
// actually registered (see ccg-shared-backend's handleListPasskeys comment
// for why this exists: there's no client-side way to check "do I already
// have a passkey for this site" before registering one, so visibility
// after the fact is the practical alternative). Not cached like
// getPrefs()/getFlags() — this list changes exactly when the user adds or
// removes one via this same UI, so a fresh fetch each time is simpler than
// another cache to invalidate.
const listPasskeys = () => {
    if (debugPasskeysOverride !== null) return Promise.resolve(debugPasskeysOverride);
    return fetch(PASSKEYS_URL, { credentials: 'include' })
        .then(res => res.ok ? res.json() : { passkeys: [] })
        .then(body => body.passkeys ?? []);
};

// Removes one specific passkey by credential id (from listPasskeys() above).
// Same { ok, message } shape as unlinkOrcid — the backend refuses (400) to
// remove an account's last remaining login method.
const removePasskey = (credentialId) => {
    return fetch(`${PASSKEYS_URL}/${encodeURIComponent(credentialId)}`, { method: 'DELETE', credentials: 'include' })
        .then(res => {
            if (res.ok) return { ok: true };
            return res.text().then(message => ({ ok: false, message }));
        });
};

// Lists the current account's uploaded content —
// [{id, contentType, sizeBytes, label, createdAt}], oldest first, plus the
// account's current usedBytes/quotaBytes (same two numbers an over-quota
// upload's 413 body carries). Not cached — "My uploads" wants a fresh view
// every time it's shown (a delete/upload from another tab should be visible
// on next load), and this isn't on any hot path the way getPrefs()/getFlags()
// are (those run on every page's ccg-userstatus mount; this only runs on the
// My Data page).
const listUserContent = () => {
    return fetch(USERCONTENT_LIST_URL, { credentials: 'include' })
        .then(res => res.ok ? res.json() : { content: [], usedBytes: 0, quotaBytes: 0 });
};

// Uploads one file's raw bytes with its own Content-Type (not JSON — the
// body IS the upload). `label` is optional, carried as a query param since
// there's no JSON body to put it in (see usercontent.mjs's handleUpload);
// omit it (or pass '') to store an unlabeled object. Resolves to
// { id, url } on success; rejects with the parsed 413 body
// ({ error: 'quota_exceeded', usedBytes, quotaBytes }) when the upload would
// exceed the account's quota, so callers can show a specific message rather
// than a generic failure.
const uploadUserContent = (file, label = '') => {
    const url = label ? `${USERCONTENT_UPLOAD_URL}?label=${encodeURIComponent(label)}` : USERCONTENT_UPLOAD_URL;
    return fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
    }).then(res => {
        if (res.status === 413) return res.json().then(body => { throw body; });
        if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
        return res.json();
    });
};

// Mints a fresh, working URL for an object the caller already uploaded —
// listUserContent()'s own response has no fetchable URL at all (only
// uploadUserContent()'s does, minted once at upload time). Needed by any
// later consumer that wants to re-read an upload's content (e.g.
// glycodomain.js resolving an uploaded region-list dataset — see
// plans/mydata-datasets-consolidation.md Phase 5, glycome repo). Resolves to
// { url }; the backend 404s the same way deleteUserContent does for an id
// that doesn't exist or isn't the caller's own.
const getUserContentUrl = (id) => {
    return fetch(`${USERCONTENT_LIST_URL}/${encodeURIComponent(id)}/url`, { credentials: 'include' })
        .then(res => {
            if (!res.ok) throw new Error(`Could not get a URL for ${id} (${res.status}).`);
            return res.json();
        });
};

// Removes one uploaded object by id. Resolves on success (204); the backend
// 404s for an id that doesn't exist or isn't the caller's own — surfaced as
// a thrown Error rather than a silent no-op, since "someone else's id" vs.
// "already deleted" both collapse to the same response and either is worth
// a visible failure rather than pretending it worked.
const deleteUserContent = (id) => {
    return fetch(`${USERCONTENT_LIST_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
        .then(res => {
            if (!res.ok) throw new Error(`Could not delete ${id} (${res.status}).`);
        });
};

// Lists the curated platform datasets (msdata, glycopacity, etc.) —
// [{dataset, title, accessGroup?, doi?, tags?}, ...], already filtered
// server-side to whatever the caller is authorized to even know exists
// (serveDataCatalog). Gated by the same x-api-key shared secret
// GatorDataReader sends on every /api/data/latest request (see this file's
// MASCP.GATOR_CLIENT_ID assignment above) rather than a session cookie —
// this endpoint doesn't need login to work, only to see restricted entries,
// which the server-side filtering already handles via whatever session
// cookie the browser sends alongside it anyway. Not cached client-side
// either, matching the server's own no-cache policy for the same reason.
const getDataCatalog = () => {
    return fetch(DATA_CATALOG_URL, { credentials: 'include', headers: { 'x-api-key': MASCP.GATOR_CLIENT_ID } })
        .then(res => res.ok ? res.json() : [])
        .catch(err => {
            console.log('[auth] getDataCatalog: /api/data/catalog unreachable', err);
            return [];
        });
};

// Shipped unconditionally, not gated on NODE_ENV — this project's `just
// build` (what both `deploy-test` and real production use) always sets
// NODE_ENV=production; there's no separate "test" value to gate on (see
// config/prod.env.js's own comment), so a NODE_ENV check would strip this
// from test.glyco.me too, not just real production. That's fine: this hook
// only ever mutates the CALLING BROWSER's own in-memory rendering state —
// no network call, no server-side effect — so it's no more a risk shipped
// to real users than them editing the DOM via devtools themselves, which
// they can already do regardless. Forces every piece of cached auth state
// ccg-userstatus.js renders from, so you can click through anonymous /
// ORCID-linked / passkey-only-unlinked / multiple passkeys / etc. without a
// real login round trip each time. See the console output below (printed
// once, at page load) for ready-to-paste examples.
window.__ccgAuthDebug = {
    setState({ whoami = null, prefs = {}, flags = [], passkeys = [] } = {}) {
        currentUserId = whoami?.userId ?? null;
        currentOrcidId = whoami?.orcidId ?? null;
        currentName = whoami?.name ?? null;
        currentGivenName = whoami?.givenName ?? null;
        currentFamilyName = whoami?.familyName ?? null;
        loginStatusPromise = Promise.resolve(!!currentUserId);
        prefsPromise = Promise.resolve(prefs);
        flagsPromise = Promise.resolve(flags);
        debugPasskeysOverride = passkeys;
        document.querySelectorAll('ccg-userstatus').forEach(el => el._checkUser());
    },
    // Drops the stubbed state and goes back to real network calls —
    // call this (or just reload the page) before testing real login.
    reset() {
        invalidateSessionCaches();
        debugPasskeysOverride = null;
        document.querySelectorAll('ccg-userstatus').forEach(el => el._checkUser());
    },
};
/* eslint-disable no-console */
console.log('%c[ccg-auth-debug] window.__ccgAuthDebug is available — force <ccg-userstatus> UI states without logging in.', 'color: #888');
console.log('Examples (paste directly):');
console.log("  __ccgAuthDebug.setState({ whoami: null }); // anonymous");
console.log("  __ccgAuthDebug.setState({ whoami: { userId: 'u1', orcidId: '0000-0002-8192-2829', name: 'Ada Lovelace' } }); // ORCID-linked, no passkeys");
console.log("  __ccgAuthDebug.setState({ whoami: { userId: 'u2', orcidId: null, name: null }, passkeys: [{ credentialId: 'abc', transports: ['internal'], createdAt: Date.now() }] }); // passkey-only, unlinked, 1 passkey");
console.log("  __ccgAuthDebug.setState({ whoami: { userId: 'u3', orcidId: '0000-0002-8192-2829', name: 'Ada Lovelace' }, passkeys: [{ credentialId: 'a', transports: [], createdAt: Date.now() }, { credentialId: 'b', transports: [], createdAt: Date.now() }] }); // ORCID-linked + 2 passkeys");
console.log("  __ccgAuthDebug.reset(); // back to real network state");
/* eslint-enable no-console */

export {
    ensureApiLogin,
    getLoginStatus,
    tryLoggingIn,
    tryLoggingInRedirect,
    getLastUserName,
    clearLastUser,
    getUserId,
    getOrcidId,
    getUserName,
    getFullName,
    performLogout,
    getPrefs,
    setPrefs,
    getFlags,
    getPreferredRenderer,
    setPreferredRenderer,
    registerPasskey,
    loginWithPasskey,
    linkOrcid,
    unlinkOrcid,
    listPasskeys,
    removePasskey,
    listUserContent,
    uploadUserContent,
    getUserContentUrl,
    deleteUserContent,
    getDataCatalog,
};
