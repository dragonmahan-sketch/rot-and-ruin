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


ON AN IPHONE
-----------
iOS can unzip this without any app: in Files, tap the zip once and it unpacks
into a folder beside it. You then have the game and the co-op page as files.

Two things to know before you rely on those files:

  - Safari will not run the game from the Files app. A page opened as a local
    file has no service worker and no storage, so the offline copy cannot work
    that way. The files are for keeping and for putting on a server.
  - The way to play on an iPhone is the same files, served: open the site
    address below in Safari and add it to the home screen. That copy does work
    offline, because it runs from the site.

Putting the game on the home screen:

 1. Open Safari (not Chrome - Safari is the browser that does this properly).
 2. Go to   https://rot-ruin-wbadxv.freebuff.site/
 3. Tap Share - the square with the arrow coming out of the top.
 4. Scroll the sheet, tap "Add to Home Screen", then "Add".
 5. Open the icon from the home screen, not from Safari, and let the start
    screen finish drawing once. That is when it caches itself.
 6. Airplane Mode on, open the icon again. That is the offline check.

The co-op page on an iPhone: same taps on https://rot-ruin-wbadxv.freebuff.site/coop.html, but save the server
address BEFORE adding it to the home screen, and expect it not to work in
Airplane Mode - it needs the room server. iOS also clears stored data for sites
left unused for a long time, so the co-op icon may ask for the address again
one day. Retype it and save; nothing is broken.


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
     7. Open it. It fills the screen with no address bar: your server line, your
    room code, and ENTER THE ROOM.
 8. Tap ENTER THE ROOM.

If Chrome does not offer "Install app" the first time, reload the page once and
reopen the menu. Chrome reads the manifest when the page loads.


INSTALL THE GAME ON ANDROID (the one that works offline)
-------------------------------------------------------
 1. Chrome, open   https://rot-ruin-wbadxv.freebuff.site/
 2. Play it there if you like: nothing has to be installed to play in the
    browser.
 3. Three-dot menu, "Install app", "Install". The icon is named ROT & RUIN.
    Older Chrome says "Add to Home screen". If neither entry is there, reload
    the page once and open the menu again.
 4. Open the icon once, on the start screen, so it caches itself.
 5. Turn on airplane mode.
 6. Open it again. The game starts and plays, and saves run on the phone.

If you downloaded the zip on the phone instead: open Files, tap the zip, tap
Extract, then open index.html. It runs from the folder, but a page opened as a
file cannot cache itself, so it will not work without signal. The install route
above is the one that plays offline.

Checking the offline copy is this: step 5 and step 6. If you open the co-op icon
in airplane mode you get "connecting..." and then "disconnected". That is
correct: the room server is the one thing that cannot be cached.


SAVING THE SERVER ADDRESS, ONCE
-------------------------------
The room lives on a server, and the co-op page has to be told where it is. You
do this once per phone.

 1. On the co-op page the first thing you see is a box labelled SERVER ADDRESS.
 2. Press and hold in the box and choose Paste, or type the address in. Either
    is fine.
 3. Tap SAVE ADDRESS. The go key on the keyboard does the same thing.
 4. The box folds away into one line: "Server" and the name, with a small
    "change" under it. That folded line is the sign it worked, and the phone
    keeps it from then on.

Nothing is checked when you save - the address is only remembered. You find out
whether it is right on the next step.

 5. Tap ENTER THE ROOM. The game should open in your room. If you get a plain
    "Not Found" page instead, the address is wrong: tap "change", paste the
    right one and save again.
 6. If the room has been asleep, the first tap can sit on "connecting" for up
    to a minute while the server wakes up. That is normal on free hosting. Wait
    it out rather than tapping again.

To move to a different server later, tap "change", paste the new address and
save again.

If you put the co-op page on your home screen, open the icon and do steps 1 to 3
inside the icon as well. An installed icon on an iPhone can keep its own storage,
so do not assume the save carries across.


THE ROOM CODE, AND SENDING A FRIEND LINK
----------------------------------------
Every pair gets its own room code: four characters, shown as ROOM on the co-op
page, picked the first time the page is opened and kept on that phone. The code
travels inside the friend link, so two pairs playing at the same time never end
up in each other's game. Nobody ever types it.

 1. Note the code on your own page - for example ROOM K7PQ. You do not have to
    remember it: it is there so you can check you ended up in the right room.
 2. Tap SEND A LINK TO A FRIEND. On a phone with no share sheet the same button
    says COPY A LINK FOR A FRIEND.
 3. Pick Messages, WhatsApp, AirDrop, whatever you use, and send it.
 4. Your friend taps the link and lands in your room: no address, no code, no
    buttons, nothing to type. The link carries the server address, the room code
    and a flag that skips the page.
 5. Their page shows the same four characters as yours. Same code means the same
    game; a different code means the link was an old one - send a fresh one.

If you back out of the share sheet, the button has already copied the link, so
you can paste it into any chat. If a link stops working it is because the server
address changed: tap "change", save the new one, and send a fresh link. Old
links keep pointing at the old address.

Before a second pair of friends joins, tap NEW CODE beside the room code to draw
a fresh one, then send them that link. Otherwise both groups share one room and
you will all be in the same game.


UNINSTALL
---------
Long-press the icon, then Uninstall. Nothing else on the phone is touched.
