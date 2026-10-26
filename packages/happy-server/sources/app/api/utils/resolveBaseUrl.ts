type HeaderBag = { headers: Record<string, string | string[] | undefined> };

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function hostname(hostHeader: string): string {
    if (hostHeader.startsWith("[")) {
        const end = hostHeader.indexOf("]");
        return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
    }
    const colon = hostHeader.indexOf(":");
    return (colon === -1 ? hostHeader : hostHeader.slice(0, colon)).toLowerCase();
}

/**
 * Base URL a client should use to reach local-mode upload/download endpoints.
 * Direct loopback callers (no x-forwarded-host) get their own origin; otherwise
 * PUBLIC_URL, then x-forwarded-*, then Host, then localhost.
 */
export function resolveBaseUrl(request: HeaderBag): string {
    const xfHost = first(request.headers["x-forwarded-host"]);
    const hostHeader = first(request.headers.host);
    if (!xfHost && hostHeader && LOOPBACK_HOSTNAMES.has(hostname(hostHeader))) {
        return `http://${hostHeader}`;
    }
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
    const proto = first(request.headers["x-forwarded-proto"]) ?? "http";
    const host = xfHost ?? hostHeader;
    if (typeof host === "string" && host.length > 0) {
        return `${proto}://${host}`;
    }
    return `http://localhost:${process.env.PORT || "3005"}`;
}
