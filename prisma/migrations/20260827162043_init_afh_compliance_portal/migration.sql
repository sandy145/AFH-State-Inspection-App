-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PROVIDER', 'INSPECTOR', 'FIELD_MANAGER', 'RCS_ADMIN', 'IDR_MANAGER');

-- CreateEnum
CREATE TYPE "RegulationSource" AS ENUM ('WAC', 'RCW', 'POLICY');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('INITIAL_LICENSING', 'FULL_LICENSING', 'COMPLAINT_INVESTIGATION', 'FOLLOW_UP', 'MONITORING');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'EVIDENCE_REVIEW', 'PENDING_REPORT', 'REPORT_ISSUED', 'CORRECTION_PERIOD', 'FOLLOW_UP', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceMethod" AS ENUM ('US_MAIL', 'CERTIFIED_MAIL', 'HAND_DELIVERY', 'EMAIL', 'FAX', 'PORTAL_ONLY');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'POTENTIAL_FINDING', 'EVIDENCE_REQUESTED', 'PROVIDER_RESPONDED', 'UNDER_INSPECTOR_REVIEW', 'ADDITIONAL_INFO_REQUESTED', 'RESOLVED_NO_VIOLATION', 'RESOLVED_CONSULTATION', 'CITATION_ISSUED', 'CORRECTION_PENDING', 'CORRECTION_UNDER_REVIEW', 'CORRECTED_BACK_IN_COMPLIANCE', 'IDR_PENDING', 'MODIFIED_FOLLOWING_IDR', 'CITATION_RESCINDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PotentialOutcome" AS ENUM ('UNDETERMINED', 'LIKELY_NO_VIOLATION', 'POSSIBLE_CONSULTATION', 'POSSIBLE_CITATION');

-- CreateEnum
CREATE TYPE "EvidenceRequestStatus" AS ENUM ('OPEN', 'PARTIALLY_RESPONDED', 'RESPONDED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUESTED', 'SATISFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'REVIEWED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'INSUFFICIENT', 'WRONG_DOCUMENT', 'ADDITIONAL_INFO_REQUIRED', 'SUPERSEDED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SCAN_FAILED');

-- CreateEnum
CREATE TYPE "CitationStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CORRECTION_PENDING', 'CORRECTION_UNDER_REVIEW', 'CORRECTED', 'RESCINDED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NOT_CLASSIFIED', 'LOW', 'MODERATE', 'HIGH', 'IMMEDIATE_JEOPARDY');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('NOT_SUBMITTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUESTED', 'ACCEPTED', 'CORRECTION_VERIFICATION_REQUIRED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "CorrectionKind" AS ENUM ('ATTESTATION_OF_CORRECTION', 'PLAN_OF_CORRECTION');

-- CreateEnum
CREATE TYPE "IDRMethod" AS ENUM ('TRADITIONAL', 'PANEL', 'DESK_REVIEW', 'TELEPHONE', 'FACE_TO_FACE');

-- CreateEnum
CREATE TYPE "IDRStatus" AS ENUM ('REQUESTED', 'ACCEPTED_FOR_REVIEW', 'SCHEDULED', 'UNDER_REVIEW', 'COMPLETED_UPHELD', 'COMPLETED_MODIFIED', 'COMPLETED_RESCINDED', 'WITHDRAWN', 'DENIED_UNTIMELY');

-- CreateEnum
CREATE TYPE "FollowUpMethod" AS ENUM ('DOCUMENT_REVIEW', 'TELEPHONE_VERIFICATION', 'ON_SITE');

-- CreateEnum
CREATE TYPE "FollowUpResult" AS ENUM ('PENDING', 'BACK_IN_COMPLIANCE', 'NOT_BACK_IN_COMPLIANCE', 'ADDITIONAL_DEFICIENCIES');

-- CreateEnum
CREATE TYPE "DeadlineUnit" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS');

-- CreateEnum
CREATE TYPE "DeadlineTrigger" AS ENUM ('INSPECTION_REPORT_RECEIVED', 'CITATION_SERVED', 'CITATION_RECEIVED', 'EVIDENCE_REQUESTED', 'CORRECTION_SUBMITTED', 'IDR_REQUESTED', 'FOLLOW_UP_SCHEDULED');

-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('OPEN', 'MET', 'MISSED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('EVIDENCE_REQUESTED', 'EVIDENCE_DUE_SOON', 'EVIDENCE_OVERDUE', 'EVIDENCE_UPLOADED', 'EVIDENCE_REVIEWED', 'ADDITIONAL_INFO_REQUESTED', 'CITATION_ISSUED', 'CORRECTION_DUE_SOON', 'CORRECTION_OVERDUE', 'CORRECTION_ACCEPTED', 'FOLLOW_UP_SCHEDULED', 'IDR_DEADLINE_APPROACHING', 'IDR_STATUS_CHANGED', 'CASE_CLOSED', 'NEW_MESSAGE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "externalId" TEXT,
    "passwordHash" TEXT,
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "regionId" UUID,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "externalId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'WA',
    "zip" TEXT NOT NULL,
    "county" TEXT,
    "phone" TEXT,
    "bedCapacity" INTEGER NOT NULL DEFAULT 6,
    "licenseeName" TEXT,
    "licensedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "regionId" UUID,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityUser" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'Provider',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" UUID NOT NULL,
    "citation" TEXT NOT NULL,
    "source" "RegulationSource" NOT NULL DEFAULT 'WAC',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "inspectorGuidance" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" UUID NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "facilityId" UUID NOT NULL,
    "regionId" UUID,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "leadInspectorId" UUID,
    "fieldManagerId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastDataCollectionAt" TIMESTAMP(3),
    "exitConferenceAt" TIMESTAMP(3),
    "reportIssuedAt" TIMESTAMP(3),
    "reportReceivedAt" TIMESTAMP(3),
    "reportServiceMethod" "ServiceMethod",
    "portalNotifiedAt" TIMESTAMP(3),
    "responsiblePerson" TEXT,
    "closedAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionAssignment" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignmentRole" TEXT NOT NULL DEFAULT 'SUPPORT',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "inspectionId" UUID NOT NULL,
    "regulationId" UUID,
    "title" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "residentIdentifier" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
    "potentialOutcome" "PotentialOutcome" NOT NULL DEFAULT 'UNDETERMINED',
    "evidenceDueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRequest" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "findingId" UUID NOT NULL,
    "regulationId" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "itemsRequested" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "allowMultipleFiles" BOOLEAN NOT NULL DEFAULT true,
    "explanationRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "EvidenceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedById" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSubmission" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "evidenceRequestId" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerExplanation" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "supersededById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "documentVersionId" UUID NOT NULL,
    "documentType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceReview" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "outcome" "ReviewOutcome" NOT NULL,
    "reason" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "findingReference" TEXT NOT NULL,
    "evidenceRequestTitle" TEXT NOT NULL,
    "fileNames" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "inspectionId" UUID,
    "facilityId" UUID,
    "title" TEXT NOT NULL,
    "documentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "previousVersionId" UUID,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingMessage" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "regulationId" UUID,
    "issuedById" UUID NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceRelied" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerAcknowledgedAt" TIMESTAMP(3),
    "providerAcknowledgedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" UUID NOT NULL,
    "citationNumber" TEXT NOT NULL,
    "findingId" UUID NOT NULL,
    "regulationId" UUID,
    "deficientPractice" TEXT NOT NULL,
    "inspectorAnalysis" TEXT NOT NULL,
    "evidenceRelied" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'NOT_CLASSIFIED',
    "status" "CitationStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" UUID,
    "citedAt" TIMESTAMP(3),
    "serviceMethod" "ServiceMethod",
    "servedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "correctionDueAt" TIMESTAMP(3),
    "attestationRequired" BOOLEAN NOT NULL DEFAULT true,
    "planOfCorrectionRequired" BOOLEAN NOT NULL DEFAULT false,
    "rescindedAt" TIMESTAMP(3),
    "rescissionReason" TEXT,
    "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
    "overrideJustification" TEXT,
    "overrideById" UUID,
    "overrideAt" TIMESTAMP(3),
    "overrideApprovedById" UUID,
    "overrideApprovedAt" TIMESTAMP(3),
    "overridePendingApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" UUID NOT NULL,
    "citationId" UUID NOT NULL,
    "kind" "CorrectionKind" NOT NULL DEFAULT 'ATTESTATION_OF_CORRECTION',
    "status" "CorrectionStatus" NOT NULL DEFAULT 'DRAFT',
    "howCorrected" TEXT,
    "correctionCompletedAt" TIMESTAMP(3),
    "howMaintained" TEXT,
    "responsiblePerson" TEXT,
    "signatureName" TEXT,
    "signatureTitle" TEXT,
    "signedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionEvidence" (
    "id" UUID NOT NULL,
    "correctionId" UUID NOT NULL,
    "documentVersionId" UUID NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IDRRequest" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "citationId" UUID NOT NULL,
    "requestedById" UUID,
    "reason" TEXT NOT NULL,
    "requestedMethod" "IDRMethod" NOT NULL DEFAULT 'DESK_REVIEW',
    "status" "IDRStatus" NOT NULL DEFAULT 'REQUESTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionSummary" TEXT,
    "supportingEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IDRRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "citationId" UUID,
    "method" "FollowUpMethod" NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "assignedToId" UUID,
    "completedAt" TIMESTAMP(3),
    "result" "FollowUpResult" NOT NULL DEFAULT 'PENDING',
    "backInCompliance" BOOLEAN,
    "evidenceReviewed" TEXT,
    "additionalDeficiencies" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineRule" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "DeadlineTrigger" NOT NULL,
    "offset" INTEGER NOT NULL,
    "unit" "DeadlineUnit" NOT NULL DEFAULT 'CALENDAR_DAYS',
    "authority" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" UUID NOT NULL,
    "ruleId" UUID,
    "ruleKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "DeadlineStatus" NOT NULL DEFAULT 'OPEN',
    "satisfiedAt" TIMESTAMP(3),
    "computedFrom" TIMESTAMP(3) NOT NULL,
    "computedFromEvent" "DeadlineTrigger" NOT NULL,
    "note" TEXT,
    "inspectionId" UUID,
    "findingId" UUID,
    "evidenceRequestId" UUID,
    "citationId" UUID,
    "idrRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "inspectionId" UUID,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "findingId" UUID,
    "actorId" UUID,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "caseNumber" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfiguration" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_regionId_idx" ON "User"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_externalId_key" ON "Organization"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_licenseNumber_key" ON "Facility"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_externalId_key" ON "Facility"("externalId");

-- CreateIndex
CREATE INDEX "Facility_regionId_idx" ON "Facility"("regionId");

-- CreateIndex
CREATE INDEX "Facility_organizationId_idx" ON "Facility"("organizationId");

-- CreateIndex
CREATE INDEX "FacilityUser_userId_idx" ON "FacilityUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityUser_facilityId_userId_key" ON "FacilityUser"("facilityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_citation_key" ON "Regulation"("citation");

-- CreateIndex
CREATE INDEX "Regulation_source_idx" ON "Regulation"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_caseNumber_key" ON "Inspection"("caseNumber");

-- CreateIndex
CREATE INDEX "Inspection_facilityId_idx" ON "Inspection"("facilityId");

-- CreateIndex
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");

-- CreateIndex
CREATE INDEX "Inspection_leadInspectorId_idx" ON "Inspection"("leadInspectorId");

-- CreateIndex
CREATE INDEX "Inspection_regionId_idx" ON "Inspection"("regionId");

-- CreateIndex
CREATE INDEX "InspectionAssignment_userId_idx" ON "InspectionAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionAssignment_inspectionId_userId_assignmentRole_key" ON "InspectionAssignment"("inspectionId", "userId", "assignmentRole");

-- CreateIndex
CREATE INDEX "Finding_status_idx" ON "Finding"("status");

-- CreateIndex
CREATE INDEX "Finding_regulationId_idx" ON "Finding"("regulationId");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_inspectionId_reference_key" ON "Finding"("inspectionId", "reference");

-- CreateIndex
CREATE INDEX "EvidenceRequest_status_idx" ON "EvidenceRequest"("status");

-- CreateIndex
CREATE INDEX "EvidenceRequest_dueAt_idx" ON "EvidenceRequest"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequest_findingId_reference_key" ON "EvidenceRequest"("findingId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSubmission_reference_key" ON "EvidenceSubmission"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSubmission_supersededById_key" ON "EvidenceSubmission"("supersededById");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_findingId_idx" ON "EvidenceSubmission"("findingId");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_evidenceRequestId_idx" ON "EvidenceSubmission"("evidenceRequestId");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_status_idx" ON "EvidenceSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_submissionId_documentVersionId_key" ON "EvidenceFile"("submissionId", "documentVersionId");

-- CreateIndex
CREATE INDEX "EvidenceReview_submissionId_idx" ON "EvidenceReview"("submissionId");

-- CreateIndex
CREATE INDEX "EvidenceReview_reviewerId_idx" ON "EvidenceReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_submissionId_key" ON "Receipt"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Document_inspectionId_idx" ON "Document"("inspectionId");

-- CreateIndex
CREATE INDEX "Document_facilityId_idx" ON "Document"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_previousVersionId_key" ON "DocumentVersion"("previousVersionId");

-- CreateIndex
CREATE INDEX "DocumentVersion_checksum_idx" ON "DocumentVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "FindingMessage_findingId_idx" ON "FindingMessage"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_findingId_key" ON "Consultation"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Citation_citationNumber_key" ON "Citation"("citationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Citation_findingId_key" ON "Citation"("findingId");

-- CreateIndex
CREATE INDEX "Citation_status_idx" ON "Citation"("status");

-- CreateIndex
CREATE INDEX "Correction_citationId_idx" ON "Correction"("citationId");

-- CreateIndex
CREATE INDEX "Correction_status_idx" ON "Correction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CorrectionEvidence_correctionId_documentVersionId_key" ON "CorrectionEvidence"("correctionId", "documentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "IDRRequest_reference_key" ON "IDRRequest"("reference");

-- CreateIndex
CREATE INDEX "IDRRequest_citationId_idx" ON "IDRRequest"("citationId");

-- CreateIndex
CREATE INDEX "IDRRequest_status_idx" ON "IDRRequest"("status");

-- CreateIndex
CREATE INDEX "FollowUp_inspectionId_idx" ON "FollowUp"("inspectionId");

-- CreateIndex
CREATE INDEX "FollowUp_assignedToId_idx" ON "FollowUp"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "DeadlineRule_key_key" ON "DeadlineRule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_name_key" ON "Holiday"("date", "name");

-- CreateIndex
CREATE INDEX "Deadline_dueAt_idx" ON "Deadline"("dueAt");

-- CreateIndex
CREATE INDEX "Deadline_status_idx" ON "Deadline"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_event_idx" ON "Notification"("event");

-- CreateIndex
CREATE INDEX "TimelineEvent_inspectionId_occurredAt_idx" ON "TimelineEvent"("inspectionId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfiguration_key_key" ON "SystemConfiguration"("key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityUser" ADD CONSTRAINT "FacilityUser_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityUser" ADD CONSTRAINT "FacilityUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_leadInspectorId_fkey" FOREIGN KEY ("leadInspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_fieldManagerId_fkey" FOREIGN KEY ("fieldManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAssignment" ADD CONSTRAINT "InspectionAssignment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAssignment" ADD CONSTRAINT "InspectionAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequest" ADD CONSTRAINT "EvidenceRequest_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequest" ADD CONSTRAINT "EvidenceRequest_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_evidenceRequestId_fkey" FOREIGN KEY ("evidenceRequestId") REFERENCES "EvidenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "EvidenceSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "EvidenceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "EvidenceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "EvidenceSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingMessage" ADD CONSTRAINT "FindingMessage_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingMessage" ADD CONSTRAINT "FindingMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_overrideApprovedById_fkey" FOREIGN KEY ("overrideApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionEvidence" ADD CONSTRAINT "CorrectionEvidence_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "Correction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionEvidence" ADD CONSTRAINT "CorrectionEvidence_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IDRRequest" ADD CONSTRAINT "IDRRequest_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DeadlineRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_evidenceRequestId_fkey" FOREIGN KEY ("evidenceRequestId") REFERENCES "EvidenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_idrRequestId_fkey" FOREIGN KEY ("idrRequestId") REFERENCES "IDRRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
