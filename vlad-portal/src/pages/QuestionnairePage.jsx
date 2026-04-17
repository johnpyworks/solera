import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ChevronLeft, ChevronRight, Printer, CheckCircle } from "lucide-react";

// ── Step definitions ─────────────────────────────────────────
const STEPS = [
  "Personal Information",
  "Beneficiary & Custodian",
  "Financial & Medical",
  "Family History",
  "Children",
  "Review & Submit",
];

const EMPTY_FORM = {
  // Step 1 — Personal
  legal_name: "",
  email: "",
  dob: "",
  phone: "",
  dl_number: "",
  dl_expiry: "",
  address: "",
  tenure: "",
  ssn: "",
  citizenship: "",
  green_card: "",
  country_of_birth: "",
  occupation: "",
  employer: "",
  work_address: "",
  // Step 2 — Beneficiary
  ben1_name: "",
  ben1_relationship: "",
  ben1_dob: "",
  ben2_name: "",
  ben2_relationship: "",
  ben2_dob: "",
  custodian_name: "",
  custodian_relationship: "",
  custodian_phone: "",
  custodian_dob: "",
  // Step 3 — Financial & Medical
  gross_income: "",
  net_worth: "",
  doctor_name: "",
  doctor_phone: "",
  last_visit_date: "",
  last_visit_reason: "",
  smoke: "",
  hazardous: "",
  height: "",
  weight: "",
  health_issues: "",
  exam_instructions: "",
  // Step 4 — Family History
  father_age: "",
  father_living: "",
  father_cause: "",
  father_cancer: false,
  father_heart: false,
  father_stroke: false,
  father_diabetes: false,
  mother_age: "",
  mother_living: "",
  mother_cause: "",
  mother_cancer: false,
  mother_heart: false,
  mother_stroke: false,
  mother_diabetes: false,
  siblings_age: "",
  siblings_living: "",
  siblings_cause: "",
  siblings_cancer: false,
  siblings_heart: false,
  siblings_stroke: false,
  siblings_diabetes: false,
  // Step 5 — Children
  child1_name: "",
  child1_height: "",
  child1_weight: "",
  child2_name: "",
  child2_height: "",
  child2_weight: "",
  child3_name: "",
  child3_height: "",
  child3_weight: "",
  children_doctor_name: "",
  children_doctor_phone: "",
  children_last_visit: "",
  children_last_reason: "",
};

// ── Step Indicator ───────────────────────────────────────────
function StepIndicator({ current, total }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="step-indicator-item">
          <div className={`step-dot ${i < current ? "done" : i === current ? "active" : ""}`}>
            {i < current ? <CheckCircle size={14} /> : i + 1}
          </div>
          {i < total - 1 && <div className={`step-line ${i < current ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Field helpers ────────────────────────────────────────────
function QField({ label, name, form, onChange, type = "text", placeholder = "" }) {
  return (
    <div className="q-field">
      <label className="q-label">{label}</label>
      <input
        className="q-input"
        type={type}
        name={name}
        value={form[name] || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

function QSelect({ label, name, form, onChange, options }) {
  return (
    <div className="q-field">
      <label className="q-label">{label}</label>
      <select className="q-input" name={name} value={form[name] || ""} onChange={(e) => onChange(name, e.target.value)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function QTextarea({ label, name, form, onChange, placeholder = "" }) {
  return (
    <div className="q-field q-field-full">
      <label className="q-label">{label}</label>
      <textarea
        className="q-input q-textarea"
        name={name}
        value={form[name] || ""}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

function QCheckbox({ label, name, form, onChange }) {
  return (
    <label className="q-check-label">
      <input
        type="checkbox"
        name={name}
        checked={!!form[name]}
        onChange={(e) => onChange(name, e.target.checked)}
      />
      {label}
    </label>
  );
}

// ── Step 1: Personal Information ─────────────────────────────
function PersonalStep({ form, onChange }) {
  return (
    <div className="q-step-body">
      <div className="q-field-grid">
        <QField label="Legal Full Name" name="legal_name" form={form} onChange={onChange} placeholder="As on government ID" />
        <QField label="Email Address" name="email" form={form} onChange={onChange} type="email" />
        <QField label="Date of Birth" name="dob" form={form} onChange={onChange} type="date" />
        <QField label="Phone Number" name="phone" form={form} onChange={onChange} placeholder="(555) 555-0000" />
        <QField label="Driver's License #" name="dl_number" form={form} onChange={onChange} />
        <QField label="DL Expiry Date" name="dl_expiry" form={form} onChange={onChange} type="date" />
        <QField label="SSN (last 4 or full)" name="ssn" form={form} onChange={onChange} placeholder="XXX-XX-XXXX" />
        <QSelect label="Citizenship Status" name="citizenship" form={form} onChange={onChange}
          options={["US Citizen", "Permanent Resident", "Visa Holder", "Other"]} />
        <QField label="Green Card # (if applicable)" name="green_card" form={form} onChange={onChange} />
        <QField label="Country of Birth" name="country_of_birth" form={form} onChange={onChange} />
        <QField label="Occupation" name="occupation" form={form} onChange={onChange} />
        <QField label="Employer" name="employer" form={form} onChange={onChange} />
      </div>
      <div className="q-field-grid q-field-grid-1">
        <QField label="Home Address" name="address" form={form} onChange={onChange} placeholder="Street, City, State, ZIP" />
        <QField label="Years at Current Address" name="tenure" form={form} onChange={onChange} placeholder="e.g. 3" />
        <QField label="Work Address" name="work_address" form={form} onChange={onChange} placeholder="Street, City, State, ZIP" />
      </div>
    </div>
  );
}

// ── Step 2: Beneficiary & Custodian ──────────────────────────
function BeneficiaryStep({ form, onChange }) {
  return (
    <div className="q-step-body">
      <div className="q-section-label">Primary Beneficiary</div>
      <div className="q-field-grid">
        <QField label="Full Name" name="ben1_name" form={form} onChange={onChange} />
        <QField label="Relationship" name="ben1_relationship" form={form} onChange={onChange} placeholder="e.g. Spouse" />
        <QField label="Date of Birth" name="ben1_dob" form={form} onChange={onChange} type="date" />
      </div>
      <div className="q-section-label">Secondary Beneficiary</div>
      <div className="q-field-grid">
        <QField label="Full Name" name="ben2_name" form={form} onChange={onChange} />
        <QField label="Relationship" name="ben2_relationship" form={form} onChange={onChange} placeholder="e.g. Child" />
        <QField label="Date of Birth" name="ben2_dob" form={form} onChange={onChange} type="date" />
      </div>
      <div className="q-section-label">Custodian (for Life Insurance)</div>
      <div className="q-field-grid">
        <QField label="Full Name" name="custodian_name" form={form} onChange={onChange} />
        <QField label="Relationship" name="custodian_relationship" form={form} onChange={onChange} />
        <QField label="Phone" name="custodian_phone" form={form} onChange={onChange} />
        <QField label="Date of Birth" name="custodian_dob" form={form} onChange={onChange} type="date" />
      </div>
    </div>
  );
}

// ── Step 3: Financial & Medical ───────────────────────────────
function FinancialStep({ form, onChange }) {
  return (
    <div className="q-step-body">
      <div className="q-section-label">Financial</div>
      <div className="q-field-grid">
        <QField label="Gross Annual Income" name="gross_income" form={form} onChange={onChange} placeholder="$" />
        <QField label="Estimated Net Worth" name="net_worth" form={form} onChange={onChange} placeholder="$" />
      </div>
      <div className="q-section-label">Medical — Primary Physician</div>
      <div className="q-field-grid">
        <QField label="Doctor Name" name="doctor_name" form={form} onChange={onChange} />
        <QField label="Doctor Phone" name="doctor_phone" form={form} onChange={onChange} />
        <QField label="Date of Last Visit" name="last_visit_date" form={form} onChange={onChange} type="date" />
        <QField label="Reason for Last Visit" name="last_visit_reason" form={form} onChange={onChange} />
      </div>
      <div className="q-section-label">Health Details</div>
      <div className="q-field-grid">
        <QSelect label="Do you smoke or use tobacco?" name="smoke" form={form} onChange={onChange} options={["No", "Yes — current", "Yes — former (quit date)"]} />
        <QSelect label="Hazardous activities or hobbies?" name="hazardous" form={form} onChange={onChange} options={["No", "Yes"]} />
        <QField label="Height" name="height" form={form} onChange={onChange} placeholder={`e.g. 5'10"`} />
        <QField label="Weight (lbs)" name="weight" form={form} onChange={onChange} placeholder="e.g. 170" />
      </div>
      <QTextarea label="Any diagnosed health conditions, medications, or surgeries?" name="health_issues" form={form} onChange={onChange} placeholder="List any relevant health history..." />
      <QTextarea label="Exam Instructions / Notes" name="exam_instructions" form={form} onChange={onChange} placeholder="Anything the advisor should know before scheduling a medical exam..." />
    </div>
  );
}

// ── Step 4: Family History ────────────────────────────────────
function FamilyRow({ label, prefix, form, onChange }) {
  return (
    <div className="q-family-row">
      <div className="q-family-label">{label}</div>
      <div className="q-family-fields">
        <QField label="Current age / Age at death" name={`${prefix}_age`} form={form} onChange={onChange} placeholder="e.g. 72" />
        <QSelect label="Living?" name={`${prefix}_living`} form={form} onChange={onChange} options={["Yes", "No"]} />
        <QField label="Cause of death (if deceased)" name={`${prefix}_cause`} form={form} onChange={onChange} />
      </div>
      <div className="q-family-conditions">
        <span className="q-conditions-label">Conditions:</span>
        <QCheckbox label="Cancer" name={`${prefix}_cancer`} form={form} onChange={onChange} />
        <QCheckbox label="Heart Disease" name={`${prefix}_heart`} form={form} onChange={onChange} />
        <QCheckbox label="Stroke" name={`${prefix}_stroke`} form={form} onChange={onChange} />
        <QCheckbox label="Diabetes" name={`${prefix}_diabetes`} form={form} onChange={onChange} />
      </div>
    </div>
  );
}

function FamilyStep({ form, onChange }) {
  return (
    <div className="q-step-body">
      <p className="q-hint">Please provide information about your immediate family's health history.</p>
      <FamilyRow label="Father" prefix="father" form={form} onChange={onChange} />
      <FamilyRow label="Mother" prefix="mother" form={form} onChange={onChange} />
      <FamilyRow label="Siblings" prefix="siblings" form={form} onChange={onChange} />
    </div>
  );
}

// ── Step 5: Children ──────────────────────────────────────────
function ChildrenStep({ form, onChange }) {
  return (
    <div className="q-step-body">
      <div className="q-section-label">Children</div>
      {[1, 2, 3].map((n) => (
        <div key={n} className="q-field-grid q-child-row">
          <QField label={`Child ${n} — Full Name`} name={`child${n}_name`} form={form} onChange={onChange} />
          <QField label="Height" name={`child${n}_height`} form={form} onChange={onChange} placeholder={`e.g. 4'6"`} />
          <QField label="Weight (lbs)" name={`child${n}_weight`} form={form} onChange={onChange} placeholder="e.g. 85" />
        </div>
      ))}
      <div className="q-section-label">Children's Physician (Life Insurance)</div>
      <div className="q-field-grid">
        <QField label="Doctor Name" name="children_doctor_name" form={form} onChange={onChange} />
        <QField label="Doctor Phone" name="children_doctor_phone" form={form} onChange={onChange} />
        <QField label="Date of Last Visit" name="children_last_visit" form={form} onChange={onChange} type="date" />
        <QField label="Reason for Last Visit" name="children_last_reason" form={form} onChange={onChange} />
      </div>
    </div>
  );
}

// ── Step 6: Review ────────────────────────────────────────────
function ReviewField({ label, value }) {
  if (!value && value !== false) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="review-field">
      <span className="review-label">{label}</span>
      <span className="review-value">{display}</span>
    </div>
  );
}

function ReviewStep({ form }) {
  const sections = [
    {
      title: "Personal Information",
      fields: [
        ["Legal Name", form.legal_name], ["Email", form.email], ["Date of Birth", form.dob],
        ["Phone", form.phone], ["Driver's License #", form.dl_number], ["DL Expiry", form.dl_expiry],
        ["SSN", form.ssn], ["Citizenship", form.citizenship], ["Green Card #", form.green_card],
        ["Country of Birth", form.country_of_birth], ["Occupation", form.occupation],
        ["Employer", form.employer], ["Home Address", form.address], ["Years at Address", form.tenure],
        ["Work Address", form.work_address],
      ],
    },
    {
      title: "Beneficiary & Custodian",
      fields: [
        ["Primary Beneficiary", form.ben1_name], ["Relationship", form.ben1_relationship], ["DOB", form.ben1_dob],
        ["Secondary Beneficiary", form.ben2_name], ["Relationship", form.ben2_relationship], ["DOB", form.ben2_dob],
        ["Custodian Name", form.custodian_name], ["Custodian Relationship", form.custodian_relationship],
        ["Custodian Phone", form.custodian_phone], ["Custodian DOB", form.custodian_dob],
      ],
    },
    {
      title: "Financial & Medical",
      fields: [
        ["Gross Income", form.gross_income], ["Net Worth", form.net_worth],
        ["Doctor", form.doctor_name], ["Doctor Phone", form.doctor_phone],
        ["Last Visit", form.last_visit_date], ["Visit Reason", form.last_visit_reason],
        ["Tobacco Use", form.smoke], ["Hazardous Activities", form.hazardous],
        ["Height", form.height], ["Weight", form.weight],
        ["Health Conditions", form.health_issues], ["Exam Notes", form.exam_instructions],
      ],
    },
    {
      title: "Family History",
      fields: [
        ["Father Age", form.father_age], ["Father Living", form.father_living], ["Father Cause", form.father_cause],
        ["Father: Cancer", form.father_cancer], ["Father: Heart Disease", form.father_heart],
        ["Father: Stroke", form.father_stroke], ["Father: Diabetes", form.father_diabetes],
        ["Mother Age", form.mother_age], ["Mother Living", form.mother_living], ["Mother Cause", form.mother_cause],
        ["Mother: Cancer", form.mother_cancer], ["Mother: Heart Disease", form.mother_heart],
        ["Mother: Stroke", form.mother_stroke], ["Mother: Diabetes", form.mother_diabetes],
        ["Siblings Age", form.siblings_age], ["Siblings Living", form.siblings_living], ["Siblings Cause", form.siblings_cause],
        ["Siblings: Cancer", form.siblings_cancer], ["Siblings: Heart Disease", form.siblings_heart],
        ["Siblings: Stroke", form.siblings_stroke], ["Siblings: Diabetes", form.siblings_diabetes],
      ],
    },
    {
      title: "Children",
      fields: [
        ["Child 1", form.child1_name], ["Height", form.child1_height], ["Weight", form.child1_weight],
        ["Child 2", form.child2_name], ["Height", form.child2_height], ["Weight", form.child2_weight],
        ["Child 3", form.child3_name], ["Height", form.child3_height], ["Weight", form.child3_weight],
        ["Children's Doctor", form.children_doctor_name], ["Doctor Phone", form.children_doctor_phone],
        ["Last Visit", form.children_last_visit], ["Visit Reason", form.children_last_reason],
      ],
    },
  ];

  return (
    <div className="q-step-body">
      <p className="q-hint">Please review your answers before submitting. You can go back to edit any section.</p>
      {sections.map((sec) => (
        <div key={sec.title} className="review-section">
          <div className="review-section-title">{sec.title}</div>
          {sec.fields.map(([label, val]) => (
            <ReviewField key={label} label={label} value={val} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Success Screen ────────────────────────────────────────────
function SuccessScreen({ clientName }) {
  return (
    <div className="q-success">
      <CheckCircle size={52} className="q-success-icon" />
      <h2>Thank you, {clientName}!</h2>
      <p>Your questionnaire has been submitted successfully. Your advisor will review your responses and reach out to discuss next steps.</p>
      <p className="q-success-sub">You may now close this window.</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function QuestionnairePage() {
  const { token } = useParams();
  const { getTokenInfo, submitQuestionnaire } = useApp();
  const tokenInfo = getTokenInfo(token);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(tokenInfo?.status === "submitted");

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit() {
    submitQuestionnaire(token, form);
    setSubmitted(true);
  }

  if (!tokenInfo) {
    return (
      <div className="questionnaire-page">
        <div className="q-header">
          <span className="q-logo">Solera Financial Advisory</span>
        </div>
        <div className="q-invalid">
          <h2>This link is invalid or has expired.</h2>
          <p>Please contact your advisor for a new questionnaire link.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="questionnaire-page">
        <div className="q-header">
          <span className="q-logo">Solera Financial Advisory</span>
        </div>
        <div className="q-container">
          <SuccessScreen clientName={tokenInfo.client_name} />
        </div>
      </div>
    );
  }

  const EMPTY = EMPTY_FORM;
  const printSteps = [
    { title: STEPS[0], el: <PersonalStep form={EMPTY} onChange={() => {}} /> },
    { title: STEPS[1], el: <BeneficiaryStep form={EMPTY} onChange={() => {}} /> },
    { title: STEPS[2], el: <FinancialStep form={EMPTY} onChange={() => {}} /> },
    { title: STEPS[3], el: <FamilyStep form={EMPTY} onChange={() => {}} /> },
    { title: STEPS[4], el: <ChildrenStep form={EMPTY} onChange={() => {}} /> },
  ];

  return (
    <div className="questionnaire-page">
      <div className="q-header">
        <span className="q-logo">Solera Financial Advisory</span>
        <button className="q-print-btn" onClick={() => window.print()} title="Print blank form">
          <Printer size={15} /> Print Blank Form
        </button>
      </div>

      {/* Screen: multi-step interactive form */}
      <div className="q-container q-screen-only">
        <div className="q-title-row">
          <h1 className="q-title">Client Questionnaire</h1>
          <p className="q-subtitle">Hello, <strong>{tokenInfo.client_name}</strong>. Please complete all sections.</p>
        </div>

        <StepIndicator current={step} total={STEPS.length} />

        <div className="q-form-section">
          <div className="q-step-header">
            <span className="q-step-num">Step {step + 1} of {STEPS.length}</span>
            <h2 className="q-step-title">{STEPS[step]}</h2>
          </div>
          {step === 0 && <PersonalStep form={form} onChange={handleChange} />}
          {step === 1 && <BeneficiaryStep form={form} onChange={handleChange} />}
          {step === 2 && <FinancialStep form={form} onChange={handleChange} />}
          {step === 3 && <FamilyStep form={form} onChange={handleChange} />}
          {step === 4 && <ChildrenStep form={form} onChange={handleChange} />}
          {step === 5 && <ReviewStep form={form} />}
        </div>

        <div className="q-nav-btns">
          {step > 0 && (
            <button className="q-btn q-btn-back" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button className="q-btn q-btn-next" onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button className="q-btn q-btn-submit" onClick={handleSubmit}>
              Submit Questionnaire
            </button>
          )}
        </div>
      </div>

      {/* Print: all sections at once with blank fields */}
      <div className="q-container q-print-only">
        <div className="q-title-row">
          <h1 className="q-title">Client Questionnaire — Solera Financial Advisory</h1>
          <p className="q-subtitle">Please fill out all sections in ink and return to your advisor.</p>
        </div>
        {printSteps.map((s, i) => (
          <div key={i} className="q-form-section" style={{ marginBottom: 24 }}>
            <div className="q-step-header">
              <span className="q-step-num">Section {i + 1} of {printSteps.length}</span>
              <h2 className="q-step-title">{s.title}</h2>
            </div>
            {s.el}
          </div>
        ))}
      </div>
    </div>
  );
}
