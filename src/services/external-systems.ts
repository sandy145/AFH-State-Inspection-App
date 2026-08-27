import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Mock integration interfaces (§39).
 *
 * DSHS already holds the authoritative records for homes, licences, providers,
 * inspectors and regions. This portal is not their source of truth. These
 * interfaces are the seams those systems will attach to; for the MVP each is
 * backed by seeded local rows, and every record carries an `externalId` so a
 * real synchronization can match on it later.
 */

export interface FacilityRecord {
  externalId: string;
  name: string;
  licenseNumber: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  bedCapacity: number;
  licenseeName: string | null;
  isActive: boolean;
}

export interface FacilityDirectoryService {
  readonly source: string;
  listFacilities(): Promise<FacilityRecord[]>;
  findByLicenseNumber(licenseNumber: string): Promise<FacilityRecord | null>;
}

export interface LicenseStatus {
  licenseNumber: string;
  status: "ACTIVE" | "PROVISIONAL" | "SUSPENDED" | "CLOSED";
  effectiveDate: Date | null;
  /** Prior inspections held in the licensing system, not created here. */
  priorInspectionCount: number;
}

export interface LicensingSystemService {
  readonly source: string;
  getLicenseStatus(licenseNumber: string): Promise<LicenseStatus | null>;
}

/** Local implementation: reads the facilities already synchronized into this DB. */
class SeededFacilityDirectory implements FacilityDirectoryService {
  readonly source = "seeded-fixture";

  async listFacilities(): Promise<FacilityRecord[]> {
    const rows = await prisma.facility.findMany({ orderBy: { name: "asc" } });
    return rows.map((f) => ({
      externalId: f.externalId ?? f.id,
      name: f.name,
      licenseNumber: f.licenseNumber,
      addressLine1: f.addressLine1,
      city: f.city,
      state: f.state,
      zip: f.zip,
      county: f.county,
      bedCapacity: f.bedCapacity,
      licenseeName: f.licenseeName,
      isActive: f.isActive,
    }));
  }

  async findByLicenseNumber(licenseNumber: string): Promise<FacilityRecord | null> {
    const all = await this.listFacilities();
    return all.find((f) => f.licenseNumber === licenseNumber) ?? null;
  }
}

class SeededLicensingSystem implements LicensingSystemService {
  readonly source = "seeded-fixture";

  async getLicenseStatus(licenseNumber: string): Promise<LicenseStatus | null> {
    const facility = await prisma.facility.findUnique({ where: { licenseNumber } });
    if (!facility) return null;

    const priorInspectionCount = await prisma.inspection.count({
      where: { facilityId: facility.id, status: "CLOSED" },
    });

    return {
      licenseNumber,
      status: facility.isActive ? "ACTIVE" : "CLOSED",
      effectiveDate: facility.licensedAt,
      priorInspectionCount,
    };
  }
}

export function facilityDirectory(): FacilityDirectoryService {
  return new SeededFacilityDirectory();
}

export function licensingSystem(): LicensingSystemService {
  return new SeededLicensingSystem();
}
