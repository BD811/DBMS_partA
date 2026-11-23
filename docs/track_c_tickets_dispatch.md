# ServiceIQ — Track C: Tickets, Dispatch, Jobs
# You own: ticket intake, dispatch board, job creation, assignment, SLA clock display.
# Read master_context.md first.

---

## Your deliverables

1. Ticket list and creation form
2. Ticket detail page
3. Dispatch board (Kanban by job status)
4. Job detail page
5. Assignment modal (pick technician + time slot)
6. `POST /api/jobs/[id]/assign` route
7. `POST /api/jobs/[id]/transition` route
8. SLA due time display with breach detection
9. PM visit scheduler (create a job from a PM visit)

---

## Pages to build

| Route | What it does |
|---|---|
| `/tickets` | List all tickets for this org |
| `/tickets/new` | Raise a new ticket |
| `/tickets/[id]` | Ticket detail with linked jobs |
| `/dispatch` | Live board showing all jobs by status |
| `/jobs` | Table view of all jobs |
| `/jobs/[id]` | Job detail with assignment, parts, status events |

---

## Ticket creation — `/tickets/new`

Form fields:
- **Source**: phone, whatsapp, email, portal, walk_in (select)
- **Priority**: P1, P2, P3 (radio, default P2)
- **Customer**: search parties by name (use a combobox, query `party` table)
- **Site**: filtered by selected customer
- **Equipment unit**: filtered by selected site (show serial no + model name)
- **Fault description**: textarea

On submit:
```typescript
const { data: ticket } = await supabase
  .from('ticket')
  .insert({
    org_id: org.org_id,
    site_id, unit_id,
    source, priority, fault_description
  })
  .select()
  .single()

// Auto-create first job of type 'breakdown'
const { data: jobType } = await supabase
  .from('job_type')
  .select('job_type_id')
  .eq('org_id', org.org_id)
  .eq('code', 'breakdown')
  .single()

const { data: initialState } = await supabase
  .from('workflow_state')
  .select('state_id')
  .eq('job_type_id', jobType.job_type_id)
  .eq('is_initial', true)
  .single()

await supabase.from('job').insert({
  org_id: org.org_id,
  ticket_id: ticket.ticket_id,
  unit_id,
  job_type_id: jobType.job_type_id,
  current_state_id: initialState.state_id,
})

// Update ticket status
await supabase.from('ticket').update({ status: 'in_progress' }).eq('ticket_id', ticket.ticket_id)
```

Redirect to `/dispatch` after submit. Track E sends the WhatsApp notification.

---

## Ticket list — `/tickets`

```typescript
const { data: tickets } = await supabase
  .from('ticket')
  .select(`
    ticket_id, ticket_no, priority, status, source, reported_at, fault_description,
    site(name, party(name)),
    equipment_unit(serial_no, product_model(name))
  `)
  .eq('org_id', org.org_id)
  .order('reported_at', { ascending: false })
```

Table columns: Ticket No, Priority, Customer, Site, Equipment, Source, Status, Reported At.

Priority badge: P1 = red, P2 = amber, P3 = grey.

Filter bar: status (all / open / in_progress / awaiting_parts / closed), priority.

---

## Dispatch board — `/dispatch`

This is the centrepiece of the product. It is a Kanban board grouped by job status, with realtime updates.

**Columns**: Open, Assigned, En Route, On Site, Awaiting Parts. (Closed jobs are not shown by default.)

```typescript
// Fetch all non-terminal jobs
const { data: jobs } = await supabase
  .from('job')
  .select(`
    job_id, job_no, created_at, scheduled_start, response_due, resolution_due, breached,
    current_state_id,
    workflow_state(code, label),
    ticket(priority, fault_description,
      site(name, party(name)),
      equipment_unit(serial_no, product_model(name))),
    job_assignment(
      person_id, is_lead, status,
      person(full_name))
  `)
  .eq('org_id', org.org_id)
  .is('workflow_state.is_terminal', false)  -- filter in JS instead if this join filter is awkward
  .order('created_at', { ascending: false })
```

Group jobs by `workflow_state.code` client-side.

**Realtime**: Subscribe to changes on the `job` table for this org. On any change, refetch (or use TanStack Query's `invalidateQueries`).

```typescript
// In use-realtime.ts
useEffect(() => {
  const channel = supabase
    .channel('dispatch')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'job',
      filter: `org_id=eq.${org.org_id}`
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', org.org_id] })
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [org.org_id])
```

### Job card — `src/components/dispatch/job-card.tsx`

Show per card:
- Job number
- Priority badge (from ticket)
- Customer name and site
- Equipment model and serial
- Assigned technician (or "Unassigned" in red)
- SLA timer: if `resolution_due` is set, show "Due in 2h 15m" or "BREACHED" in red
- "Assign" button (opens assignment modal)

SLA timer:
```typescript
function SlaTimer({ resolutionDue }: { resolutionDue: string | null }) {
  if (!resolutionDue) return null
  const diff = new Date(resolutionDue).getTime() - Date.now()
  const breached = diff < 0
  const hours = Math.abs(Math.floor(diff / 3600000))
  const mins  = Math.abs(Math.floor((diff % 3600000) / 60000))
  return (
    <span className={breached ? 'text-red-500 font-bold' : 'text-muted-foreground text-xs'}>
      {breached ? `BREACHED ${hours}h ${mins}m ago` : `Due in ${hours}h ${mins}m`}
    </span>
  )
}
```

---

## Assignment modal — `src/components/jobs/assignment-modal.tsx`

Opens when dispatcher clicks "Assign" on a job card.

Fields:
- Technician: dropdown of active technicians in the org
- Date: date picker (default today)
- Start time / End time: time pickers
- Is lead: checkbox (default true for first assignment)

On submit, call `POST /api/jobs/[id]/assign`.

### `src/app/api/jobs/[id]/assign/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { personId, slotStart, slotEnd, isLead } = await req.json()

  // The exclusion constraint on job_assignment will reject
  // a double-booking automatically. Catch the error and return it.
  const { error } = await supabase.from('job_assignment').insert({
    job_id: params.id,
    person_id: personId,
    slot_start: slotStart,
    slot_end: slotEnd,
    is_lead: isLead,
    status: 'offered',
  })

  if (error) {
    // Postgres exclusion violation: error.code === '23P01'
    if (error.code === '23P01') {
      return NextResponse.json(
        { error: 'This technician already has an accepted job in that time slot.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Transition job to 'assigned' state. Call the shared helper directly.
  // Do NOT fetch() your own /api route from server code: relative URLs fail on the server.
  await transitionJob(supabase, params.id, 'assigned')

  return NextResponse.json({ ok: true })
}
```

---

## Job transition — `src/app/api/jobs/[id]/transition/route.ts`

Every status change MUST go through here so `job_status_event` is always written.

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { toStateCode, geoLat, geoLng, syncedOffline } = await req.json()

  // Get current job and its state
  const { data: job } = await supabase
    .from('job')
    .select('current_state_id, job_type_id, org_id, actual_start, workflow_state(code, allowed_next)')
    .eq('job_id', params.id)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const currentState = job.workflow_state as any
  if (!currentState.allowed_next.includes(toStateCode)) {
    return NextResponse.json(
      { error: `Cannot transition from ${currentState.code} to ${toStateCode}` },
      { status: 400 }
    )
  }

  // Find the target state
  const { data: toState } = await supabase
    .from('workflow_state')
    .select('state_id, stops_sla_clock, is_terminal')
    .eq('job_type_id', job.job_type_id)
    .eq('code', toStateCode)
    .single()

  // Get current person
  const { data: { user } } = await supabase.auth.getUser()
  const { data: person } = await supabase
    .from('person').select('person_id').eq('auth_user_id', user!.id).single()

  // Write status event
  await supabase.from('job_status_event').insert({
    job_id: params.id,
    from_state_id: job.current_state_id,
    to_state_id: toState!.state_id,
    changed_by: person.person_id,
    geo_lat: geoLat,
    geo_lng: geoLng,
    synced_offline: syncedOffline ?? false,
  })

  // Update job state
  const updates: any = { current_state_id: toState!.state_id }
  if (toStateCode === 'on_site' && !job.actual_start) updates.actual_start = new Date().toISOString()
  if (toState!.is_terminal) updates.actual_end = new Date().toISOString()

  await supabase.from('job').update(updates).eq('job_id', params.id)

  return NextResponse.json({ ok: true })
}
```

---

## Shared helper (important)

Move the body of the transition route into `src/lib/jobs.ts` as `transitionJob(supabase, jobId, toStateCode, meta?)`. The route handler then only authenticates and calls it, and the assign route calls it directly. Track D (browser code) can keep calling the HTTP route.

## SLA clock setup

When a job is created from a ticket, set `response_due` and `resolution_due` based on the contract's SLA targets and the ticket priority.

```typescript
async function setSlaDeadlines(jobId: string, unitId: string, priority: string) {
  // Get active contract SLA targets for this unit
  const { data: contract } = await supabase
    .from('contract')
    .select('sla_targets')
    .eq('status', 'active')
    .filter('contract_equipment.unit_id', 'eq', unitId)
    .single()

  const targets = contract?.sla_targets ?? { P1_response_mins: 60, P2_response_mins: 240, P3_response_mins: 480 }
  const responseKey = `${priority}_response_mins`
  const responseMins = targets[responseKey] ?? 240

  const now = new Date()
  const responseDue = new Date(now.getTime() + responseMins * 60000)
  const resolutionDue = new Date(now.getTime() + responseMins * 4 * 60000) // 4x response = resolution

  await supabase.from('job')
    .update({ response_due: responseDue.toISOString(), resolution_due: resolutionDue.toISOString() })
    .eq('job_id', jobId)
}
```

Call this immediately after creating a job.

---

## PM visit scheduler

On the `/contracts/[id]` PM tab (built by Track B), add a "Schedule" button next to each pending PM visit. This navigates to or opens a modal on the dispatch board that pre-fills the job creation form for a PM job type.

The API call:
```typescript
await supabase.from('job').insert({
  org_id: org.org_id,
  pm_visit_id: pmVisitId,
  unit_id: unitId,   // contract_equipment.unit_id of that PM visit
  job_type_id: pmJobTypeId,
  current_state_id: scheduledStateId,
  scheduled_start: chosenDate,
})

// Update the PM visit
await supabase.from('pm_visit').update({ status: 'scheduled' }).eq('pm_visit_id', pmVisitId)
```

---

## What you expose to other tracks

- `POST /api/jobs/[id]/transition` used by Track D (technician status changes)
- `POST /api/jobs/[id]/assign` used by Track D (technician self-accepts)
- Job card component pattern used as a reference by Track D

---

## What you do NOT build

- Equipment and contract pages (Track B)
- Technician mobile close flow (Track D)
- WhatsApp notifications on ticket creation (Track E, but trigger it by calling a shared helper)
