import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessRegistry } from "./ProcessRegistry";
import type { ICommandExecutor } from "@/domain/repositories/ICommandExecutor";
import type { SpawnedProcess } from "@/domain/repositories/ICommandExecutor";

function createMockExecutor(): ICommandExecutor {
    return {
        spawn: vi.fn(),
        execute: vi.fn(),
        forceKillProcess: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockProcess(pid = 1): SpawnedProcess {
    return {
        pid,
        kill: vi.fn().mockResolvedValue(undefined),
    };
}

describe("ProcessRegistry", () => {
    beforeEach(() => {
        ProcessRegistry.reset();
    });

    it("init + register + unregister lifecycle", () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        const process = createMockProcess();
        ProcessRegistry.register("compress", "job-1", process);

        // Should be registered (no error)
        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(false);

        ProcessRegistry.unregister("compress", "job-1");
    });

    it("wasCancelled returns false when not cancelled", () => {
        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(false);
    });

    it("cancel sets the cancelled flag and kills the process", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        const process = createMockProcess(42);
        ProcessRegistry.register("compress", "job-1", process);

        await ProcessRegistry.cancel("compress", "job-1");

        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(true);
        expect(process.kill).toHaveBeenCalled();
    });

    it("clearCancelled removes the cancelled flag", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        const process = createMockProcess();
        ProcessRegistry.register("compress", "job-1", process);

        await ProcessRegistry.cancel("compress", "job-1");
        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(true);

        ProcessRegistry.clearCancelled("compress", "job-1");
        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(false);
    });

    it("cancelAll cancels all registered processes in a workflow", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        const p1 = createMockProcess(1);
        const p2 = createMockProcess(2);
        ProcessRegistry.register("compress", "job-1", p1);
        ProcessRegistry.register("compress", "job-2", p2);

        await ProcessRegistry.cancelAll("compress");

        expect(ProcessRegistry.isWorkflowCancelled("compress")).toBe(true);
        expect(p1.kill).toHaveBeenCalled();
        expect(p2.kill).toHaveBeenCalled();
    });

    it("isWorkflowCancelled reflects workflow-level cancellation", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        expect(ProcessRegistry.isWorkflowCancelled("compress")).toBe(false);

        await ProcessRegistry.cancelAll("compress");
        expect(ProcessRegistry.isWorkflowCancelled("compress")).toBe(true);

        ProcessRegistry.clearWorkflowCancellation("compress");
        expect(ProcessRegistry.isWorkflowCancelled("compress")).toBe(false);
    });

    it("register auto-kills process if job was pre-cancelled", () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        // Pre-cancel before register
        ProcessRegistry.cancel("compress", "job-x");

        const process = createMockProcess();
        ProcessRegistry.register("compress", "job-x", process);

        // Process should have been terminated immediately
        expect(process.kill).toHaveBeenCalled();
    });

    it("reset clears all state", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        const process = createMockProcess();
        ProcessRegistry.register("compress", "job-1", process);
        await ProcessRegistry.cancel("compress", "job-1");
        await ProcessRegistry.cancelAll("extract");

        ProcessRegistry.reset();

        expect(ProcessRegistry.wasCancelled("compress", "job-1")).toBe(false);
        expect(ProcessRegistry.isWorkflowCancelled("extract")).toBe(false);
    });

    it("cancel on unregistered job just sets the flag (no throw)", async () => {
        const executor = createMockExecutor();
        ProcessRegistry.init(executor);

        // Should not throw
        await ProcessRegistry.cancel("compress", "nonexistent");
        expect(ProcessRegistry.wasCancelled("compress", "nonexistent")).toBe(true);
    });
});
