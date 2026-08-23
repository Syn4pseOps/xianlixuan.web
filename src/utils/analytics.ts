import { analyticsConfig } from "@/config";


export const ANALYTICS_ATTRS = {
    websiteId: "data-analytics-website-id",
} as const;

export type AnalyticsConfig = {
    enabled: boolean;
    platform: string;
    scriptUrl?: string;
    websiteId?: string;
};

export const getAnalyticsConfig = (): AnalyticsConfig => {
    const { enabled, platform } = analyticsConfig;
    if (platform === "umami") {
        return {
            enabled,
            platform,
            scriptUrl: analyticsConfig.umami.scriptUrl,
            websiteId: analyticsConfig.umami.websiteId,
        };
    }
    return { enabled, platform };
};
