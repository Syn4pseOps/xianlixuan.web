# Syn4pseOps Security Hardening

## Architecture

The production site is intentionally static:

```text
Visitor
  -> Cloudflare DNS and DDoS protection
  -> WAF, bot controls, and edge rate limiting
  -> Cloudflare Pages static CDN
  -> Optional third-party services allowed by CSP
```

There is no first-party application server, Pages Function, Worker, or database. Astro emits static files directly to `dist/`, and search runs locally with Pagefind. Decap OAuth, comments, contact forms, login, and upload endpoints are not deployed. This keeps the runtime attack surface small, ensures the Pages `_headers` policy covers site responses, and allows cached content to remain available during upstream incidents.

## Cloudflare Pages Setup

1. Create a Cloudflare Pages project named `syn4pseops` and connect the repository, or allow the deploy workflow to publish to an existing project.
2. Add a custom domain from a Cloudflare-managed DNS zone. Zone WAF and rate-limit rules cannot be attached to the shared `pages.dev` zone.
3. Configure these GitHub repository secrets:
   - `CLOUDFLARE_API_TOKEN`: token scoped to Cloudflare Pages deployments only.
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
4. Configure these GitHub repository variables:
   - `CLOUDFLARE_PAGES_PROJECT`: Pages project name. Defaults to `syn4pseops`.
   - `PUBLIC_SITE_URL`: canonical HTTPS custom domain or Pages URL.
5. Keep production credentials in GitHub Environments or Cloudflare. Never add them to `.env` files committed to Git.

The deploy workflow builds the static site, validates public assets, checks the security configuration, audits production dependencies, and then deploys `dist/`.

## WAF and Rate Limits

The files in `infra/cloudflare/` contain three zone rulesets:

- `custom-firewall.ruleset.json`: blocks unsupported methods, unused authentication routes, common secret probes, and path traversal attempts. Empty user agents receive a managed challenge.
- `rate-limits.ruleset.json`: returns HTTP 429 after 120 public page requests per minute, 60 anonymous API requests per minute, or 5 authentication requests per minute per IP and Cloudflare data center.
- `managed-waf.ruleset.json`: enables the Cloudflare Managed Ruleset. The OWASP Core Ruleset is staged as disabled to avoid false positives before traffic has been observed.

Run a local dry run first:

```powershell
pwsh ./infra/cloudflare/apply-security-rules.ps1
```

To apply rules to a custom domain zone, create a scoped API token with `Zone:Read` and `Zone:Rulesets:Edit`, then set it only in the current shell:

```powershell
$env:CLOUDFLARE_ZONE_ID = "your-zone-id"
$env:CLOUDFLARE_API_TOKEN = "your-scoped-token"
pwsh ./infra/cloudflare/apply-security-rules.ps1 -Apply
```

The apply script preserves rules that are not managed by this repository. After at least 48 hours of Security Events review, enable the staged OWASP rule and apply again. Use Managed Challenge for suspicious bot traffic; do not challenge verified bots or normal visitors.

Authenticated API limits are intentionally absent because this site has no authenticated API. If one is added, validate the session or JWT at the edge before assigning a higher authenticated limit. Never trust the presence of an arbitrary cookie or header as proof of authentication.

## Headers and Caching

`public/_headers` provides the Cloudflare Pages response policy:

- CSP restricts scripts, frames, forms, objects, media, fonts, and outbound connections.
- HSTS enforces HTTPS without enabling preload before all future subdomains are confirmed HTTPS-only.
- Permissions Policy disables camera, microphone, geolocation, payment, USB, and browser ad topics.
- Immutable Astro bundles cache for one year.
- Mutable public assets cache for seven days in browsers and thirty days at the edge.
- Public HTML caches briefly and can be served stale during an incident.
- Future API, OAuth, and admin paths are marked `no-store`.

The CSP intentionally retains `unsafe-inline` for scripts and styles because the current Astro UI contains inline boot scripts and styles. `wasm-unsafe-eval` is limited to Pagefind's local WebAssembly search index; JavaScript `unsafe-eval` remains prohibited. A later CSP tightening can externalize inline handlers or generate build-time hashes without changing visual behavior.

## Production Source Protection

Production JavaScript and CSS are minified with esbuild, source-map generation is explicitly disabled, and production builds remove first-party `console.log`, `console.debug`, and `debugger` statements while retaining legitimate warnings and errors. A post-build sanitizer removes source-map metadata shipped in the copied Marked and Twikoo browser bundles without transforming Pagefind, WebAssembly, framework runtime code, or other third-party libraries.

Moderate obfuscation is limited to the application-owned archive panel, music player, navigation menu, and language switcher entry chunks. The search wrapper is intentionally excluded because its Svelte reactive state is not compatible with the transformation; Pagefind and its WebAssembly index are also untouched. The configuration uses the CSP-safe `browser-no-eval` target and deliberately disables control-flow flattening, dead-code injection, self-defending code, debug protection, global renaming, and source maps. This keeps bundle growth and compatibility risk bounded while making compatible application modules less reusable.

`scripts/validate-production-artifacts.cjs` runs after Pagefind generation and fails the build when `dist/` contains source maps, source-map references, environment files, repository metadata, private key or certificate material, executable/server files, application source files, high-confidence credential patterns, build-machine paths, unexpected dynamic code execution, or production debug logs in protected chunks. It also verifies that Cloudflare `_headers` and Pagefind exist and that no Pages Functions `_routes.json` was introduced. CI repeats this validation immediately before deployment.

These controls increase the cost of copying or reverse engineering client code, but browser-delivered JavaScript, CSS, HTML, media, and data remain observable by visitors. Obfuscation is not encryption and must never be used to protect secrets.

## Input and Upload Controls

There is no runtime upload endpoint. `scripts/validate-public-assets.cjs` applies build-time controls to assets committed through Git or a future CMS:

- blocks executable and private-key extensions;
- rejects symbolic links in public content;
- enforces file-size limits;
- rejects active content in SVG files.

If comments, contact forms, or CMS OAuth are enabled later, add server-side schema validation, content sanitization, CSRF tokens, strict Origin checks, SameSite cookies, and Cloudflare Turnstile only on suspicious submissions.

## Logging and Monitoring

Use Cloudflare Security Events and HTTP Analytics. If Logpush is available, retain only the fields required for operations:

- client IP, HTTP method, sanitized path without query strings;
- edge status, origin status, response bytes, and edge response time;
- CF-Ray ID, WAF action, matched rule ID, bot classification, and rate-limit action.

Do not log cookies, authorization headers, form bodies, URL query values, OAuth codes, email addresses, or analytics secrets.

Recommended alerts:

- request rate exceeds five times the seven-day baseline for five minutes;
- edge or origin 5xx exceeds 1 percent for five minutes;
- rate-limit actions exceed 2 percent of requests;
- WAF blocks or managed challenges spike above the normal baseline;
- Cloudflare Pages deployment or health checks fail.

During an attack, tighten edge limits or use Cloudflare's emergency protections. Do not add dynamic work to the static origin. Cached HTML and assets should remain the primary fail-safe path.
