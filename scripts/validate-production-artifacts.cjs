const fs = require("node:fs");
const path = require("node:path");

const distRoot = path.resolve("dist");
const errors = [];
const textExtensions = new Set(["", ".css", ".html", ".js", ".json", ".lrc", ".svg", ".txt", ".xml"]);
const sourceExtensions = new Set([
    ".astro", ".coffee", ".jsx", ".less", ".md", ".mdx", ".sass", ".scss", ".styl", ".svelte", ".ts", ".tsx", ".vue",
]);
const executableExtensions = new Set([
    ".asp", ".aspx", ".bat", ".cgi", ".cmd", ".com", ".dll", ".dylib", ".exe", ".hta", ".jar", ".jsp", ".msi",
    ".phar", ".php", ".phtml", ".pl", ".ps1", ".py", ".rb", ".scr", ".sh", ".so", ".vbs", ".war",
]);
const privateMaterialExtensions = new Set([".cer", ".crt", ".der", ".key", ".p12", ".pem", ".pfx"]);
const repositoryDirectories = new Set([".git", ".github", ".hg", ".svn", ".wrangler", ".vercel", "node_modules"]);
const protectedChunkPrefixes = ["archivePanel", "musicPlayer", "navMenu", "translator"];
const debugHardenedChunkPrefixes = new Set([...protectedChunkPrefixes, "search"]);
const protectedChunks = new Map(protectedChunkPrefixes.map((prefix) => [prefix, []]));
const secretPatterns = [
    ["private key", /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/i],
    ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["GitHub token", /\b(?:gh[oprsu]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
    ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
    ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
    ["Stripe live key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
    ["analytics secret", /\b(?:UMAMI_API_KEY|x-umami-api-key|data-analytics-api-key)\b/i],
    ["Cloudflare credential", /\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\b/],
    ["authorization bearer token", /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/i],
];
const localPathPatterns = [
    /\b[A-Za-z]:[\\/](?:Users|Documents and Settings|Program Files|workspace)[\\/][^\s"'<>]*/i,
    /\/(?:Users|home)\/[^/\s"'<>]+\/(?:Desktop|Documents|Downloads|projects?|repos?|workspace)\/[^\s"'<>]*/i,
    /\/home\/runner\/work\/[^\s"'<>]*/i,
];

function report(relativePath, message) {
    errors.push(`${relativePath}: ${message}`);
}

function inspectFile(filePath) {
    const relativePath = path.relative(distRoot, filePath).replaceAll("\\", "/");
    const segments = relativePath.toLowerCase().split("/");
    const basename = path.basename(filePath).toLowerCase();
    const extension = path.extname(basename);

    if (segments.some((segment) => repositoryDirectories.has(segment))) {
        report(relativePath, "repository or development metadata is forbidden");
    }
    if (extension === ".map") report(relativePath, "source maps are forbidden");
    if (sourceExtensions.has(extension)) report(relativePath, "application source files are forbidden");
    if (executableExtensions.has(extension)) report(relativePath, "executable or server-side files are forbidden");
    if (privateMaterialExtensions.has(extension)) report(relativePath, "private key or certificate material is forbidden");
    if (/^\.env(?:\.|$)/i.test(basename)) report(relativePath, "environment files are forbidden");
    if (/^(?:dockerfile|compose\.ya?ml|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\..+)?\.json)$/i.test(basename)) {
        report(relativePath, "build or repository configuration is forbidden");
    }
    if (/^(?:\.gitignore|\.gitattributes|\.gitmodules|readme(?:\..+)?|license(?:\..+)?)$/i.test(basename)) {
        report(relativePath, "repository metadata is forbidden");
    }

    if (!textExtensions.has(extension)) return;
    const source = fs.readFileSync(filePath, "utf8");
    if (/sourceMappingURL/i.test(source)) report(relativePath, "sourceMappingURL reference is forbidden");
    for (const [label, pattern] of secretPatterns) {
        if (pattern.test(source)) report(relativePath, `possible ${label} exposed`);
    }
    for (const pattern of localPathPatterns) {
        if (pattern.test(source)) report(relativePath, "absolute local filesystem path is forbidden");
    }

    if (relativePath.startsWith("_astro/") && extension === ".js") {
        for (const prefix of debugHardenedChunkPrefixes) {
            if (basename.startsWith(`${prefix.toLowerCase()}.`) && /\bconsole\.(?:debug|log)\s*\(/.test(source)) {
                report(relativePath, "first-party code contains production debug logging");
            }
        }
        for (const prefix of protectedChunkPrefixes) {
            if (!basename.startsWith(`${prefix.toLowerCase()}.`)) continue;
            protectedChunks.get(prefix).push(relativePath);
            if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(source)) {
                report(relativePath, "protected first-party code contains CSP-incompatible dynamic execution");
            }
        }
    }
}

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(entryPath);
        else inspectFile(entryPath);
    }
}

if (!fs.existsSync(distRoot)) {
    console.error("Production artifact validation failed: dist/ does not exist. Run pnpm build first.");
    process.exit(1);
}

walk(distRoot);

for (const [prefix, files] of protectedChunks) {
    if (files.length !== 1) {
        errors.push(`_astro/${prefix}.*.js: expected exactly one protected first-party chunk, found ${files.length}`);
    }
}
if (!fs.existsSync(path.join(distRoot, "_headers"))) errors.push("_headers: Cloudflare Pages security headers are missing");
if (!fs.existsSync(path.join(distRoot, "pagefind", "pagefind.js"))) errors.push("pagefind/pagefind.js: Pagefind output is missing");
if (fs.existsSync(path.join(distRoot, "_routes.json"))) errors.push("_routes.json: Workers/Pages Functions routing is not allowed");

if (errors.length > 0) {
    console.error("Production artifact validation failed:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
}

const protectedFiles = [...protectedChunks.values()].flat();
console.log(`Production artifact validation passed (${protectedFiles.length} protected first-party chunks checked).`);
