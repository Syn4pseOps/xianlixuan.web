type LocalizedLanguage = "en" | "th";

const INIT_FLAG = "__twilightLocalizedContentInit";

function normalizeLanguageCode(languageCode?: string | null): LocalizedLanguage | null {
    if (!languageCode) return null;

    const normalized = languageCode.toLowerCase();
    if (normalized === "thai" || normalized === "th") return "th";
    if (normalized === "english" || normalized === "en") return "en";

    return null;
}

export function resolveLocalizedContentLanguage(languageCode?: string | null): LocalizedLanguage {
    const explicitLanguage = normalizeLanguageCode(languageCode);
    if (explicitLanguage) return explicitLanguage;

    if (typeof localStorage !== "undefined") {
        const storedLanguage = normalizeLanguageCode(localStorage.getItem("selected-language"));
        if (storedLanguage) return storedLanguage;
    }

    if (typeof document !== "undefined") {
        const pageLanguage = normalizeLanguageCode(
            document.getElementById("swup-container")?.getAttribute("data-page-lang"),
        );
        if (pageLanguage) return pageLanguage;

        const switchLanguage = normalizeLanguageCode(
            document.querySelector(".lang-switch-shell")?.getAttribute("data-active"),
        );
        if (switchLanguage) return switchLanguage;

        const htmlLanguage = normalizeLanguageCode(document.documentElement.lang);
        if (htmlLanguage) return htmlLanguage;

        const configLanguage = normalizeLanguageCode(
            document.getElementById("config-carrier")?.getAttribute("data-lang"),
        );
        if (configLanguage) return configLanguage;
    }

    return "en";
}

function syncLocalizedHeadingIds(block: Element, isActive: boolean) {
    block.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((heading) => {
        if (!heading.dataset.originalId) {
            heading.dataset.originalId = heading.id || "";
        }

        if (isActive) {
            const originalId = heading.dataset.originalId;
            if (originalId) {
                heading.id = originalId;
            }
        } else {
            heading.removeAttribute("id");
        }
    });
}

function toggleLocalizedBlocks(
    selector: string,
    attributeName: string,
    activeLanguage: LocalizedLanguage,
    options?: { syncHeadingIds?: boolean },
) {
    document.querySelectorAll<HTMLElement>(selector).forEach((block) => {
        const isActive = block.getAttribute(attributeName) === activeLanguage;
        block.classList.toggle("hidden", !isActive);
        block.setAttribute("aria-hidden", String(!isActive));

        if (options?.syncHeadingIds) {
            syncLocalizedHeadingIds(block, isActive);
        }
    });
}

export function updateLocalizedContent(languageCode?: string | null) {
    if (typeof document === "undefined") return;

    const activeLanguage = resolveLocalizedContentLanguage(languageCode);
    document.documentElement.lang = activeLanguage;

    if (document.querySelector("[data-intro-lang]")) {
        toggleLocalizedBlocks("[data-intro-lang]", "data-intro-lang", activeLanguage);
    }

    if (document.querySelector("[data-about-lang]")) {
        toggleLocalizedBlocks("[data-about-lang]", "data-about-lang", activeLanguage, {
            syncHeadingIds: true,
        });
        window.dispatchEvent(new Event("content-decrypted"));
    }

    if (document.querySelector("[data-case-lang]")) {
        toggleLocalizedBlocks("[data-case-lang]", "data-case-lang", activeLanguage, {
            syncHeadingIds: true,
        });
        window.dispatchEvent(new Event("content-decrypted"));
    }
}

function shouldRefreshLocalizedContent(records: MutationRecord[]) {
    return records.some((record) => {
        if (
            record.type === "attributes" &&
            record.target instanceof Element &&
            record.target.matches(".lang-switch-shell")
        ) {
            return true;
        }

        return Array.from(record.addedNodes).some((node) =>
            node instanceof Element &&
            (node.matches(".lang-switch-shell") || !!node.querySelector(".lang-switch-shell")),
        );
    });
}

export function initLocalizedContent() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if ((window as typeof window & Record<string, unknown>)[INIT_FLAG]) return;

    const run = () => updateLocalizedContent();
    const onLanguageChanged = (event: Event) => {
        const detail = event instanceof CustomEvent ? event.detail : undefined;
        updateLocalizedContent(detail?.languageCode);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
        run();
    }

    document.addEventListener("astro:after-swap", run);
    document.addEventListener("astro:page-load", run);
    window.addEventListener("twilight:language-changed", onLanguageChanged);

    const bindMutationObserver = () => {
        if (!document.body) return;

        const observer = new MutationObserver((records) => {
            if (shouldRefreshLocalizedContent(records)) {
                run();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-active"],
        });
    };

    if (document.body) {
        bindMutationObserver();
    } else {
        document.addEventListener("DOMContentLoaded", bindMutationObserver, { once: true });
    }

    (window as typeof window & Record<string, unknown>)[INIT_FLAG] = true;
}
