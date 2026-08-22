<script lang="ts">
import { onMount } from "svelte";

import {
    getDefaultLanguage,
    getSiteLanguage,
    getStoredLanguage,
    getTranslateLanguageFromConfig,
    setStoredLanguage,
} from "@/utils/language";
import { siteConfig } from "@/config";
import { getSupportedTranslateLanguages } from "@/i18n/language";


const languages = getSupportedTranslateLanguages().filter((lang) =>
    lang.name === "EN" || lang.name === "TH",
);

const sourceLanguage = getTranslateLanguageFromConfig(getDefaultLanguage());
const fallbackLanguage = languages.find((lang) => lang.code === sourceLanguage)?.code || languages[0]?.code || "english";
const englishCode = languages.find((lang) => lang.name === "EN")?.code || "english";
const thaiCode = languages.find((lang) => lang.name === "TH")?.code || "thai";

let currentLanguage = $state(fallbackLanguage);

function syncCurrentLanguage() {
    const pageLanguage = document.getElementById("swup-container")?.getAttribute("data-page-lang");
    if (!getStoredLanguage() && (pageLanguage === "en" || pageLanguage === "th")) {
        currentLanguage = pageLanguage === "th" ? thaiCode : englishCode;
        document.documentElement.lang = pageLanguage;
        return;
    }

    const storedLanguage = getSiteLanguage();
    currentLanguage = languages.some((lang) => lang.code === storedLanguage)
        ? storedLanguage
        : fallbackLanguage;
    document.documentElement.lang = currentLanguage === thaiCode ? "th" : "en";
}

async function changeLanguage(languageCode: string) {
    if (currentLanguage === languageCode) return;

    try {
        if (!(window as any).translateScriptLoaded && typeof (window as any).loadTranslateScript === "function") {
            await (window as any).loadTranslateScript();
        }

        const translate = (window as any).translate;
        if (translate) {
            const localLang = translate.language.getLocal();

            translate.changeLanguage(languageCode);

            if (languageCode === localLang) {
                translate.reset();
            }
        } else {
            console.warn("translate.js is not loaded; applying custom language state only");
        }
    } catch (error) {
        console.error("Failed to execute translation:", error);
    }

    setStoredLanguage(languageCode);
    currentLanguage = languageCode;
    document.documentElement.lang = languageCode === thaiCode ? "th" : "en";
    window.dispatchEvent(new CustomEvent("twilight:language-changed", {
        detail: { languageCode }
    }));
}

onMount(() => {
    syncCurrentLanguage();
    document.addEventListener("astro:after-swap", syncCurrentLanguage);

    return () => {
        document.removeEventListener("astro:after-swap", syncCurrentLanguage);
    };
});
</script>

{#if siteConfig.translate?.enable}
    <div
        class="lang-switch-shell"
        data-active={currentLanguage === thaiCode ? "th" : "en"}
        aria-label="Language switch"
    >
        <div class="lang-switch-track" aria-hidden="true"></div>
        <button
            type="button"
            aria-label="Switch to English"
            aria-pressed={currentLanguage === englishCode}
            class="lang-switch-option"
            class:is-active={currentLanguage === englishCode}
            onclick={() => changeLanguage(englishCode)}
        >
            EN
        </button>
        <button
            type="button"
            aria-label="Switch to Thai"
            aria-pressed={currentLanguage === thaiCode}
            class="lang-switch-option"
            class:is-active={currentLanguage === thaiCode}
            onclick={() => changeLanguage(thaiCode)}
        >
            TH
        </button>
    </div>
{/if}

<style>
    .lang-switch-shell {
        position: relative;
        display: inline-grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        min-width: 5.2rem;
        height: 2.45rem;
        padding: 0.2rem;
        border-radius: 0.8rem;
        border: 1px solid rgba(121, 247, 255, 0.1);
        background: linear-gradient(145deg, rgba(12, 12, 29, 0.88), rgba(21, 17, 45, 0.92));
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 10px 24px rgba(2, 4, 18, 0.24);
        overflow: hidden;
    }

    .lang-switch-track {
        position: absolute;
        top: 0.2rem;
        bottom: 0.2rem;
        left: 0.2rem;
        width: calc(50% - 0.2rem);
        border-radius: 0.62rem;
        background: linear-gradient(135deg, rgba(93, 66, 174, 0.95), rgba(129, 88, 230, 0.98));
        box-shadow:
            0 0 18px rgba(129, 88, 230, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        transition: transform 220ms ease, background 220ms ease, box-shadow 220ms ease;
    }

    .lang-switch-shell[data-active="th"] .lang-switch-track {
        transform: translateX(100%);
        background: linear-gradient(135deg, rgba(89, 67, 169, 0.96), rgba(156, 109, 255, 0.98));
        box-shadow:
            0 0 18px rgba(156, 109, 255, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }

    .lang-switch-option {
        position: relative;
        z-index: 1;
        height: 100%;
        border: 0;
        background: transparent;
        color: rgba(208, 214, 255, 0.6);
        font-family: var(--font-mono);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: color 180ms ease, text-shadow 180ms ease;
    }

    .lang-switch-option.is-active {
        color: #efeaff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.16);
    }

    .lang-switch-option:not(.is-active):hover {
        color: rgba(239, 234, 255, 0.84);
    }

    .lang-switch-option:focus-visible {
        outline: 2px solid rgba(121, 247, 255, 0.45);
        outline-offset: -2px;
        border-radius: 0.62rem;
    }

    @media (max-width: 512px) {
        .lang-switch-shell {
            min-width: 4.8rem;
            height: 2.25rem;
            border-radius: 0.72rem;
        }

        .lang-switch-option {
            font-size: 0.76rem;
        }
    }
</style>
