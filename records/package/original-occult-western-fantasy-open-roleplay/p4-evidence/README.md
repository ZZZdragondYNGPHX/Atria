# Phase 4 local evidence

Task: refactor/original-occult-western-fantasy-open-roleplay. See the parent [Record](../../original-occult-western-fantasy-open-roleplay.md) for scope and boundaries.

`ui.json` is the unmodified final passing report: clean game 25b39d57eb206b4c6b09d4642d0c458c8d9e5784, Core 1661af11245c856363bfc1084275c02b55a97452 (unrelated AGENTS.md dirty). Screenshots are the 15 viewport captures named by that report; intermediate failure captures are excluded. Typed Native setup is used for late Claim/death; visible conversation uses a local synthetic provider, including an intentional failure. Screenshots do not establish production narrative quality.

The two Core logs are separate passing runs under existing Node22 (matching SQLite ABI), 57 + 7 tests. Core code was tested in its parent worktree and committed as 1661af11245c856363bfc1084275c02b55a97452; protected AGENTS.md remained unrelated dirty. The logs are not a full Core test run.

UI reproduction requires the corresponding independent Core checkout with its locked dependencies, QuickJS worker bundle, and Playwright Chromium. In that Core checkout, prepare only the required browser bundle:

```bash
node tests/node_modules/playwright/cli.js install chromium
node --input-type=module <<'JS'
import webpack from 'webpack';
import getConfig from './webpack.config.js';
const config=getConfig({forceDist:true});
config.entry={'atria-script.bundle':config.entry['atria-script.bundle']};
webpack(config,(error,stats)=>{
 if(error||stats.hasErrors()){
  console.error(error||stats.toString({all:false,errors:true}));
  process.exitCode=1;
 }
});
JS
```

 It creates only isolated temporary data and an in-memory archive, with images under ignored build/ui-3.0.0-p4.
