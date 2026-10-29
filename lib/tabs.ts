import {TabItem} from "@/lib/types.ts";

export const TABS: TabItem[] = [
    {
        id: "lab",
        href: "/lab",
        label: "Lab",
        icon: "🧪",
    },
    {
        id: "run-job",
        href: "/run-job",
        label: "Run Job",
        icon: "🚀",
    },
    {
        id: "results",
        href: "/results",
        label: "Results",
        icon: "📊",
    },
    {
        id: "compare",
        href: "/compare",
        label: "Compare",
        icon: "⚖️",
    },
];

export const getActiveTab = (pathname: string) => {
    if (pathname.startsWith("/lab")) return "lab";
    if (pathname.startsWith("/results")) return "results";
    if (pathname.startsWith("/compare")) return "compare";
    if (pathname.startsWith("/run-job")) return "run-job";
    return "run-job";
};