# Parallels Guest Tools Icon Hider

A GNOME Shell extension that hides the phantom **"Unknown"** application icon
that **Parallels Tools** creates in the Ubuntu Dock when a Linux guest VM loses
focus.

When you run Ubuntu inside a Parallels Desktop VM with Parallels Tools
installed, an icon with the label **"Unknown"** and a blank/placeholder image
appears in the dock whenever the VM is *not* focused, and disappears again when
you click back into it. This extension makes it stay hidden — permanently and
without flicker.

> **Target:** Ubuntu 26.04 LTS (GNOME 50, Wayland). Also declared compatible
> with GNOME 48 and 49.

---

## How it works

The Ubuntu Dock, the default GNOME dash, and the Alt-Tab application switcher
all build their list of running apps from a single method,
`Shell.AppSystem.get_running()`. The extension wraps that method so every one
of those consumers receives a list with the Parallels ghost filtered out.
Because the wrapper runs on every redisplay, the icon can never reappear on the
next focus change.

Identifying the ghost is the tricky part: these windows carry **no usable
identity** — empty `WM_CLASS`, empty instance, empty title, and the name
`"Unknown"`. So the extension identifies them two ways, in order:

1. **By owning process (primary).** It reads `/proc/<pid>/comm` and
   `/proc/<pid>/cmdline` for the window's owning PID and matches Parallels
   Tools binaries (`prlcc`, `prldnd`, `prlsga`, `prlcp`, …). This is the only
   *truly* Parallels-specific signal for these windows.
2. **By fingerprint (fallback).** If the owning PID can't be resolved, it hides
   a window-backed ghost whose name is `"Unknown"` **and** whose `WM_CLASS`,
   instance and title are all empty — the exact shape of the Parallels overlay.

A safety guard applies to both paths: only **window-backed apps with no
`.desktop` file** are ever considered. Installed applications always have a
`.desktop` entry, so they can never be hidden.

---

## Requirements

- GNOME Shell 48, 49, or 50 (Ubuntu 26.04 LTS ships GNOME 50)
- A Parallels Desktop VM with Parallels Tools installed (the source of the icon)

---

## Installation

### Option A — Makefile (recommended)

```bash
git clone https://github.com/AndreaF17/Parallels-Guest-Tools-Icon-Hider.git
cd Parallels-Guest-Tools-Icon-Hider
make install
# log out and log back in (Ubuntu 26.04 is Wayland-only, so the shell
# cannot be restarted in place)
make enable
```

### Option B — Manual

```bash
UUID=parallels-guest-tools-icon@local
mkdir -p ~/.local/share/gnome-shell/extensions/$UUID
cp metadata.json extension.js ~/.local/share/gnome-shell/extensions/$UUID/
# log out / in, then:
gnome-extensions enable $UUID
```

### Option C — From a packaged zip

```bash
make build          # produces parallels-guest-tools-icon@local.zip
gnome-extensions install --force parallels-guest-tools-icon@local.zip
# log out / in, then enable
```

> If `gnome-extensions install` errors with a `~/.cache/.../metadata.json: No
> such file or directory` message, use Option A or B instead — they copy the
> files directly and avoid that tool's extraction step.

After enabling, click out of the VM. The "Unknown" dock icon should no longer
appear.

---

## Configuration

All options are plain constants at the top of `extension.js`. Edit, re-copy the
file into the install directory, and log out/in.

| Constant | Default | Purpose |
| --- | --- | --- |
| `DEBUG` | `true` | Log each ghost window (and why it was hidden or kept) to the journal. Set to `false` once you're happy. |
| `PARALLELS_PROCESS_PATTERNS` | `['prl', 'parallels', 'coherence']` | Case-insensitive substrings matched against the owning process name and command line. |
| `HIDE_BLANK_UNKNOWN_GHOSTS` | `true` | Fallback that hides a blank, `"Unknown"`-named ghost window when its owning PID can't be read. Set to `false` for process-detection only. |

---

## Verifying / troubleshooting

With `DEBUG = true`, watch the log while the ghost is on screen (VM unfocused):

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep parallels-guest-tools-icon
```

Each ghost is logged once, e.g.:

```
... id="window:4" name="Unknown" pid=1234 comm="prldnd" cmdline="/usr/bin/prldnd" wm_class="" => HIDDEN (process "prldnd")
```

- `=> HIDDEN (process "...")` — identified by a real Parallels process. This is
  strictly Parallels-scoped; you may set `HIDE_BLANK_UNKNOWN_GHOSTS = false`.
- `=> HIDDEN (blank Unknown ghost)` with `pid=0` — the PID wasn't available, so
  the fingerprint fallback caught it.
- `=> kept (...)` — not hidden. If your ghost shows a non-zero `pid` with a
  process name not in the patterns, add that name to
  `PARALLELS_PROCESS_PATTERNS`.

---

## Uninstall

```bash
make uninstall
# or manually:
gnome-extensions disable parallels-guest-tools-icon@local
rm -rf ~/.local/share/gnome-shell/extensions/parallels-guest-tools-icon@local
```
