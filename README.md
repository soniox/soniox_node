# Soniox Node.js Client Library

### Requirements

Node.js v14 or higher.

### Usage

```
npm install @soniox/soniox-node
```

Usage with `require()`:

```
const { SpeechClient } = require("@soniox/soniox-node");
```

or with ES6 `import`:

```
import { SpeechClient } from "@soniox/soniox-node";
```

### Development

Install NPM modules:

```
npm install
```

Build gRPC Typescript definitions from .proto file:

```
npm run build:proto
```

Build library:

```
npm run build
```

Watch for file changes and automatically rebuild:

```
npm run build:watch
```

Build local npm package:

```
npm pack
```

This generates `soniox-soniox-node-<version>.tgz` in the project directory.

To test using the local package in another project, edit `package.json` in that project:

```
"dependencies": {
    "@soniox/soniox-node": "/<path_to_your_project>/soniox-soniox-node-<ver>.tgz"
}
```

Then run `npm install` in that project.
