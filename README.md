# ROT & RUIN

A top-down zombie survival game. One fixed map of city outskirts, endless waves, six weapons, a boss every fifth wave, and a day/night cycle with a flashlight.

## What's in this folder

| File | What it is |
| --- | --- |
| `index.html` | The whole game. All the code, art and sound-free effects live in this one file — no build step, no dependencies. |
| `sw.js` | A small service worker. It caches the game so it launches as a standalone app and plays with no connection. Optional when opened from disk, but needed for the home-screen install. |
| `manifest.webmanifest` | Tells phones the game's name and colours when it's added to the home screen. |
| `apple-touch-icon.png` | The 180×180 icon an iPhone uses on the home screen. |
| `icon-192.png`, `icon-512.png` | The same icon at other sizes for Android and other devices. |
| `icon-192-maskable.png`, `icon-512-maskable.png` | The icon with padding, so Android's circular launcher mask never clips it. |

These files are the entire site. There is no folder structure to preserve and nothing to build — they sit at the top level so a phone can upload them all at once.

## Play it locally

1. Unzip the folder.
2. Double-click `index.html`.

That's it — it opens in your browser and runs offline, because everything is inside the one file. The browser's "add to home screen" install only works from a web address, so the service worker does nothing when the page is opened from disk. That is expected, and the game works either way.

**Controls:** WASD to move, mouse to aim, left click to shoot, R to reload, 1–6 or Q to swap weapon, Shift to sprint, F for a medkit, L for the flashlight, P or Esc to pause. Walk over loot to pick it up. You can rebind the movement keys from the start screen, and there are touch controls on phones. On a touchscreen, shots bend slightly toward a zombie you are already aiming near, and loose loot drifts toward you when you get close — nothing changes for mouse and keyboard.

## Put it online from a phone

**Netlify Drop** is the simplest route:

1. Sign in at https://app.netlify.com — Google or an email address both work.
2. Open https://app.netlify.com/drop.
3. Tap **choose a file** and pick **the zip file, unopened**. It unpacks the zip and publishes the contents.
4. Rename the site under **Site configuration → Site details → Change site name** if you want a tidier address.

Keep `index.html`, `sw.js` and `manifest.webmanifest` side by side at the same level; the game looks for the other two by name. Other hosts work the same way: any static host that serves these files over https will run the game.

To update it later, use **Deploys → Deploy manually** and upload the full zip again. A deploy replaces the whole site, so never upload `index.html` on its own — the icons, manifest and service worker would disappear with it.

## Installing it like an app

Open the live address, then:

- **Easiest:** tap **Install app** on the game's start screen. There are two of them — one in the panel and one in a bar along the bottom — so it is always findable. On an iPhone the tap tells you the two taps to use instead.
- **If nothing happens:** tapping **Install app** when the browser will not install prints an `Install check` under the button, listing each requirement (`secure page`, `service worker`, `app manifest`, `install prompt`) with yes/NO beside it, and the single next step for whichever one failed.
- **iPhone:** in Safari, tap Share, then **Add to Home Screen**.
- **Android:** in Chrome, tap ⋮ then **Add to Home screen**, or accept the "Install app" prompt if Chrome offers one.

It then opens fullscreen with no browser bars, keeps its own icon, and — because of the service worker — still starts if you have no signal. Settings and key bindings are remembered.

Installing needs a secure address (one starting `https://`) and a first load with a connection. It does not work in a private/incognito tab, or from a link opened inside another app — use Chrome's ⋮ menu, then **Open in Chrome**.

When you upload a new version, the page updates the next time you open it with a connection. If it ever seems stuck on an old version, close the app fully and reopen it.

## Knowing which version is live

The start screen, the pause screen and the death screen each show a small line at the bottom reading `v1.0.0`. All three are filled in when the page loads, from one line near the bottom of `index.html`:

```js
const VERSION = '1.0.0';
```

Bump that number when you upload a change, and the screen tells you at a glance whether a new copy really made it to the site. It is a version, not a date, and the line is not clickable — there is no copy-to-clipboard trick, so read it off the screen if you need it for a bug report. The desktop build compares this number against its own `package.json` and refuses to package if the two disagree.

## If the game runs slowly

On the start screen or the pause screen, click **Graphics** and pick a level:

- **Very low** — capped at 30 frames per second, flat night lighting instead of the soft glow, almost no effects. The fallback for an older phone.
- **High** — full resolution and every effect. The default.
- **Medium** — about half the resolution, with fewer particles and thinner smoke.
- **Low** — the lowest resolution, sparse particles, almost no blood or scorch marks and a gentler screen shake.

Your choice is saved in the browser, so it's still set the next time you open the game. It only changes how the game looks — zombies, damage, weapons and ammo behave exactly the same on every level.

## Making changes

Everything is in `index.html`, in one `<script>` block near the bottom. The weapon table is a good place to start: search for `const WEAPONS` to change damage, magazine size, fire rate or ammo. World size, zombie types and wave pacing are defined just above and below it.
