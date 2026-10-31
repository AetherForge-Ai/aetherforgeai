# Goal loop release gate (b95 GATE-1)

A build is only READY_TO_PUBLISH when both files below are on the release branch:

1. `goal-loop/preview-bNN-<anything>.md`: TT's local-preview grade for the build. It must name the
   build id (for example `v3-b95-2026-11-01`) and include the lines `P0: 0` and `P1: 0`.
2. `goal-loop/READY_TO_PUBLISH`: one line with the same build id as `public/build-version.txt`.

The unit test `src/lib/must-fix/release-gate.test.ts` runs `checkReleaseGate` on the repo in CI.
Adding the marker without a passing grade turns the unit check red. With no marker, the build is
not claimed READY and the gate passes.
