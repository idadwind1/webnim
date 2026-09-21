# Publishing Webnim

The engine can be released to npm and GitHub Packages. The demo is excluded from both packages. Every release uses the version in the root `package.json`; published versions cannot simply be overwritten.

## Validate a release

```sh
npm ci
npm test
npm run test:package
npm pack --dry-run
npm run publish:github -- --dry-run
```

The npm package is `webnim`; the GitHub package is `@idadwind1/webnim`. Both use the MIT license. Confirm the version before each release. `repository`, `homepage` and `bugs` connect the published package to this repository and wiki.

## npm

Authenticate the CLI, even if you are already signed into the npm website:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm run publish:npm
```

`publish:npm` publishes the root manifest's package name publicly to npm. npm may require browser or one-time-password confirmation. Do not put credentials in the repository.

## GitHub Packages

GitHub Packages requires an account-scoped package name. This repository publishes its GitHub package as `@idadwind1/webnim`.

The **Publish GitHub Package** workflow can be run manually from Actions or triggered by publishing a GitHub release. Release tags must match the package version, for example `v0.1.0`. It runs the test suite and uses the repository's `GITHUB_TOKEN`, with `contents: read` and `packages: write`; no personal token is stored in source.

For local publication, authenticate separately to the GitHub npm registry with a suitable classic personal access token, then run:

```sh
npm login --scope=@idadwind1 --auth-type=legacy --registry=https://npm.pkg.github.com
npm run publish:github
```

The script builds and stages a temporary copy, sets its GitHub package name and registry, removes development scripts/dependencies from that copy, and publishes it. It does not rename the working package or change your default registry. `--dry-run` previews this without publication.

New GitHub packages default to private. Check the package settings after the first publication if it should be public. GitHub's npm registry requires authentication even for installing public packages.

For consumers using GitHub Packages, configure the scope in their `.npmrc` (credentials belong in user or CI configuration):

```ini
@idadwind1:registry=https://npm.pkg.github.com
```

Then install and import the package:

```sh
npm install @idadwind1/webnim
```

```ts
import { createPlayer } from '@idadwind1/webnim/browser';
import '@idadwind1/webnim/browser/style.css';
import { compileScene } from '@idadwind1/webnim/document';
```

## References

- [GitHub npm registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
