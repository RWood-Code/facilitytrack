import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/backup", () => ({
  getPublicBackupState: vi.fn(),
  configureBackup: vi.fn(),
  disableBackup: vi.fn(),
  runBackupNow: vi.fn(),
}));

import * as backupLib from "../lib/backup";
import backupRouter from "./backup";

const stubState = {
  enabled: true,
  configured: true,
  clientId: "client-id-1",
  tenantId: "common",
  targetFolder: "FacilityTrack/Backups",
  scheduleHour: 2,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastBackupBytes: null,
  lastBackupRemotePath: null,
  consecutiveFailures: 0,
  inProgress: false,
};

/**
 * Build a tiny Express app that mounts the backup router with a stub auth
 * middleware. The stub reads the `x-test-role` header so each test can simulate
 * "no user", "regular user", "admin" or "superuser" without spinning up a
 * full session/login flow.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const role = req.header("x-test-role");
    if (role) {
      // The shape only needs `role` for `requireRole`; cast to satisfy TS.
      (req as unknown as { user: { id: number; role: string } }).user = {
        id: 1,
        role,
      };
    }
    next();
  });
  app.use("/api", backupRouter);
  return app;
}

beforeEach(() => {
  vi.mocked(backupLib.getPublicBackupState).mockResolvedValue(stubState);
  vi.mocked(backupLib.configureBackup).mockResolvedValue({} as never);
  vi.mocked(backupLib.disableBackup).mockResolvedValue({} as never);
  vi.mocked(backupLib.runBackupNow).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/backup/status", () => {
  it("returns the public state without requiring auth", async () => {
    const res = await request(buildApp()).get("/api/backup/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stubState);
    expect(backupLib.getPublicBackupState).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/backup/configure (admin-only)", () => {
  const validBody = { clientId: "c", refreshToken: "r" };

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(buildApp()).post("/api/backup/configure").send(validBody);
    expect(res.status).toBe(401);
    expect(backupLib.configureBackup).not.toHaveBeenCalled();
  });

  it("rejects regular users with 403", async () => {
    const res = await request(buildApp())
      .post("/api/backup/configure")
      .set("x-test-role", "user")
      .send(validBody);
    expect(res.status).toBe(403);
    expect(backupLib.configureBackup).not.toHaveBeenCalled();
  });

  it("admin can configure backups (200 + state)", async () => {
    const res = await request(buildApp())
      .post("/api/backup/configure")
      .set("x-test-role", "admin")
      .send({
        clientId: "c1",
        tenantId: "tenant",
        refreshToken: "r1",
        targetFolder: "Custom/Folder",
        scheduleHour: 3,
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stubState);
    expect(backupLib.configureBackup).toHaveBeenCalledWith({
      clientId: "c1",
      tenantId: "tenant",
      refreshToken: "r1",
      targetFolder: "Custom/Folder",
      scheduleHour: 3,
    });
  });

  it("superuser can also configure backups", async () => {
    const res = await request(buildApp())
      .post("/api/backup/configure")
      .set("x-test-role", "superuser")
      .send(validBody);
    expect(res.status).toBe(200);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(buildApp())
      .post("/api/backup/configure")
      .set("x-test-role", "admin")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(backupLib.configureBackup).not.toHaveBeenCalled();
  });

  it("returns 400 when scheduleHour is out of range", async () => {
    const res = await request(buildApp())
      .post("/api/backup/configure")
      .set("x-test-role", "admin")
      .send({ clientId: "c", refreshToken: "r", scheduleHour: 99 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/backup/disable (admin-only)", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(buildApp()).post("/api/backup/disable");
    expect(res.status).toBe(401);
    expect(backupLib.disableBackup).not.toHaveBeenCalled();
  });

  it("rejects regular users with 403", async () => {
    const res = await request(buildApp())
      .post("/api/backup/disable")
      .set("x-test-role", "user");
    expect(res.status).toBe(403);
    expect(backupLib.disableBackup).not.toHaveBeenCalled();
  });

  it("admin can disable backups (200 + state)", async () => {
    const res = await request(buildApp())
      .post("/api/backup/disable")
      .set("x-test-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stubState);
    expect(backupLib.disableBackup).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/backup/run (admin-only, returns { ok, state })", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(buildApp()).post("/api/backup/run");
    expect(res.status).toBe(401);
    expect(backupLib.runBackupNow).not.toHaveBeenCalled();
  });

  it("rejects regular users with 403", async () => {
    const res = await request(buildApp())
      .post("/api/backup/run")
      .set("x-test-role", "user");
    expect(res.status).toBe(403);
    expect(backupLib.runBackupNow).not.toHaveBeenCalled();
  });

  it("returns 200 + { ok: true, state } when the backup succeeds", async () => {
    vi.mocked(backupLib.runBackupNow).mockResolvedValue({
      ok: true,
      bytes: 4096,
      remotePath: "/FacilityTrack/Backups/facilitytrack-2026-04-26T0000Z.sqlite",
    });
    const res = await request(buildApp())
      .post("/api/backup/run")
      .set("x-test-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, state: stubState });
    // The route MUST always return both `ok` and `state` so the frontend can
    // refresh the status banner without a follow-up GET /status call.
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("state");
  });

  it("returns 502 + { ok: false, error, state } when the backup fails", async () => {
    vi.mocked(backupLib.runBackupNow).mockResolvedValue({
      ok: false,
      error: "Microsoft token endpoint returned 401: invalid_grant",
    });
    const res = await request(buildApp())
      .post("/api/backup/run")
      .set("x-test-role", "admin");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      ok: false,
      error: "Microsoft token endpoint returned 401: invalid_grant",
      state: stubState,
    });
  });

  it("superuser is also allowed to trigger a run", async () => {
    const res = await request(buildApp())
      .post("/api/backup/run")
      .set("x-test-role", "superuser");
    expect(res.status).toBe(200);
    expect(backupLib.runBackupNow).toHaveBeenCalledTimes(1);
  });
});
