<script lang="ts">
import { onMount } from "svelte";

import { getPostUrl } from "@utils/url";
import { getCategoryPathLabel, getCategoryPathParts } from "@utils/category";
import { parseTags } from "@utils/tag";


interface Post {
    id: string;
    data: {
        title: string;
        tags: string[];
        category?: string | string[] | null;
        published: Date | string;
        routeName?: string;
    };
}

interface Group {
    year: number;
    posts: Post[];
}

interface Props {
    sortedPosts?: Post[];
}

let { sortedPosts = [] }: Props = $props();

let tags = $state<string[]>([]);
let categories = $state<string[]>([]);
let uncategorized = $state<string | null>(null);

function syncParams() {
    const params = new URLSearchParams(window.location.search);
    params.delete("tag");
    params.delete("category");
    tags.forEach((tag) => params.append("tag", tag));
    categories.forEach((category) => params.append("category", category));

    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
}

onMount(() => {
    const params = new URLSearchParams(window.location.search);
    tags = params.has("tag") ? params.getAll("tag") : [];
    categories = params.has("category") ? params.getAll("category") : [];
    uncategorized = params.get("uncategorized");
});

function formatDate(date: Date | string) {
    const d = new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${month}.${day}`;
}

function setTag(tag: string | null) {
    tags = tag ? [tag] : [];
    syncParams();
}

function setCategory(category: string | null) {
    categories = category ? [category] : [];
    syncParams();
}

function isCategoryMatch(category: string | string[] | null | undefined, targets: string[]) {
    const postParts = getCategoryPathParts(category);
    if (!postParts || postParts.length === 0) return false;
    return targets.some((target) => {
        const targetParts = target
            .split(" / ")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        if (targetParts.length === 0) return false;
        if (targetParts.length > postParts.length) return false;
        return targetParts.every((part, index) => part === postParts[index]);
    });
}

let groups = $derived.by(() => {
    let filteredPosts = sortedPosts.map((post) => ({
        ...post,
        data: {
            ...post.data,
            published: new Date(post.data.published),
        },
    }));

    if (tags.length > 0) {
        filteredPosts = filteredPosts.filter(
            (post) =>
            {
                const postTags = parseTags(post.data.tags);
                return postTags.some((tag) => tags.includes(tag));
            }
        );
    }

    if (categories.length > 0) {
        filteredPosts = filteredPosts.filter(
            (post) => isCategoryMatch(post.data.category, categories),
        );
    }

    if (uncategorized !== null) {
        filteredPosts = filteredPosts.filter((post) => !getCategoryPathLabel(post.data.category));
    }

    // 按发布时间倒序排序，确保不受置顶影响
    filteredPosts = filteredPosts.slice().sort((a, b) => b.data.published.getTime() - a.data.published.getTime());

    const grouped = filteredPosts.reduce(
        (acc, post) => {
            const year = post.data.published.getFullYear();
            if (!acc[year]) {
                acc[year] = [];
            }
            acc[year].push(post);
            return acc;
        },
        {} as Record<number, Post[]>,
    );

    const groupedPostsArray = Object.keys(grouped).map((yearStr) => ({
        year: Number.parseInt(yearStr, 10),
        posts: grouped[Number.parseInt(yearStr, 10)],
    }));

    groupedPostsArray.sort((a, b) => b.year - a.year);

    return groupedPostsArray;
});

let availableTags = $derived.by(() => {
    const names = new Set<string>();
    sortedPosts.forEach((post) => {
        parseTags(post.data.tags).forEach((tag) => names.add(tag));
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
});

let availableCategories = $derived.by(() => {
    const names = new Set<string>();
    sortedPosts.forEach((post) => {
        const label = getCategoryPathLabel(post.data.category);
        if (label) names.add(label);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
});

let filteredCount = $derived(groups.reduce((count, group) => count + group.posts.length, 0));
</script>

<div class="archive-ledger">
    {#if availableCategories.length > 0}
        <section class="archive-filter" aria-labelledby="archive-filter-category-label">
            <p id="archive-filter-category-label" class="archive-filter-label">Filter by category</p>
            <div class="archive-tag-list" aria-label="Filter archive by category">
                <button
                    type="button"
                    class="archive-tag"
                    class:is-active={categories.length === 0}
                    aria-pressed={categories.length === 0}
                    onclick={() => setCategory(null)}
                >All</button>
                {#each availableCategories as category}
                    <button
                        type="button"
                        class="archive-tag"
                        class:is-active={categories.includes(category)}
                        aria-pressed={categories.includes(category)}
                        onclick={() => setCategory(categories.includes(category) ? null : category)}
                    >{category}</button>
                {/each}
            </div>
        </section>
    {/if}

    <section class="archive-filter" aria-labelledby="archive-filter-label">
        <p id="archive-filter-label" class="archive-filter-label">Filter by tag</p>
        <div class="archive-tag-list" aria-label="Filter archive by tag">
            <button
                type="button"
                class="archive-tag"
                class:is-active={tags.length === 0}
                aria-pressed={tags.length === 0}
                onclick={() => setTag(null)}
            >All</button>
            {#each availableTags as tag}
                <button
                    type="button"
                    class="archive-tag"
                    class:is-active={tags.includes(tag)}
                    aria-pressed={tags.includes(tag)}
                    onclick={() => setTag(tags.includes(tag) ? null : tag)}
                >{tag}</button>
            {/each}
        </div>
    </section>

    <header class="archive-ledger-header">
        <h1>Full Ledger</h1>
        <div class="synapse-rule" aria-hidden="true"></div>
        <p>{filteredCount} {filteredCount === 1 ? "post" : "posts"}</p>
    </header>

    {#if groups.length === 0}
        <p class="archive-empty">No posts match this tag.</p>
    {/if}

    {#each groups as group}
        <section class="archive-year-group" aria-labelledby={`archive-year-${group.year}`}>
            <h2 id={`archive-year-${group.year}`} class="archive-year">{group.year}</h2>
            <ol class="archive-post-list">
            {#each group.posts as post}
                <li>
                    <a href={getPostUrl(post)} aria-label={post.data.title} class="archive-post-link">
                        <time datetime={new Date(post.data.published).toISOString()} class="archive-post-date">
                            {formatDate(post.data.published)}
                        </time>
                        <span class="archive-post-title notranslate" translate="no">{post.data.title}</span>
                        <span class="archive-post-category">{getCategoryPathLabel(post.data.category) ?? "Field Note"}</span>
                    </a>
                </li>
            {/each}
            </ol>
        </section>
    {/each}
</div>
