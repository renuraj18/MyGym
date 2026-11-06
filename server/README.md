# MyGym license server

Cloudflare Worker that gives each phone a 7-day trial and activates Yearly / Lifetime license keys (one phone per key).

- Admin page: `https://mygym-license.<your-subdomain>.workers.dev/admin` (user name: anything, password: `ADMIN_PASSWORD`)
- Prices and payment instructions shown in the app: `[vars]` in `wrangler.toml`
- Data: KV namespace `mygym-licenses` (`lic:<KEY>` and `dev:<device id>` entries)

Deployed by `.github/workflows/license-server.yml` on every push that changes `server/`, or from the Actions tab.
Needs repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `ADMIN_PASSWORD`.
