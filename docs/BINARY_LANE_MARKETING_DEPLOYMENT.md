# CivicPath marketing website: Binary Lane deployment

The public CivicPath site is a **standalone static Vite build**. It has no Manus runtime, Manus storage proxy, Manus analytics script, Manus login or server-side session dependency. Nginx serves the built files; the only live browser integration is the public CivicPath API at `https://app.civicpath.com.au/v1` for protected contact enquiries.

## Production topology

| Component | Production location |
|---|---|
| Public marketing hostname | `https://www.civicpath.com.au` |
| Apex redirect | `https://civicpath.com.au` → `https://www.civicpath.com.au` |
| Public API | `https://app.civicpath.com.au/v1` |
| Marketing web root | `/var/www/civicpath-marketing` |
| Marketing source checkout | `/var/www/civicpath-marketing-source` |
| Web server and TLS | Nginx and Certbot on Binary Lane |

## Deploy a reviewed release

1. Clone the `BigLittleBusiness/civicpath` repository into `/var/www/civicpath-marketing-source` and check out the `marketing` branch.
2. Ensure Node.js 22, pnpm, Nginx, Certbot and rsync are installed on the Binary Lane server.
3. Confirm both `civicpath.com.au` and `www.civicpath.com.au` resolve to the Binary Lane server before requesting TLS.
4. Run `sudo ./infra/deploy-binarylane-marketing.sh` from the marketing source checkout. It installs dependencies from the lockfile, type-checks, builds and copies the static `dist/` output to `/var/www/civicpath-marketing`.
5. Run `sudo ./infra/configure-binarylane-marketing-nginx-ssl.sh --email <approved-operations-email>` to install the Nginx site, issue the certificate and test renewal. Use `--staging` for the first certificate dry run if needed.
6. Verify the root page, `/contact`, `/robots.txt` if present, browser developer console, HTTPS redirect and a real protected contact form submission. Confirm that the submission reaches the CivicPath app API and follows the approved SES/Zoho delivery boundary.

## Form configuration

The contact page defaults to `https://app.civicpath.com.au/v1`; no marketing-site secret is needed. Before launch, confirm the application API allows `https://www.civicpath.com.au` in `CORS_ORIGINS`, has a production `ALTCHA_HMAC_SECRET`, and has a verified AWS SES configuration for transactional delivery. The public site must never contain AWS, database, API signing, ALTCHA or mailbox secrets.

## Attribution and hosted-preview note

The source contains no CivicPath footer attribution to Manus. The former managed preview could inject an external "Made with Manus" overlay outside the CivicPath document; that platform overlay is not shipped in this static build and is absent when Nginx serves the Binary Lane deployment.
