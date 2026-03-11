# QA Inventory

## User Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| UR-01 | Start from a new GitHub repository under `~/Projects/codex_projects/game` | Confirm local git repo init, `gh repo create`, remote origin, and pushed `main` branch |
| UR-02 | Build a browser-playable three.js voxel game app | App loads in browser and renders interactive 3D scene |
| UR-03 | App is immediately playable after load | No title gate or setup prompt blocks play; controls respond on first visit |
| UR-04 | Include ground and simple height variation in voxel world | Visual inspection confirms uneven terrain made from voxel blocks |
| UR-05 | Support `WASD` movement | Functional QA with keyboard movement in all directions |
| UR-06 | Support `Space` jump | Functional QA confirms vertical jump and landing |
| UR-07 | Support mouse-look camera control | Functional QA confirms yaw/pitch response after pointer lock |
| UR-08 | Left click destroys blocks | Functional QA confirms targeted block removal |
| UR-09 | Right click places blocks | Functional QA confirms targeted block placement |
| UR-10 | Keys `1` to `5` switch block type | Functional QA confirms hotbar selection and placed block appearance update |
| UR-11 | Show center crosshair | Visual QA confirms persistent centered crosshair |
| UR-12 | Show bottom hotbar | Visual QA confirms fixed bottom HUD with active slot state |
| UR-13 | Show top-right FPS display | Visual QA confirms live FPS counter in top-right |
| UR-14 | Canvas and HUD remain intact on window resize | Visual QA confirms no broken layout, clipping, or overlap after resize |
| UR-15 | GitHub Pages subpath deployment works | Published site loads assets and routes correctly from repo subpath |
| UR-16 | Deploy to GitHub Pages via CI/CD on push to `main` | GitHub Actions workflow builds and deploys automatically after push |
| UR-17 | Public GitHub Pages URL is verified in Playwright | Published URL opened and smoke-tested in Playwright |
| UR-18 | README contains a representative gameplay screenshot near the top | README renders header image and screenshot file exists in repo |

## Implementation Scope

| ID | Target | Verification |
| --- | --- | --- |
| IM-01 | Vite-based three.js app with Pages-aware base path | `vite.config.*` uses repo-aware `base` and production build passes |
| IM-02 | Deterministic voxel world generation with multiple block materials | Scene contains visible terrain and selectable block palette |
| IM-03 | Pointer-lock first-person controller with gravity and collision | Local interactive QA confirms playable movement without falling through terrain |
| IM-04 | Raycast-based block interaction for break/place | Local interactive QA confirms correct targeted edits and reversible actions |
| IM-05 | Responsive HUD overlay for crosshair, hotbar, instructions, and FPS | Visual QA across initial load, play, edit actions, and resize |
| IM-06 | Dev server runnable locally and reachable on `127.0.0.1` | Local server session stays up; Playwright connects to loopback URL |
| IM-07 | GitHub Actions workflow for Pages deploy | Workflow file exists and GitHub Actions completes successfully |
| IM-08 | README documents overview, controls, local setup, Pages URL, and CI/CD summary | README review after implementation |

## Final Report Claims

| ID | Claim to Support in Final Report | Evidence Needed |
| --- | --- | --- |
| FR-01 | Repository name | `gh repo view` output |
| FR-02 | GitHub Pages public URL | Pages settings or deployment URL after workflow success |
| FR-03 | Implemented features | Code inspection plus local/public QA notes |
| FR-04 | CI/CD summary | Workflow file and successful Actions run |
| FR-05 | Verified checklist | Explicit pass/fail notes from local and public QA |
| FR-06 | Unverified items | Any checks not completed must be listed explicitly |
| FR-07 | Remaining issues | Known limitations captured after exploratory pass |
| FR-08 | README screenshot used | Screenshot file path and visual confirmation in README |
