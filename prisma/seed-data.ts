/**
 * Reference data for the seed: regulations, deadline rules, holidays and policy
 * configuration.
 *
 * The WAC and RCW entries below are summaries written for this prototype so the
 * demo has realistic references to hang findings on. They are NOT authoritative
 * text — the authoritative source is the published Washington Administrative
 * Code and Revised Code of Washington. In a production system this table is
 * maintained by RCS through the admin screens, or synchronized from an
 * authoritative source.
 */
export const REGULATIONS = [
  {
    citation: "388-76-10506",
    source: "WAC" as const,
    title: "Residency agreement — Required information",
    summary:
      "The adult family home must have a residency agreement with each resident that contains the information required by rule.",
    inspectorGuidance:
      "Confirm the agreement in effect on the date of inspection contains each required element. Ask for the signed agreement before concluding an element is absent.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10506",
  },
  {
    citation: "388-76-10530",
    source: "WAC" as const,
    title: "Resident rights — Notification",
    summary: "The home must notify each resident of their rights in a form the resident can understand.",
    inspectorGuidance: "Look for evidence of notification, not only the presence of a form.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10530",
  },
  {
    citation: "388-76-10405",
    source: "WAC" as const,
    title: "Negotiated care plan",
    summary: "A negotiated care plan must be developed with the resident and kept current.",
    inspectorGuidance: "Check the date of the most recent review against any change in condition.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10405",
  },
  {
    citation: "388-76-10430",
    source: "WAC" as const,
    title: "Medication — Administration and records",
    summary: "Medications must be administered and documented as ordered by the practitioner.",
    inspectorGuidance:
      "Compare the medication administration record against current practitioner orders for the period under review.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10430",
  },
  {
    citation: "388-76-10160",
    source: "WAC" as const,
    title: "Caregiver qualifications and training",
    summary: "Caregivers must meet training and qualification requirements before providing care.",
    inspectorGuidance: "Verify training completion dates precede the first date of resident care.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10160",
  },
  {
    citation: "388-76-10175",
    source: "WAC" as const,
    title: "Background checks",
    summary: "The home must obtain background checks before an individual has unsupervised access to residents.",
    inspectorGuidance: "Check the result date against the start of unsupervised access.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10175",
  },
  {
    citation: "388-76-10870",
    source: "WAC" as const,
    title: "Food service and nutrition",
    summary: "The home must provide meals meeting residents' nutritional needs and documented preferences.",
    inspectorGuidance: "Compare served meals against the planned menu and any documented dietary requirement.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10870",
  },
  {
    citation: "388-76-10920",
    source: "WAC" as const,
    title: "Inspection and investigation reports",
    summary: "The department provides the home with a written report of an inspection or investigation.",
    inspectorGuidance: "Record the date issued, the method of service and the date received.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10920",
  },
  {
    citation: "388-76-10930",
    source: "WAC" as const,
    title: "Plan or attestation of correction",
    summary:
      "The home must submit a plan of correction or attestation of correction for cited deficiencies within the required time frame.",
    inspectorGuidance: "The correction period runs from the date the home received the report.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10930",
  },
  {
    citation: "388-76-10990",
    source: "WAC" as const,
    title: "Informal dispute resolution",
    summary: "A home may dispute a cited deficiency through informal dispute resolution.",
    inspectorGuidance: "IDR does not by itself relieve the home of correction obligations.",
    url: "https://app.leg.wa.gov/WAC/default.aspx?cite=388-76-10990",
  },
  {
    citation: "70.128.070",
    source: "RCW" as const,
    title: "Inspections",
    summary: "The department inspects adult family homes as provided by statute.",
    inspectorGuidance: null,
    url: "https://app.leg.wa.gov/RCW/default.aspx?cite=70.128.070",
  },
  {
    citation: "70.128.090",
    source: "RCW" as const,
    title: "Inspection reports",
    summary: "Statutory requirements for inspection reports.",
    inspectorGuidance: null,
    url: "https://app.leg.wa.gov/RCW/default.aspx?cite=70.128.090",
  },
  {
    citation: "70.128.167",
    source: "RCW" as const,
    title: "Informal dispute resolution",
    summary: "Statutory basis for informal dispute resolution of cited deficiencies.",
    inspectorGuidance: null,
    url: "https://app.leg.wa.gov/RCW/default.aspx?cite=70.128.167",
  },
];

/**
 * Deadline rules.
 *
 * IMPORTANT: the offsets below are PLACEHOLDER VALUES for the prototype. They
 * are not a statement of what Washington law requires. They live in the database
 * precisely so RCS can set the real values through Admin → Deadline
 * configuration without a code change, and every change is audited.
 */
export const DEADLINE_RULES = [
  {
    key: "EVIDENCE_REQUEST_DUE",
    label: "Evidence due",
    description:
      "Default time a provider has to respond to an evidence request when the inspector does not set a date. Operational, not statutory.",
    trigger: "EVIDENCE_REQUESTED" as const,
    offset: 7,
    unit: "CALENDAR_DAYS" as const,
    authority: null,
  },
  {
    key: "ATTESTATION_OF_CORRECTION_DUE",
    label: "Attestation of Correction due",
    description:
      "PLACEHOLDER VALUE. Time to return correction documentation, measured from the date the home received the report. Confirm against WAC 388-76-10930 and current RCS policy before use.",
    trigger: "INSPECTION_REPORT_RECEIVED" as const,
    offset: 45,
    unit: "CALENDAR_DAYS" as const,
    authority: "WAC 388-76-10930",
  },
  {
    key: "IDR_REQUEST_DUE",
    label: "IDR request due",
    description:
      "PLACEHOLDER VALUE. Time to request informal dispute resolution after receiving the written finding. Confirm against WAC 388-76-10990 / RCW 70.128.167 before use.",
    trigger: "CITATION_RECEIVED" as const,
    offset: 10,
    unit: "WORKING_DAYS" as const,
    authority: "WAC 388-76-10990",
  },
  {
    key: "FOLLOW_UP_DUE",
    label: "Follow-up verification due",
    description: "Operational target for completing follow-up verification after a correction is accepted.",
    trigger: "CORRECTION_SUBMITTED" as const,
    offset: 30,
    unit: "CALENDAR_DAYS" as const,
    authority: null,
  },
];

/** Washington State observed holidays for the demo window. */
export const HOLIDAYS_2026 = [
  { name: "New Year's Day", date: "2026-01-01" },
  { name: "Martin Luther King Jr. Day", date: "2026-01-19" },
  { name: "Presidents' Day", date: "2026-02-16" },
  { name: "Memorial Day", date: "2026-05-25" },
  { name: "Juneteenth", date: "2026-06-19" },
  { name: "Independence Day (observed)", date: "2026-07-03" },
  { name: "Labor Day", date: "2026-09-07" },
  { name: "Veterans Day", date: "2026-11-11" },
  { name: "Thanksgiving Day", date: "2026-11-26" },
  { name: "Native American Heritage Day", date: "2026-11-27" },
  { name: "Christmas Day", date: "2026-12-25" },
];

export const SYSTEM_CONFIGURATION = [
  {
    key: "override.requires_field_manager_approval",
    value: "true",
    valueType: "boolean",
    label: "Field Manager approval for evidence-guard overrides",
    description:
      "When on, an inspector who finalizes a citation over unreviewed provider evidence needs a Field Manager to countersign.",
    category: "policy",
  },
  {
    key: "deadline.due_soon_days",
    value: "3",
    valueType: "integer",
    label: "Days before a deadline counts as due soon",
    description: "Display threshold only. Does not change any regulatory deadline.",
    category: "display",
  },
  {
    key: "review.target_days",
    value: "3",
    valueType: "integer",
    label: "Evidence review target (days)",
    description:
      "Operational target used by the Field Manager dashboard to flag ageing evidence. Not a performance score.",
    category: "operations",
  },
];
