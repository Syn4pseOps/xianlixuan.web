const fs = require("node:fs");
const path = require("node:path");

const roots = ["public", path.join("src", "content")];
const blockedExtensions = new Set([
    ".asp", ".aspx", ".bat", ".cgi", ".cmd", ".com", ".dll", ".exe",
    ".hta", ".jar", ".jsp", ".msi", ".phar", ".php", ".pl", ".ps1",
    ".py", ".scr", ".sh", ".vbs", ".war",
]);
const blockedNames = new Set([
    ".env", ".env.local", ".htaccess", "id_rsa", "id_ed25519",
]);
const sizeLimits = new Map([
    [".jpg", 10 * 1024 * 1024],
    [".jpeg", 10 * 1024 * 1024],
    [".png", 10 * 1024 * 1024],
    [".webp", 10 * 1024 * 1024],
    [".gif", 10 * 1024 * 1024],
    [".svg", 2 * 1024 * 1024],
    [".mp3", 15 * 1024 * 1024],
    [".m4a", 15 * 1024 * 1024],
    [".ogg", 15 * 1024 * 1024],
    [".wav", 15 * 1024 * 1024],
    [".pdf", 10 * 1024 * 1024],
]);
const defaultSizeLimit = 20 * 1024 * 1024;
const svgDangerPattern = /<script\b|\bon\w+\s*=|javascript\s*:|<foreignObject\b/i;
const errors = [];

function inspectFile(filePath) {
    const stat = fs.lstatSync(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    if (stat.isSymbolicLink()) {
        errors.push(`${relativePath}: symbolic links are not allowed in public content`);
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    const limit = sizeLimits.get(extension) ?? defaultSizeLimit;

    if (blockedExtensions.has(extension) || blockedNames.has(basename)) {
        errors.push(`${relativePath}: blocked executable or sensitive file type`);
    }
    if (/\.(?:key|pem|p12|pfx)$/i.test(basename)) {
        errors.push(`${relativePath}: private key or certificate bundle is not public content`);
    }
    if (stat.size > limit) {
        errors.push(`${relativePath}: ${stat.size} bytes exceeds the ${limit}-byte limit`);
    }
    if (extension === ".svg") {
        const source = fs.readFileSync(filePath, "utf8");
        if (svgDangerPattern.test(source)) {
            errors.push(`${relativePath}: active content is not allowed in SVG files`);
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

for (const root of roots) {
    if (fs.existsSync(root)) walk(root);
}

if (errors.length > 0) {
    console.error("Public asset validation failed:\n" + errors.map((item) => `- ${item}`).join("\n"));
    process.exit(1);
}

console.log("Public asset validation passed.");
