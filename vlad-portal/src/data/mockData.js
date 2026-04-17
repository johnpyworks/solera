// Mock data for Phase 1 — replaces Wealthbox API and Outlook Calendar

export const clients = [
  {
    id: "c1",
    name: "Sarah Chen",
    email: "sarah.chen@email.com",
    phone: "(415) 555-0192",
    language_tag: null,
    meeting_stage: "LEAP Process",
    wealthbox_id: "WB-10041",
    assigned_advisor: "vlad",
    anniversary_date: "2025-03-15",
    last_contact_date: "2026-03-23",
    notes: [
      {
        id: "n1",
        text: "Self-employed, tech industry. Strong savings, no life insurance. Very engaged in the planning process.",
        author: "vlad",
        created_at: "2026-03-15T09:00:00",
        type: "advisor_note",
      },
      {
        id: "n2",
        text: "LEAP session completed March 25. Very receptive to recommendations — agreed on term life $1M + DI + Roth. Proceeding to implementation.",
        author: "system",
        created_at: "2026-03-25T11:30:00",
        type: "ai_summary",
      },
    ],
    files: [
      {
        id: "f1",
        name: "sarah_chen_leap_notes_mar25.txt",
        type: "transcript",
        size_kb: 8,
        uploaded_at: "2026-03-25T11:00:00",
        uploaded_by: "vlad",
        meeting_id: "m2",
      },
    ],
  },
  {
    id: "c2",
    name: "Dmitri Volkov",
    email: "d.volkov@email.com",
    phone: "(503) 555-0234",
    language_tag: "ru",
    meeting_stage: "Implementation",
    wealthbox_id: "WB-10055",
    assigned_advisor: "vlad",
    anniversary_date: "2025-01-20",
    last_contact_date: "2026-03-10",
    notes: [
      {
        id: "n3",
        text: "Russian-speaking. DO NOT auto-call. Contact Vlad first before any outreach. Prefers communication in Russian.",
        author: "vlad",
        created_at: "2026-01-20T10:00:00",
        type: "advisor_note",
      },
    ],
    files: [
      {
        id: "f2",
        name: "volkov_implementation_checklist.docx",
        type: "document",
        size_kb: 22,
        uploaded_at: "2026-03-10T14:00:00",
        uploaded_by: "vlad",
        meeting_id: null,
      },
    ],
  },
  {
    id: "c3",
    name: "Marcus Webb",
    email: "mwebb@email.com",
    phone: "(206) 555-0178",
    language_tag: null,
    meeting_stage: "Solera Heartbeat",
    wealthbox_id: "WB-10012",
    assigned_advisor: "vlad",
    anniversary_date: "2024-04-05",
    last_contact_date: "2026-02-15",
    household_id: "h1",
    is_primary: true,
    notes: [
      {
        id: "n4",
        text: "Annual review due. Both retired. High AUM. Review portfolio performance and update beneficiaries.",
        author: "vlad",
        created_at: "2026-02-15T09:00:00",
        type: "advisor_note",
      },
      {
        id: "n5",
        text: "AR packet prepared. Portfolio up 8.2% YTD. No major life changes reported. Review scheduled April 2.",
        author: "system",
        created_at: "2026-04-01T08:00:00",
        type: "ai_summary",
      },
    ],
    files: [
      {
        id: "f3",
        name: "webb_policy_brief_2026.pdf",
        type: "document",
        size_kb: 145,
        uploaded_at: "2026-02-15T10:00:00",
        uploaded_by: "vlad",
        meeting_id: null,
      },
      {
        id: "f4",
        name: "webb_investment_summary_q1.pdf",
        type: "document",
        size_kb: 98,
        uploaded_at: "2026-04-01T08:30:00",
        uploaded_by: "system",
        meeting_id: null,
      },
    ],
  },
  {
    id: "c4",
    name: "Priya Nair",
    email: "priya.nair@email.com",
    phone: "(650) 555-0311",
    language_tag: null,
    meeting_stage: "Discovery",
    wealthbox_id: "WB-10088",
    assigned_advisor: "vlad",
    anniversary_date: null,
    last_contact_date: "2026-03-28",
    notes: [
      {
        id: "n6",
        text: "New prospect. Discovery call completed March 28. Very interested in Leap Model. Goals: retire by 55, home purchase in 3 years, life insurance for aging parents.",
        author: "vlad",
        created_at: "2026-03-28T16:00:00",
        type: "advisor_note",
      },
      {
        id: "n7",
        text: "Discovery meeting processed. 2 email drafts generated and queued for approval — follow-up and internal summary.",
        author: "system",
        created_at: "2026-03-28T16:31:00",
        type: "ai_summary",
      },
    ],
    files: [
      {
        id: "f5",
        name: "priya_discovery_mar28.txt",
        type: "transcript",
        size_kb: 14,
        uploaded_at: "2026-03-28T16:00:00",
        uploaded_by: "vlad",
        meeting_id: "m1",
      },
    ],
  },
  {
    id: "c5",
    name: "James Thornton",
    email: "jthornton@email.com",
    phone: "(425) 555-0456",
    language_tag: null,
    meeting_stage: "Implementation",
    wealthbox_id: "WB-10033",
    assigned_advisor: "vlad",
    anniversary_date: "2025-06-12",
    last_contact_date: "2026-03-20",
    household_id: "h2",
    is_primary: true,
    notes: [
      {
        id: "n8",
        text: "Life insurance application in underwriting. Waiting on Penn Mutual exam results. Follow up if no response by April 10.",
        author: "vlad",
        created_at: "2026-03-20T11:00:00",
        type: "advisor_note",
      },
    ],
    files: [
      {
        id: "f6",
        name: "thornton_penn_mutual_application.pdf",
        type: "form",
        size_kb: 67,
        uploaded_at: "2026-03-20T11:30:00",
        uploaded_by: "vlad",
        meeting_id: null,
      },
    ],
  },
];

export const meetings = [
  {
    id: "m1",
    client_id: "c4",
    meeting_type: "Discovery",
    date: "2026-03-28T14:00:00",
    duration_min: 75,
    transcript_text:
      "Vlad introduced Solera process. Priya is 38, software engineer, single. Goals: retirement by 55, buy a home in 3 years, life insurance for aging parents. Currently has 401k at work, no life insurance, $45k in savings. Concerned about market volatility. Very interested in Leap Model approach. Scheduled LEAP meeting for April 7.",
    leap_notes_text: null,
    processed: false,
  },
  {
    id: "m2",
    client_id: "c1",
    meeting_type: "LEAP Process",
    date: "2026-03-25T10:00:00",
    duration_min: 90,
    transcript_text: null,
    leap_notes_text:
      "LEAP recommendations for Sarah: 1) Term life $1M 20yr via Penn Mutual. 2) Disability insurance — own occupation 60% income. 3) Max Roth IRA + taxable brokerage. 4) Emergency fund to 6 months. 5) Long-term care rider on life policy. Sarah responded positively, wants to proceed. Next: implementation meeting April 14.",
    processed: false,
  },
  {
    id: "m3",
    client_id: "c3",
    meeting_type: "Solera Heartbeat",
    date: "2026-04-02T11:00:00",
    duration_min: 60,
    transcript_text: null,
    leap_notes_text: null,
    processed: false,
  },
];

export const upcomingMeetings = [
  {
    id: "um1",
    client_id: "c4",
    client_name: "Priya Nair",
    meeting_type: "LEAP Process",
    date: "2026-04-07T10:00:00",
    duration_min: 90,
    location: "Zoom",
  },
  {
    id: "um2",
    client_id: "c1",
    client_name: "Sarah Chen",
    meeting_type: "Implementation",
    date: "2026-04-14T14:00:00",
    duration_min: 60,
    location: "Zoom",
  },
  {
    id: "um3",
    client_id: "c3",
    client_name: "Marcus Webb",
    meeting_type: "Solera Heartbeat",
    date: "2026-04-02T11:00:00",
    duration_min: 60,
    location: "In Person",
  },
  {
    id: "um4",
    client_id: "c2",
    client_name: "Dmitri Volkov",
    meeting_type: "Implementation",
    date: "2026-04-08T15:00:00",
    duration_min: 60,
    location: "Zoom",
  },
];

export const approvalItems = [
  {
    id: "a1",
    task_id: "t1",
    item_type: "email_followup",
    client_id: "c4",
    client_name: "Priya Nair",
    agent: "Scribe",
    urgency: "normal",
    status: "pending",
    created_at: "2026-03-28T16:30:00",
    draft_content: {
      subject: "Great Meeting Today — Your Next Steps with Solera",
      body: `Hi Priya,

Thank you so much for meeting with me today — it was wonderful learning more about your goals and where you're headed. Your vision of retiring by 55 and building long-term financial security for your family is absolutely achievable, and I'm excited to show you how.

Here's a quick summary of what we discussed and what comes next:

**Your Goals:**
- Retire by age 55
- Purchase a home within the next 3 years
- Establish life insurance protection for your parents

**Action Items for You Before Our Next Meeting (April 7):**
1. Gather your most recent 401(k) statement
2. Note your current monthly expenses (we'll use this for cash flow planning)
3. Think about your ideal retirement lifestyle — we'll build a vision together

Our next meeting is scheduled for **Tuesday, April 7 at 10:00 AM** (Zoom). I'll be presenting your personalized Solera strategy at that time.

Looking forward to it!

Warm regards,
Vlad Donets
Solera Financial Advisory`,
    },
  },
  {
    id: "a2",
    task_id: "t2",
    item_type: "email_summary",
    client_id: "c4",
    client_name: "Priya Nair",
    agent: "Scribe",
    urgency: "normal",
    status: "pending",
    created_at: "2026-03-28T16:31:00",
    draft_content: {
      subject: "[Internal] Discovery Notes — Priya Nair — Mar 28",
      body: `ADVISOR NOTES — DISCOVERY MEETING
Client: Priya Nair | Date: March 28, 2026 | Duration: 75 min

PROFILE:
- Age 38, software engineer, single
- Goals: retire at 55, home purchase in 3 yrs, life insurance for aging parents
- Assets: 401k (employer), $45k savings, no life insurance

KEY OBSERVATIONS:
- High savings discipline, low risk tolerance (concerned about volatility)
- Very receptive to Leap Model approach
- Life insurance is a clear emotional priority (parents)
- No current DI coverage — major gap given self-employment track

RECOMMENDED APPROACH FOR LEAP MEETING:
- Lead with protection (life + DI) before investment talk
- Frame home purchase as cash flow optimization challenge
- Max Roth + brokerage after protection layer established

FLAGS: None

NEXT MEETING: LEAP Process — April 7, 10:00 AM Zoom`,
    },
  },
  {
    id: "a3",
    task_id: "t3",
    item_type: "reminder_48hr",
    client_id: "c3",
    client_name: "Marcus Webb",
    agent: "Scheduler",
    urgency: "normal",
    status: "pending",
    created_at: "2026-03-31T08:00:00",
    draft_content: {
      subject: "Reminder: Your Solera Annual Review — April 2 at 11:00 AM",
      body: `Hi Marcus and Linda,

Just a friendly reminder that your Solera Annual Review is coming up on **Thursday, April 2 at 11:00 AM** at our office.

We'll be reviewing your portfolio performance, updating your financial picture, and discussing any new goals or life changes since we last met.

Please let us know if you need to reschedule.

See you Thursday!

Vlad Donets
Solera Financial Advisory`,
    },
  },
  {
    id: "a4",
    task_id: "t4",
    item_type: "wealthbox_task",
    client_id: "c1",
    client_name: "Sarah Chen",
    agent: "Service Agent",
    urgency: "normal",
    status: "pending",
    created_at: "2026-03-25T12:00:00",
    draft_content: {
      tasks: [
        {
          title: "Submit Penn Mutual Term Life Application — $1M / 20yr",
          due: "2026-04-03",
          priority: "high",
        },
        {
          title: "Order DI quote — own occupation 60% — Ameritas or Principal",
          due: "2026-04-03",
          priority: "high",
        },
        {
          title: "Schedule medical exam — coordinate with client",
          due: "2026-04-07",
          priority: "medium",
        },
        {
          title: "Open Roth IRA — confirm contribution eligibility",
          due: "2026-04-14",
          priority: "medium",
        },
        {
          title: "Update Wealthbox Opportunity: LEAP → Implementation",
          due: "2026-03-26",
          priority: "high",
        },
      ],
    },
  },
  {
    id: "a5",
    task_id: "t5",
    item_type: "reminder_48hr",
    client_id: "c2",
    client_name: "Dmitri Volkov",
    agent: "Scheduler",
    urgency: "normal",
    status: "pending",
    created_at: "2026-04-06T08:00:00",
    draft_content: {
      subject: "Reminder: Your Solera Meeting — April 8 at 3:00 PM",
      body: `Здравствуйте, Дмитрий,

Напоминаем, что ваша встреча запланирована на **вторник, 8 апреля в 15:00** по Zoom.

Если вам нужно перенести встречу, пожалуйста, свяжитесь с нами.

До встречи!

Vlad Donets
Solera Financial Advisory`,
      flag: "RUSSIAN-SPEAKING CLIENT — Review before sending. Vlad to approve personally.",
    },
  },
];

export const agentLogs = [
  {
    id: "log1",
    agent_id: 1,
    agent_name: "Scribe",
    task_id: "t1",
    action: "Generated 2 email drafts from Discovery meeting notes",
    client: "Priya Nair",
    client_id: "c4",
    status: "complete",
    timestamp: "2026-03-28T16:31:00",
  },
  {
    id: "log2",
    agent_id: 3,
    agent_name: "Service Agent",
    task_id: "t4",
    action: "Extracted 5 Wealthbox tasks from LEAP session notes",
    client: "Sarah Chen",
    client_id: "c1",
    status: "complete",
    timestamp: "2026-03-25T12:02:00",
  },
  {
    id: "log3",
    agent_id: 2,
    agent_name: "Scheduler",
    task_id: "t3",
    action: "Generated 48hr reminder for Annual Review",
    client: "Marcus & Linda Webb",
    client_id: "c3",
    status: "complete",
    timestamp: "2026-03-31T08:00:00",
  },
  {
    id: "log4",
    agent_id: 0,
    agent_name: "Orchestrator",
    task_id: "t5",
    action: 'Routed "Priya Discovery done" to Scribe agent',
    client: "Priya Nair",
    client_id: "c4",
    status: "complete",
    timestamp: "2026-03-28T16:29:00",
  },
  {
    id: "log5",
    agent_id: 2,
    agent_name: "Scheduler",
    task_id: "t6",
    action: "Generated 48hr reminder — Russian-speaking client flag applied",
    client: "Dmitri Volkov",
    client_id: "c2",
    status: "complete",
    timestamp: "2026-04-06T08:01:00",
  },
];

export const households = [
  { id: "h1", name: "Webb Household", primary_client_id: "c3" },
  { id: "h2", name: "Thornton Household", primary_client_id: "c5" },
];

export const householdMembers = [
  {
    id: "hm1",
    household_id: "h1",
    name: "Linda Webb",
    email: "lwebb@email.com",
    phone: "(206) 555-0179",
    relationship: "Spouse",
    notes: [
      {
        id: "hn1",
        text: "Linda is the more financially engaged of the two. Prefers email over calls.",
        author: "vlad",
        created_at: "2026-02-15T09:30:00",
      },
    ],
  },
  {
    id: "hm2",
    household_id: "h2",
    name: "Carol Thornton",
    email: "cthornton@email.com",
    phone: "(425) 555-0457",
    relationship: "Spouse",
    notes: [
      {
        id: "hn2",
        text: "Carol handles all the paperwork and follow-ups. James is the primary decision-maker.",
        author: "vlad",
        created_at: "2026-03-20T11:15:00",
      },
    ],
  },
];

export const questionnaireTokens = [
  {
    token: "tok_c4_1712000000000",
    client_id: "c4",
    client_name: "Priya Nair",
    client_email: "priya.nair@email.com",
    created_at: "2026-04-01T10:00:00",
    status: "submitted",
  },
  {
    token: "tok_demo",
    client_id: "c1",
    client_name: "Sarah Chen",
    client_email: "sarah.chen@email.com",
    created_at: "2026-04-15T10:00:00",
    status: "pending",
  },
];

export const weekStats = {
  week_of: "2026-03-30",
  meetings_completed: 3,
  meetings_scheduled: 4,
  capacity: 15,
  emails_approved: 5,
  emails_pending: 3,
  commission_close_week: false,
  friday_off: false,
};
