// Hide Unknown Dock Icon
// GNOME Shell extension (GNOME 45+ / ESM API, target: GNOME 50 on Ubuntu 26.04)
//
// The Parallels ghost windows carry NO identity (empty WM_CLASS / instance /
// title, name "Unknown"), so they can't be matched by window class. Instead we
// identify them by the process that owns the window: Parallels Tools binaries
// (prlcc, prldnd, prlsga, ...). That is the only truly Parallels-specific
// signal available for these windows.

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Leave true while verifying; set to false to stop journal logging.
const DEBUG = true;

// Matched (case-insensitive substring) against the owning process name (comm)
// and full command line (cmdline).
const PARALLELS_PROCESS_PATTERNS = ['prl', 'parallels', 'coherence'];

// Fallback for when the owning PID can't be read (pid 0 / blocked): hide a
// window-backed ghost whose name is "Unknown" AND whose WM_CLASS, instance and
// title are all empty. On a Parallels VM this exact fingerprint is the tool's
// overlay window. Set to false if you want process-detection only.
const HIDE_BLANK_UNKNOWN_GHOSTS = true;

let procCache = new Map();   // pid -> {comm, cmdline}

function readProc(pid) {
    let info = procCache.get(pid);
    if (info)
        return info;

    info = {comm: '', cmdline: ''};
    try {
        const [ok, data] = GLib.file_get_contents(`/proc/${pid}/comm`);
        if (ok)
            info.comm = new TextDecoder().decode(data).trim();
    } catch (_e) { /* ignore */ }
    try {
        const [ok, data] = GLib.file_get_contents(`/proc/${pid}/cmdline`);
        if (ok)
            info.cmdline = new TextDecoder().decode(data).replace(/\0/g, ' ').trim();
    } catch (_e) { /* ignore */ }

    procCache.set(pid, info);
    return info;
}

// A "ghost" is a window-backed app with no real .desktop entry. Installed apps
// always have app_info, so they can never be hidden.
function isGhostCandidate(app) {
    try {
        return !app.get_app_info();
    } catch (_e) {
        return false;
    }
}

// Returns the matched process string (for logging) or null.
function parallelsProcess(app) {
    try {
        for (const win of app.get_windows()) {
            const pid = win.get_pid?.() ?? 0;
            if (pid <= 0)
                continue;
            const {comm, cmdline} = readProc(pid);
            const hay = `${comm} ${cmdline}`.toLowerCase();
            if (PARALLELS_PROCESS_PATTERNS.some(p => hay.includes(p)))
                return comm || cmdline || `pid ${pid}`;
        }
    } catch (_e) { /* ignore */ }
    return null;
}

function isBlankUnknownGhost(app) {
    try {
        const name = (app.get_name() || '').toLowerCase();
        if (name !== 'unknown' && name !== '')
            return false;
        const windows = app.get_windows();
        if (windows.length === 0)
            return false;
        for (const win of windows) {
            if (win.get_wm_class?.())
                return false;
            if (win.get_wm_class_instance?.())
                return false;
            if (win.get_title?.())
                return false;
        }
        return true;
    } catch (_e) {
        return false;
    }
}

// {hide, reason}
function classify(app) {
    if (!isGhostCandidate(app))
        return {hide: false, reason: 'has .desktop'};

    const proc = parallelsProcess(app);
    if (proc)
        return {hide: true, reason: `process "${proc}"`};

    if (HIDE_BLANK_UNKNOWN_GHOSTS && isBlankUnknownGhost(app))
        return {hide: true, reason: 'blank Unknown ghost'};

    return {hide: false, reason: 'no Parallels match'};
}

function describe(app) {
    const parts = [`id="${app.get_id()}"`, `name="${app.get_name()}"`];
    try {
        for (const win of app.get_windows()) {
            const pid = win.get_pid?.() ?? 0;
            const {comm, cmdline} = pid > 0 ? readProc(pid) : {comm: '', cmdline: ''};
            parts.push(`pid=${pid}`, `comm="${comm}"`, `cmdline="${cmdline}"`,
                `wm_class="${win.get_wm_class?.() ?? ''}"`);
        }
    } catch (_e) { /* ignore */ }
    return parts.join(' ');
}

export default class HideUnknownIconExtension extends Extension {
    enable() {
        procCache = new Map();
        this._appSystem = Shell.AppSystem.get_default();
        this._loggedIds = new Set();

        const ghostsNow = this._appSystem.get_running().filter(a => classify(a).hide);

        this._origGetRunning = Shell.AppSystem.prototype.get_running;
        const ext = this;

        Shell.AppSystem.prototype.get_running = function () {
            const running = ext._origGetRunning.call(this);
            return running.filter(app => {
                const {hide, reason} = classify(app);

                if (DEBUG && isGhostCandidate(app)) {
                    const id = app.get_id();
                    if (id && !ext._loggedIds.has(id)) {
                        ext._loggedIds.add(id);
                        console.log(`[parallels-guest-tools-icon] ${describe(app)} => ` +
                            `${hide ? 'HIDDEN' : 'kept'} (${reason})`);
                    }
                }
                return !hide;
            });
        };

        for (const app of ghostsNow) {
            try {
                this._appSystem.emit('app-state-changed', app);
            } catch (_e) { /* next redisplay clears it */ }
        }
    }

    disable() {
        if (this._origGetRunning) {
            Shell.AppSystem.prototype.get_running = this._origGetRunning;
            this._origGetRunning = null;
        }
        this._appSystem = null;
        this._loggedIds = null;
        procCache = new Map();
    }
}
