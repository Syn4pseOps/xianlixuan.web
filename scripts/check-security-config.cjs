const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const headersPath = path.join(root, "public", "_headers");
const errors = [];

if (!fs.existsSync(headersPath)) {
    errors.push("public/_headers is missing");
} else {
    const headers = fs.readFileSync(headersPath, "utf8");
    const required = [
        "Content-Security-Policy:",
        "Strict-Transport-Security:",
        "Permissions-Policy:",
        "Referrer-Policy:",
        "X-Content-Type-Options: nosniff",
        "X-Frame-Options: DENY",
        "X-XSS-Protection: 0",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "'wasm-unsafe-eval'",
        "https://code.iconify.design",
    ];

    for (const value of required) {
        if (!headers.includes(value)) errors.push(`public/_headers is missing: ${value}`);
    }
    if (headers.includes("'unsafe-eval'")) {
        errors.push("CSP must not allow unsafe-eval");
    }
}

const sourceFiles = [
    path.join(root, "src", "config.ts"),
    path.join(root, "src", "utils", "analytics.ts"),
    path.join(root, "src", "components", "post", "postMeta.astro"),
];
for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (/UMAMI_API_KEY|data-analytics-api-key|x-umami-api-key/.test(source)) {
        errors.push(`${path.relative(root, file)} exposes a private analytics credential path`);
    }
}

const translationSource = fs.readFileSync(path.join(root, "src", "plugins", "translate.js"), "utf8");
const pioSource = fs.readFileSync(path.join(root, "public", "pio", "static", "pio.js"), "utf8");
const iconifyLoaderSource = fs.readFileSync(path.join(root, "src", "components", "common", "iconifyLoader.astro"), "utf8");
for (const [file, source] of [["src/plugins/translate.js", translationSource], ["public/pio/static/pio.js", pioSource]]) {
    if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) {
        errors.push(`${file} contains dynamic code execution blocked by CSP`);
    }
}
if (!iconifyLoaderSource.includes("script.integrity = 'sha384-")) {
    errors.push("src/components/common/iconifyLoader.astro must pin the remote script with SRI");
}

if (errors.length > 0) {
    console.error("Security configuration validation failed:\n" + errors.map((item) => `- ${item}`).join("\n"));
    process.exit(1);
}

console.log("Security configuration validation passed.");
