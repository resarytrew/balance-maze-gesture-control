# Contributing to Balance Maze

Thanks for helping make Balance Maze more fun, approachable, and reliable.

The project combines a precision tilt-maze toy, webcam-controlled 3D interaction, and a playful space adventure. We welcome bug reports, small improvements, new levels, accessibility ideas, tests, and documentation fixes.

## Before you start

- Browse [existing issues](https://github.com/resarytrew/balance-maze-gesture-control/issues).
- For substantial gameplay or architecture changes, open an issue first so we can discuss the approach.
- Avoid unrelated refactoring in a bug-fix pull request.
- Please be respectful and constructive with other contributors.

## Local setup

Install **Node.js 22+** and npm.

~~~bash
git clone https://github.com/resarytrew/balance-maze-gesture-control.git
cd balance-maze-gesture-control
npm ci
npm run dev
~~~

The development server usually starts at **http://localhost:3000**.

## Before opening a pull request

Run the checks used by GitHub Actions:

~~~bash
npm run lint
npm test
npm run build
~~~

Include a short description of what changed, how you tested it, and screenshots or a screen recording when changing visuals.

### Guidelines for physics changes

**The marble's existing rolling feel is intentional.** Please don't modify contact friction, rolling resistance, tilt dynamics, or wall restitution without a clear problem statement.

- Add a targeted regression test where possible.
- State what behavior changes and why.
- Compare a relevant gameplay scenario before and after.
- Keep the physics simulation independent of frame rate and deterministic.
- Keep the physical board bounds in sync with rendered geometry and level validation.

### Guidelines for webcam changes

- Do not introduce server-side uploads or storage of camera frames.
- Be careful about MediaPipe being unavailable or loading slowly.
- Any pinch/gesture action should debounce brief movements and avoid repeated activation when a hand remains closed.
- Preserve usable mouse and keyboard alternatives.
- Try at least one real webcam before treating a tracking change as fully validated.

### Guidelines for level and mission changes

- Check that starting positions, targets, obstacles, holes, and portals fit within the shared board.
- Confirm all required beacons are reachable and the mission can be completed.
- Keep Classic Maze independent of Cosmic Voyage effects.
- Use original graphics and artwork, and avoid introducing assets without clear usage rights.

## Pull request checklist

- [ ] The PR explains the problem and the approach.
- [ ] `npm run lint` succeeds.
- [ ] `npm test` succeeds.
- [ ] `npm run build` succeeds.
- [ ] New gameplay behavior has been tested manually, when applicable.
- [ ] The README or help text is updated if user-facing behavior changes.
- [ ] No secrets, personal camera recordings, or unlicensed assets are added.

Thanks for helping us build an experience where a tiny steel ball can lead to a big adventure.
