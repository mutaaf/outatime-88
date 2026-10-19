# TV mode (ticket 0175)

Play OUTATIME 88 on a TV with a phone as the tilt controller. The TV runs the whole game
(sim, audio and rendering) and the phone only sends input. A slow network can therefore
add input delay, but it never makes the game stutter.

## Try it at home

1. **On the TV**, open **`mutaafaziz.com/outatime/?tv`**. `?screen=tv` works too. You get a big
   4-letter code and a QR code.
2. **On the phone**, point the camera at the QR and tap the link. You can also open
   `mutaafaziz.com/outatime/pad` and type the code.
3. Tap **TAP TO START YOUR CONTROLLER**. On iPhone, allow **Motion & Orientation** when
   asked. Hold the phone sideways like a steering wheel.
4. Press **OK on the TV remote** (or click once) to turn on the TV's sound, since browsers
   need one press on the device that plays it.
5. On the phone, **▶ START** starts the race (and retries after one). Then:
   - **tilt** to steer;
   - hold **GAS** and **BRAKE**, hold **NOS**, tap **BOOST**;
   - **⟲ CENTER** re-centres the tilt;
   - **⛶ FIT TV** shrinks the picture if the TV crops the edges (0, 3 or 6 % overscan margin).
6. A second phone can scan the same code as **co-pilot**: its BOOST and NOS taps count too.

If the phone has no tilt sensor, or you deny motion access, drag on the steering strip.

## Which TV setups work

| Setup | Works? | Notes |
|---|---|---|
| Laptop or desktop on the TV over HDMI | ✅ best | Full speed, Chrome, Edge, Safari or Firefox. |
| iPad mirrored to Apple TV (AirPlay) | ✅ | Run the TV page on the iPad and the phone is the controller. The mirroring adds video delay. |
| Fire TV (Silk browser) | ✅ expected | Chromium-based, with WebSocket and WebRTC. Add `&gfx=low` if it stutters. Not tested on hardware. |
| Samsung (Tizen) or LG (webOS) TV browser | ⚠️ maybe | Recent models run modern Chromium. Older ones are slow, so add `&gfx=low`. Not tested on hardware. |
| Chromecast with Google TV / Google TV | ⚠️ | There's no built-in browser. Sideload one (e.g. TV Bro), or cast a Chrome tab from a laptop, which adds cast delay. |
| Apple TV on its own | ❌ | It has no web browser. Use AirPlay from a Mac, iPad or iPhone. |

**Zero-setup fallback: iPhone mirroring.** Open the game on the iPhone, turn on Screen
Mirroring to an Apple TV or AirPlay TV, then turn on **TILT** in the game's settings and
play on the phone itself.
- **Pros:** it needs nothing on the TV.
- **Cons:**
  - The TV picture lags the phone by AirPlay's buffer, often 100–250 ms. You end up
    watching the phone, not the TV.
  - The touch buttons sit on the phone's screen over the game.
  - The phone is busy rendering, so it runs warmer and the battery drains faster.
- This hasn't been measured on hardware.
- TV mode avoids all three cons: the phone is a light remote and the TV draws the game at its own frame rate.

## How it works

- **Pairing:**
  - `POST /outatime/api/pad` mints a code and a secret 128-bit TV key. Only the TV that
    asked holds the key (in memory and its tab's sessionStorage, so a reload keeps the code).
    The TV socket must present it, compared in constant time, so someone who guesses a code
    can join as a phone at most and can never replace the screen or message a kid's phone.
  - Every socket join, TV or phone, is throttled to 30 a minute per IP.
  - The TV and the phones open same-origin WebSockets to `/outatime/api/pad/<CODE>`. That is the
    `PadRoom` Durable Object, with rules in `src/worker/pad-core.js` and code in
    `src/worker/pad.js`; it is an operator path.
  - A code stops accepting new phones after **10 minutes** if nobody has paired. A
    paired session keeps accepting reconnects.
  - A session nobody is connected to is wiped after 15 minutes. Two phones at most.
- **Transport, best first:**
  - The phone opens a **WebRTC DataChannel** (unordered, `maxRetransmits: 0`) and signals
    through the PadRoom.
  - There is no STUN or TURN server, because the game never contacts a third-party host
    (AGENTS.md §3.3). So P2P connects when the phone and TV share a network (home
    Wi-Fi), and that is the low-latency path.
  - If it can't connect within 6 s (guest Wi-Fi with client isolation, mobile data, a browser
    without WebRTC), input rides the **relay** through the PadRoom. The relay is still
    playable, at one Cloudflare round trip.
  - The phone shows `connected · direct` or `connected · relay` with the measured round trip.
- **Frames** (`src/tv/proto.js`):
  - The phone sends `[0, seq, steer, bits, boostN, startN, ms, echo, fitN]`: 60 Hz on P2P;
    on the relay, on change at up to 30 Hz plus a 4 Hz keep-alive (it is billed per message).
  - Taps are counters, so a lost frame never loses or doubles a tap.
  - The TV sends the mini HUD (speed, HP, coins, status) and rumble cues at 12 Hz, or 6 Hz on
    the relay.
- **On the TV** (`src/tv/tv.js`):
  - The newest input wins, written into `PhonePad` (`src/input.js`). The car therefore uses
    the same handling model as a gamepad.
  - Input is held through gaps of up to 600 ms, then released to neutral (never a stuck
    throttle).
  - After 2.5 s with no input, or when the phone disconnects, the race **pauses** and says why.
  - `?debug` shows the path, round trip, input rate and age per phone.
- **Lazy loading:**
  - The TV code is a lazy chunk loaded only with `?tv`.
  - The phone page `pad.html` is its own entry: about 6 kB of JS, with no game, three.js or audio.
  - `index.html` forwards `?pad=CODE` there before the game starts loading.

## Cost (Workers Free plan)

On P2P, input never touches the Worker; only pairing and signalling do, a few dozen
messages. On the relay, a phone sends about 10–30 messages a second while steering. Durable Objects bill
incoming WebSocket messages at 20:1, so an hour of relay play is roughly
2.5–5k requests, against the 100k a day the Free plan includes.

## Privacy

There are no accounts, names or ids. The PadRoom stores only `{ at, paired }`. WebRTC on a LAN
exposes local addresses only to the paired TV, and browsers obfuscate them as mDNS
`.local` names.
