import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBaseUrl } from "./resolveBaseUrl";

const PUBLIC = "https://happy.example.com";

describe("resolveBaseUrl", () => {
    beforeEach(() => {
        vi.stubEnv("PUBLIC_URL", "");
        vi.stubEnv("PORT", "");
    });
    afterEach(() => { vi.unstubAllEnvs(); });

    it("returns the loopback origin for a loopback Host even when PUBLIC_URL is set", () => {
        vi.stubEnv("PUBLIC_URL", PUBLIC);
        expect(resolveBaseUrl({ headers: { host: "127.0.0.1:3005" } })).toBe("http://127.0.0.1:3005");
    });

    it("handles localhost with a port", () => {
        vi.stubEnv("PUBLIC_URL", PUBLIC);
        expect(resolveBaseUrl({ headers: { host: "localhost:4000" } })).toBe("http://localhost:4000");
    });

    it("handles ipv6 loopback", () => {
        vi.stubEnv("PUBLIC_URL", PUBLIC);
        expect(resolveBaseUrl({ headers: { host: "[::1]:3005" } })).toBe("http://[::1]:3005");
        expect(resolveBaseUrl({ headers: { host: "[::1]" } })).toBe("http://[::1]");
    });

    it("prefers PUBLIC_URL when x-forwarded-host is present, even with a loopback Host", () => {
        vi.stubEnv("PUBLIC_URL", PUBLIC);
        expect(resolveBaseUrl({ headers: { host: "127.0.0.1:3005", "x-forwarded-host": "happy.example.com" } })).toBe(PUBLIC);
    });

    it("prefers PUBLIC_URL for a non-loopback Host", () => {
        vi.stubEnv("PUBLIC_URL", PUBLIC);
        expect(resolveBaseUrl({ headers: { host: "192.168.1.5:3005" } })).toBe(PUBLIC);
    });

    it("uses x-forwarded-* without PUBLIC_URL", () => {
        expect(resolveBaseUrl({ headers: { host: "127.0.0.1:3005", "x-forwarded-host": "proxy.example.com", "x-forwarded-proto": "https" } }))
            .toBe("https://proxy.example.com");
    });

    it("uses the Host header without PUBLIC_URL or forwarding", () => {
        expect(resolveBaseUrl({ headers: { host: "192.168.1.5:3005" } })).toBe("http://192.168.1.5:3005");
    });

    it("falls back to localhost:PORT with no headers", () => {
        vi.stubEnv("PORT", "4321");
        expect(resolveBaseUrl({ headers: {} })).toBe("http://localhost:4321");
        vi.stubEnv("PORT", "");
        expect(resolveBaseUrl({ headers: {} })).toBe("http://localhost:3005");
    });
});
