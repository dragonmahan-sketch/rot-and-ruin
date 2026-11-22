ROT & RUIN - the phone copy
===========================

Everything in this zip is the whole game plus the co-op page. Nothing to
install, nothing to compile: open index.html in a browser and play, or put the
files on a web server and use the two addresses below.


WHAT IS IN HERE
---------------
index.html              the game (works offline once cached)
coop.html               the co-op page: join a room, share a link
sw.js                   the service worker that makes the game work offline
manifest.webmanifest    makes the game installable as ROT & RUIN
coop.webmanifest        makes the co-op page installable as R&R co-op
icon-*.png              the home screen icons
apple-touch-icon.png    the iOS icon


INSTALL THE CO-OP APP (Android)
-------------------------------
The co-op app needs the room server; it does not work offline.

 1. Chrome, open   https://rot-ruin-wbadxv.freebuff.site/coop.html
 2. Save the server address first: paste it in the field at the top and tap
    SAVE ADDRESS. The installed app opens the same page, so the save carries
    over and you only do this once.
 3. Tap the three-dot menu, top right.
 4. Tap "Install app" (older Chrome says "Add to Home screen").
 5. Tap "Install" to confirm.
 6. The icon appears, named R&R co-op. It may land on a later home screen or in
    the app drawer; long-press and drag it where you want it.
 7. Open it. It fills the screen with no address bar: your server line, ROOM
    RUIN, and ENTER THE ROOM.
 8. Tap ENTER THE ROOM.

If Chrome does not offer "Install app" the first time, reload the page once and
reopen the menu. Chrome reads the manifest when the page loads.


INSTALL THE GAME (the one that works offline)
----------------------------------------------
 1. Chrome, open   https://rot-ruin-wbadxv.freebuff.site/
 2. Three-dot menu, "Install app", "Install". The icon is named ROT & RUIN.
 3. Open it once, on the start screen, so it caches itself.
 4. Turn on airplane mode.
 5. Open it again. The game starts and plays, and runs save on the phone.

Checking the offline copy is this: step 4 and step 5. If you open the co-op icon
in airplane mode you get "connecting..." and then "disconnected". That is
correct: the room server is the one thing that cannot be cached.


SAVING THE ADDRESS, ONCE
------------------------
The address field is the first thing on the co-op page. Paste the server
address, press the go key on the keyboard or tap SAVE ADDRESS, and the field
folds away to one line: the server name with a small "change" under it. That
phone keeps it from then on. To move to a different server later, tap "change",
type the new address and save again.


SENDING A FRIEND LINK SO NOBODY PASTES ANYTHING
------------------------------------------------
Tap SEND A LINK TO A FRIEND. The phone's share sheet opens with the link already
filled in; pick an app and send it. Your friend taps the link and lands in room
RUIN, next to you. No address, no field, nothing to type. The link carries the
server address and a "go" flag that skips the page entirely.

If you back out of the share sheet, the same button copies the link instead, so
you can paste it wherever you like. If a link ever stops working it is because
the server address changed: tap "change", save the new one, and send a fresh
link. Old links keep pointing at the old address.


UNINSTALL
---------
Long-press the icon, then Uninstall. Nothing else on the phone is touched.
