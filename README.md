# Balance Maze

> A cinematic 3D wooden labyrinth controlled with your hands.

Balance Maze turns a webcam into a natural controller for a classic tilt-table game. Raise one hand, move both hands together, or switch to mouse and keyboard controls to guide a steel ball through hand-crafted mazes—without sending camera frames to an application server.

Built with React, Three.js, MediaPipe, and TypeScript.

## Why it is fun

- **Gesture-first control** — steer the board with two hands using webcam hand tracking.
- **A tactile 3D board** — carved walnut, brass hardware, a polished steel ball, dynamic lighting, and a warm tabletop scene.
- **Playable physics** — fixed-step simulation, rolling and skid contact, wall impacts, rounded wall ends, hole rims, and a strict 8° mechanical tilt limit.
- **Designed levels and random runs** — play five authored labyrinths or generate a validated random maze.
- **Graceful fallback controls** — use mouse, WASD, or arrow keys when a camera is unavailable.
- **Privacy-conscious by design** — camera frames are processed in the browser. No backend or account is required.

## Controls

| Input | How it works |
| --- | --- |
| **Webcam** | Calibrate with both hands, then change their relative height to bank the board. The selected camera profile controls forward/back tilt. |
| **Mouse** | Move the pointer to set the board tilt. |
| **Keyboard** | Use **WASD** or the arrow keys. |
| **R** | Restart the current level. |
| **P** | Toggle presentation mode. |
| **C** | Start camera calibration. |

## Quick start

**Prerequisites:** Node.js 22 or newer and a modern browser. Webcam mode works on `localhost` or HTTPS.

```bash
git clone https://github.com/resarytrew/balance-maze-gesture-control.git
cd balance-maze-gesture-control
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:3000`.

For the best gesture experience, use a well-lit room, keep both hands in frame, and run calibration before playing. The app pauses the simulation when one tracked hand is lost, so the ball cannot roll away because of stale input.

## Development

```bash
npm test       # deterministic game and physics tests
npm run lint   # TypeScript type-check
npm run build  # production build
```

## Technical notes

- **Rendering:** Three.js scene embedded in a React application.
- **Tracking:** MediaPipe Tasks Vision Hand Landmarker, with camera, mouse, and keyboard modes.
- **Simulation:** 120 Hz fixed-step ball simulation with static/kinetic contact impulses, rolling damping, adaptive collision substeps, wall spin transfer, and geometric hole rims.
- **Level safety:** authored and generated levels are checked for reachable goals, gems, safe hole clearances, and a shared physical chassis.

## Project structure

```text
src/
├── components/   # Three.js scene, HUD, and camera controls
├── game/         # physics, hand tracking, levels, validation, and audio
└── assets/       # generated walnut tabletop and playing-field textures
```

## Roadmap

- [ ] Shareable daily maze seed
- [ ] Accessibility presets for motion and gesture sensitivity
- [ ] Optional touch controls for mobile devices
- [ ] Replay and speed-run timer export

## Contributing

Ideas, bug reports, visual polish, and physics improvements are welcome. Please open an issue before a large change, keep the fixed-step simulation deterministic, and run the test suite before submitting a pull request.

## License

Released under the [MIT License](LICENSE).
