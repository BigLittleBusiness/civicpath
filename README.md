# CivicPath marketing website

This repository is the **standalone public marketing website** for CivicPath. It is a Vite/React static build designed to be served by Nginx on Binary Lane at `https://www.civicpath.com.au`.

## Production boundaries

- The site contains **no Manus runtime, storage proxy, authentication or analytics dependency**.
- Visual assets are committed under `client/public/assets` and are served by Nginx with the static build.
- The public contact form calls only `https://app.civicpath.com.au/v1`, where the standalone CivicPath API validates ALTCHA and stores the enquiry.
- No production secret belongs in this repository or in the browser bundle.

## Build and deploy

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

The deployable output is `dist/`. See [Binary Lane marketing deployment](docs/BINARY_LANE_MARKETING_DEPLOYMENT.md) for the reviewed Nginx/TLS and release process.
