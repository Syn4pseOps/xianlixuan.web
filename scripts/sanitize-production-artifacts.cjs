const fs = require("node:fs");
const path = require("node:path");

const distRoot = path.resolve("dist");
const transformations = [
    {
        relativePath: "assets/js/marked.min.js",
        sanitize(source) {
            return source.replace(/\r?\n?\/\/[#@]\s*sourceMappingURL\s*=\s*[^\r\n]*/g, "");
        },
    },
    {
        relativePath: "assets/js/twikoo.all.min.js",
        sanitize(source) {
            return source.replaceAll("sourceMappingURL", "source-map-url");
        },
    },
];

if (!fs.existsSync(distRoot)) {
    console.error("Production artifact sanitization failed: dist/ does not exist.");
    process.exit(1);
}

let changedFiles = 0;
for (const { relativePath, sanitize } of transformations) {
    const filePath = path.join(distRoot, ...relativePath.split("/"));
    if (!fs.existsSync(filePath)) continue;

    const source = fs.readFileSync(filePath, "utf8");
    const sanitized = sanitize(source);
    if (sanitized !== source) {
        fs.writeFileSync(filePath, sanitized, "utf8");
        changedFiles += 1;
    }
}

const remainingReferences = [];
function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(entryPath);
            continue;
        }
        if (!/\.(?:css|html|js)$/i.test(entry.name)) continue;
        if (/sourceMappingURL/i.test(fs.readFileSync(entryPath, "utf8"))) {
            remainingReferences.push(path.relative(distRoot, entryPath));
        }
    }
}
walk(distRoot);

if (remainingReferences.length > 0) {
    console.error(
        "Production artifact sanitization failed; unexpected source-map references remain:\n" +
            remainingReferences.map((file) => `- ${file}`).join("\n"),
    );
    process.exit(1);
}

console.log(`Production artifact sanitization passed (${changedFiles} file(s) normalized).`);
