import {ReactNode} from "react";

export function LeafletLoader({children}: {children: ReactNode}) {
    return <div
        className="flex flex-col items-center justify-center h-[520px] rounded-xl border border-border bg-surface text-center space-y-2">
        <span className="inline-block w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"/>
        <span className="text-muted">{children}</span>
    </div>;
}