import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

const protectedEntries = new Set(
    [
        "src/components/archivePanel.svelte",
        "src/components/musicPlayer.svelte",
        "src/components/navbar/navMenu.svelte",
        "src/components/navbar/translator.svelte",
    ].map((entry) => normalizePath(path.resolve(entry))),
);
const protectedChunkNames = new Set(["archivePanel", "musicPlayer", "navMenu", "translator"]);
const sourceRoot = `${normalizePath(path.resolve("src"))}/`;

function normalizePath(value) {
    return value.split("?")[0].replaceAll("\\", "/");
}

function stripDebugStatements(context, source) {
    const removals = [];
    const ast = context.parse(source);

    function visit(node) {
        if (!node || typeof node !== "object") return;
        if (node.type === "DebuggerStatement") {
            removals.push([node.start, node.end]);
            return;
        }
        if (node.type === "ExpressionStatement") {
            const callee = node.expression?.type === "CallExpression" ? node.expression.callee : null;
            const isConsoleDebugCall =
                callee?.type === "MemberExpression" &&
                callee.computed === false &&
                callee.object?.type === "Identifier" &&
                callee.object.name === "console" &&
                callee.property?.type === "Identifier" &&
                (callee.property.name === "log" || callee.property.name === "debug");
            if (isConsoleDebugCall) {
                removals.push([node.start, node.end]);
                return;
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
        }
    }

    visit(ast);
    let output = source;
    for (const [start, end] of removals.sort((left, right) => right[0] - left[0])) {
        output = output.slice(0, start) + output.slice(end);
    }
    return output;
}

export function sourceProtectionPlugin() {
    return {
        name: "syn4pseops-source-protection",
        apply: "build",
        enforce: "post",
        renderChunk(code, chunk) {
            if (!chunk.fileName.endsWith(".js")) return null;

            const normalizedModuleIds = chunk.moduleIds.map((moduleId) => normalizePath(moduleId));
            const ownsFirstPartyModule = normalizedModuleIds.some((moduleId) => moduleId.startsWith(sourceRoot));
            if (!ownsFirstPartyModule) return null;

            const hardenedCode = stripDebugStatements(this, code);
            if (!protectedChunkNames.has(chunk.name)) {
                return hardenedCode === code ? null : { code: hardenedCode, map: null };
            }

            const ownsProtectedEntry = normalizedModuleIds
                .some((moduleId) => protectedEntries.has(moduleId));
            if (!ownsProtectedEntry) return null;

            const result = JavaScriptObfuscator.obfuscate(hardenedCode, {
                target: "browser-no-eval",
                compact: true,
                seed: 4162026,
                renameGlobals: false,
                identifierNamesGenerator: "hexadecimal",
                stringArray: true,
                stringArrayCallsTransform: false,
                stringArrayEncoding: [],
                stringArrayIndexShift: true,
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayThreshold: 0.65,
                stringArrayWrappersCount: 1,
                stringArrayWrappersChainedCalls: true,
                stringArrayWrappersParametersMaxCount: 2,
                stringArrayWrappersType: "variable",
                controlFlowFlattening: false,
                deadCodeInjection: false,
                debugProtection: false,
                disableConsoleOutput: false,
                selfDefending: false,
                splitStrings: false,
                transformObjectKeys: false,
                unicodeEscapeSequence: false,
                sourceMap: false,
            });

            console.log(`[source-protection] Protected ${chunk.fileName}`);
            return {
                code: result.getObfuscatedCode(),
                map: null,
            };
        },
    };
}
