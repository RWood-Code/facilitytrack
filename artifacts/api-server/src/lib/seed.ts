import { db } from "@workspace/db";
import {
  appUsersTable,
  facilitiesTable,
  poolsTable,
  staffTable,
  complianceDocumentsTable,
  systemSettingsTable,
} from "@workspace/db";
import { count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

export async function runSeedIfEmpty() {
  try {
    const [{ count: userCount }] = await db
      .select({ count: count() })
      .from(appUsersTable);

    if (Number(userCount) > 0) {
      logger.info("Seed: existing data found, skipping");
      return;
    }

    logger.info("Seed: seeding demo data…");

    const [facility] = await db
      .insert(facilitiesTable)
      .values({
        name: "Aquatic Centre Demo",
        address: "1 Pool Lane, Wellington 6011",
        phone: "04 800 0001",
        email: "info@aquaticdemo.co.nz",
      })
      .returning();

    await db.insert(poolsTable).values([
      {
        facilityId: facility.id,
        name: "Main Pool",
        poolType: "pool",
        volumeLitres: 1200000,
        notes: "25m × 8 lanes competition pool",
      },
      {
        facilityId: facility.id,
        name: "Spa / Hydrotherapy",
        poolType: "spa",
        volumeLitres: 12000,
        notes: "Wellness wing — max temp 40°C",
      },
      {
        facilityId: facility.id,
        name: "Learners Pool",
        poolType: "pool",
        volumeLitres: 240000,
        notes: "Shallow-end teaching pool, 0.6–1.2 m depth",
      },
    ]);

    await db.insert(staffTable).values([
      {
        facilityId: facility.id,
        firstName: "Sam",
        lastName: "Manager",
        email: "sam.manager@aquaticdemo.co.nz",
        role: "manager",
        isActive: true,
      },
      {
        facilityId: facility.id,
        firstName: "Alex",
        lastName: "Staff",
        email: "alex.staff@aquaticdemo.co.nz",
        role: "lifeguard",
        isActive: true,
      },
    ]);

    await db.insert(appUsersTable).values([
      {
        email: "admin@facilitytrack.co.nz",
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        passwordHash: await bcrypt.hash("admin123", 10),
        pin: await bcrypt.hash("1234", 10),
        isActive: true,
      },
      {
        email: "manager@facilitytrack.co.nz",
        firstName: "Sam",
        lastName: "Manager",
        role: "user",
        passwordHash: await bcrypt.hash("manager123", 10),
        pin: await bcrypt.hash("5678", 10),
        isActive: true,
      },
      {
        email: "staff@facilitytrack.co.nz",
        firstName: "Alex",
        lastName: "Staff",
        role: "user",
        passwordHash: await bcrypt.hash("staff123", 10),
        pin: await bcrypt.hash("9999", 10),
        isActive: true,
      },
    ]);

    await db.insert(complianceDocumentsTable).values([
      {
        facilityId: facility.id,
        documentType: "ILTP Certificate",
        documentName: "ILTP Level 2 — Sam Manager",
        status: "current",
        issuedDate: new Date("2024-03-01"),
        expiryDate: new Date("2027-03-01"),
        issuedBy: "Swimming New Zealand",
        referenceNumber: "ILTP-L2-2024-001",
      },
      {
        facilityId: facility.id,
        documentType: "PoolSafe Accreditation",
        documentName: "PoolSafe Annual Accreditation 2024",
        status: "current",
        issuedDate: new Date("2024-01-15"),
        expiryDate: new Date("2025-01-15"),
        issuedBy: "Swimming New Zealand",
        referenceNumber: "PS-2024-0042",
      },
      {
        facilityId: facility.id,
        documentType: "Emergency Action Plan",
        documentName: "Aquatic Centre EAP v3.1",
        status: "current",
        issuedDate: new Date("2024-07-01"),
        expiryDate: new Date("2025-07-01"),
        issuedBy: "Facility Management",
        referenceNumber: "EAP-2024-V3",
      },
    ]);

    await db.insert(systemSettingsTable).values([
      { key: "facility_name", value: "Aquatic Centre Demo", label: "Facility Name", category: "general" },
      { key: "test_interval_hours", value: "4", label: "Water Test Interval (hours)", category: "compliance" },
      { key: "expiry_warning_days", value: "60", label: "Expiry Warning Lead Time (days)", category: "compliance" },
      { key: "nzs_standard", value: "NZS 5826:2010", label: "Applied Standard", category: "compliance" },
    ]);

    logger.info("Seed: demo data seeded successfully");
  } catch (err) {
    logger.error({ err }, "Seed: error during seeding");
  }
}
