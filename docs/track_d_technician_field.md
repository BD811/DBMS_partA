# ServiceIQ — Track D: Technician Field View
# You own: everything the technician sees and does on their phone.
# Read master_context.md first.

---

## Your deliverables

1. Technician job list (mobile-first)
2. Job detail page with equipment history
3. Status transition buttons (en route, on site, etc.)
4. Checklist form from job_type checklist_schema
5. Photo upload (before and after)
6. Customer signature capture
7. Parts recording with entitlement check
8. Job close flow
9. Offline queue for status events synced when back online
10. Technician profile page

---

## The core principle of this track

Everything must work on a phone with a poor connection. Design mobile-first. Every tap target is at least 44x44px. Every form field is large. Every action gives immediate feedback even if the network is slow.

The offline queue is the difference between a product technicians actually use and one they abandon after day one. A technician closing a job in a basement with no signal must not lose their work.

---

## Pages (all under `/tech/`)

| Route | What it does |
|---|---|
| `/tech` | My assigned jobs, grouped by today / upcoming / done |
| `/tech/jobs/[id]` | Job detail: equipment info, history, status, checklist |
| `/tech/jobs/[id]/close` | Full close flow: checklist, photos, parts, signature |
| `/tech/profile` | Skills, certifications, rating summary |

These are under the `(tech)` layout built by Track A. That layout is mobile-first and has no sidebar.

---

## My jobs list — `/tech/page.tsx`

```typescript
const { data: assignments } = await supabase
  .from('job_assignment')
  .select(`
    assignment_id, status, slot_start, slot_end, is_lead,
    job(
      job_id, job_no, scheduled_start, response_due, resolution_due, breached,
      current_state_id,
      workflow_state(code, label, is_terminal),
      ticket(priority, fault_description,
        site(name, address, contact_phone,
          party(name))),
      equipment_unit(serial_no, warranty_end,
        product_model(name, brand_name))
    )
  `)
  .eq('person_id', person.person_id)
  .not('job.workflow_state.is_terminal', 'is', true)
  .order('slot_start', { ascending: true })
```

Group into three sections:
- **Today**: `slot_start` date = today
- **Upcoming**: `slot_start` date > today
- **Unscheduled**: `slot_start` is null and status = 'offered'

Each job item shows: job number, customer name, site address, equipment model, priority badge, current status, scheduled time.

"Accept" button (if status = 'offered'):
```typescript
await supabase.from('job_assignment')
  .update({ status: 'accepted', responded_at: new Date().toISOString() })
  .eq('assignment_id', assignmentId)
```

"Decline" button sets `status = 'declined'` and does NOT transition the job (the dispatcher re-assigns).

---

## Job detail — `/tech/jobs/[id]/page.tsx`

Three tabs sized for thumbs:

**Details tab**
- Equipment: model, brand, serial no, warranty end date
- Site: name, address, a "Call Site Contact" button (`tel:` link with the contact phone)
- Customer: name
- Fault description from ticket
- Equipment service history: last 5 tickets on this unit
  ```typescript
  supabase.from('ticket')
    .select('ticket_no, reported_at, fault_description, status')
    .eq('unit_id', unitId)
    .order('reported_at', { ascending: false })
    .limit(5)
  ```

**Status tab**
- Current status label (large text)
- Action buttons based on `allowed_next` from the current workflow state:
  ```typescript
  // Map state codes to button labels
  const BUTTON_LABELS: Record<string, string> = {
    en_route:       'I am on my way',
    on_site:        'I have arrived',
    awaiting_parts: 'Waiting for parts',
    closed:         'Close job',
  }
  ```
- Each button calls `POST /api/jobs/[id]/transition` (built by Track C)
- Get GPS before calling transition:
  ```typescript
  navigator.geolocation.getCurrentPosition((pos) => {
    transition(jobId, 'en_route', pos.coords.latitude, pos.coords.longitude)
  })
  ```

**Notes tab**
- Textarea for technician notes, saved with debounce:
  ```typescript
  supabase.from('job').update({ technician_notes: value }).eq('job_id', jobId)
  ```

---

## Close flow — `/tech/jobs/[id]/close/page.tsx`

This is a multi-step form on one page. All steps must be completed before submit. Show a progress indicator at the top.

**Step 1: Checklist**

Read `job_type.checklist_schema` (JSONB array):
```typescript
// checklist_schema shape:
// [{ key: 'filter_cleaned', label: 'Filter cleaned', type: 'bool' },
//  { key: 'gas_pressure', label: 'Gas pressure (bar)', type: 'number' },
//  { key: 'fault_found', label: 'Fault description', type: 'text' }]
```

Render each item dynamically. Store answers in local state as `{ [key]: value }`.

**Step 2: Photos**

Two upload zones: "Before" and "After". Both required if `job_type.requires_signature = true`.

```typescript
async function uploadPhoto(file: File, kind: 'before_photo' | 'after_photo') {
  const supabase = createClient()
  const path = `${org.org_id}/${jobId}/${kind}-${Date.now()}.jpg`
  const { data } = await supabase.storage
    .from('job-attachments')
    .upload(path, file, { upsert: true })

  const { data: { publicUrl } } = supabase.storage
    .from('job-attachments')
    .getPublicUrl(path)

  // Append to job's attachment_urls array
  await supabase.rpc('fn_append_attachment', { p_job_id: jobId, p_url: publicUrl })
  // Or: fetch job, push to array, update
}
```

Already included in schema.sql (do not add again):
```sql
CREATE OR REPLACE FUNCTION fn_append_attachment(p_job_id UUID, p_url TEXT)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE job SET attachment_urls = array_append(attachment_urls, p_url)
  WHERE job_id = p_job_id;
$$;
```

Show a camera icon button that opens the file input with `accept="image/*" capture="environment"` on mobile.

**Step 3: Parts used**

List of parts consumed. For each part:
- Part name (searchable select from `part` table for this org)
- Quantity (number input)
- Entitlement check button: calls `fn_check_entitlement` and shows result inline
- Is chargeable: auto-set based on entitlement, but technician can override

```typescript
async function checkEntitlement(partId: string) {
  const { data: part } = await supabase
    .from('part').select('name').eq('part_id', partId).single()

  const { data } = await supabase.rpc('fn_check_entitlement', {
    p_unit_id: job.unit_id,
    p_part_category: part.name,
    p_scope: 'part_category'
  })
  // data = { covered: true, source: 'amc', explanation: '...' }
  return data
}
```

**Step 4: Customer signature**

Use a canvas element. The technician hands the phone to the customer.

```typescript
// src/components/tech/signature-pad.tsx
import { useRef, useEffect } from 'react'

export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Draw on touch/mouse events
  // "Done" button calls canvas.toDataURL('image/png') and passes to onCapture
  // "Clear" button clears the canvas
}
```

Upload the signature the same way as photos with kind = 'signature', store URL in `job.signature_url`.

**Submit (Close Job)**

```typescript
async function closeJob() {
  const supabase = createClient()

  // 1. Save checklist answers
  await supabase.from('job').update({ checklist_answers: checklistAnswers }).eq('job_id', jobId)

  // 2. Save parts
  for (const part of partsUsed) {
    const entitlement = await checkEntitlement(part.partId)
    await supabase.from('job_part').insert({
      job_id: jobId,
      part_id: part.partId,
      quantity: part.quantity,
      unit_price: part.unitPrice,
      is_chargeable: !entitlement.covered,
      coverage_source: entitlement.source,
      coverage_explanation: entitlement.explanation,
    })
  }

  // 3. Transition to 'closed'
  await fetch(`/api/jobs/${jobId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStateCode: 'closed' }),
    headers: { 'Content-Type': 'application/json' }
  })

  // 3b. Mark this technician's assignment completed. This feeds the performance stats
  // and frees the time slot in the double-booking constraint.
  await supabase.from('job_assignment')
    .update({ status: 'completed' })
    .eq('job_id', jobId).eq('person_id', person.person_id).eq('status', 'accepted')

  // 4. Update linked PM visit
  if (job.pm_visit_id) {
    await supabase.from('pm_visit').update({ status: 'done' }).eq('pm_visit_id', job.pm_visit_id)
  }

  // 5. Prompt for customer rating (0-5 stars)
  setStep('rating')
}

async function submitRating(rating: number, feedback: string) {
  await supabase.from('job')
    .update({ customer_rating: rating, customer_feedback: feedback })
    .eq('job_id', jobId)
  router.push('/tech')
}
```

---

## Offline queue

When a status transition fails because of no network, queue it locally.

```typescript
// src/lib/offline-queue.ts
interface QueuedAction {
  id: string
  type: 'transition' | 'checklist' | 'part'
  payload: any
  createdAt: number
}

const QUEUE_KEY = 'serviceiq_offline_queue'

export function enqueue(action: Omit<QueuedAction, 'id' | 'createdAt'>) {
  const queue = getQueue()
  queue.push({ ...action, id: crypto.randomUUID(), createdAt: Date.now() })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function getQueue(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch { return [] }
}

export function dequeue(id: string) {
  const queue = getQueue().filter(a => a.id !== id)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}
```

On page load and on `online` event, flush the queue:
```typescript
useEffect(() => {
  async function flush() {
    const queue = getQueue()
    for (const action of queue) {
      try {
        if (action.type === 'transition') {
          await fetch(`/api/jobs/${action.payload.jobId}/transition`, {
            method: 'POST',
            body: JSON.stringify({ ...action.payload, syncedOffline: true }),
            headers: { 'Content-Type': 'application/json' }
          })
          dequeue(action.id)
        }
      } catch { /* retry on next online event */ }
    }
  }
  window.addEventListener('online', flush)
  flush()
  return () => window.removeEventListener('online', flush)
}, [])
```

Show a persistent banner when `navigator.onLine === false`: "You are offline. Actions will sync when connected."

---

## Technician profile — `/tech/profile`

```typescript
// Skills with certification status
const { data: skills } = await supabase
  .from('person_skill')
  .select('*, skill(name, requires_certification)')
  .eq('person_id', person.person_id)

// Performance from materialized view
const { data: perf } = await supabase
  .from('v_technician_performance')
  .select('*')
  .eq('person_id', person.person_id)
  .single()
```

Show: jobs completed, average rating (star display), SLA breaches, completion rate.

Certification cards: skill name, level, cert number, expiry date. Red badge if `certified_until < today`.

---

## What you expose to other tracks

- Signature pad component (Track E may use it in customer portal)
- Photo upload pattern (documented above)
- Offline queue utility (Track E references this approach)

---

## What you do NOT build

- Dispatch board (Track C)
- Contract details (Track B)
- WhatsApp notifications triggered by job close (Track E handles these by listening to `job_status_event` via Supabase realtime)
