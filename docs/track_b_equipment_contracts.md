# ServiceIQ — Track B: Equipment and Contracts
# You own: equipment catalogue, AMC contracts, coverage rules, PM visits, renewal pipeline.
# Read master_context.md first.

---

## Your deliverables

1. Equipment category browser (tree view)
2. Product model catalog
3. Equipment unit management (add, edit, view history)
4. Contract creation and management
5. Coverage rules editor
6. PM visit list with status
7. Contract renewal pipeline page
8. `src/app/api/contracts/[id]/activate/route.ts`

---

## Pages to build

| Route | What it does |
|---|---|
| `/equipment` | List all units for this org, filterable by category, site, status |
| `/equipment/[id]` | Unit detail: model info, contract coverage, ticket history |
| `/contracts` | List all contracts with status and expiry badges |
| `/contracts/new` | Multi-step form to create a contract |
| `/contracts/[id]` | Contract detail: covered equipment, coverage rules, PM visits |
| `/renewals` | Renewal pipeline: contracts expiring in 90/60/30 days |

---

## Equipment category tree

Categories are self-referencing. Fetch the full tree with one recursive query:

```typescript
// Fetch flat list, then build tree client-side
const { data: categories } = await supabase
  .from('equipment_category')
  .select('category_id, name, parent_id, depth')
  .order('depth', { ascending: true })

function buildTree(flat: any[]) {
  const map: Record<string, any> = {}
  const roots: any[] = []
  for (const cat of flat) {
    map[cat.category_id] = { ...cat, children: [] }
  }
  for (const cat of flat) {
    if (cat.parent_id) {
      map[cat.parent_id]?.children.push(map[cat.category_id])
    } else {
      roots.push(map[cat.category_id])
    }
  }
  return roots
}
```

`src/components/equipment/category-tree.tsx`: Render the tree as a collapsible list. Clicking a category filters the unit list below it.

---

## Equipment unit list — `/equipment`

```typescript
// Fetch units with model and site in one query
const { data: units } = await supabase
  .from('equipment_unit')
  .select(`
    unit_id, serial_no, status, installed_on, warranty_end, attributes,
    product_model(name, brand_name, category_id,
      equipment_category(name)),
    site(name, address,
      party(name))
  `)
  .eq('org_id', org.org_id)
  .order('created_at', { ascending: false })
```

Table columns: Serial No, Model, Brand, Category, Site, Customer, Status, Warranty End.

Status badge colours: `installed` = green, `under_repair` = amber, `scrapped` = red, `in_stock` = blue.

---

## Equipment unit detail — `/equipment/[id]`

Three tabs:

**Overview**: Model specs from `product_model.spec` (render JSONB keys from `attribute_schema`), warranty status, current site and customer.

**Contract coverage**: Query active contracts covering this unit. Show the entitlement engine result. Call the RPC:
```typescript
const { data } = await supabase.rpc('fn_check_entitlement', {
  p_unit_id: unitId,
  p_part_category: 'compressor', // or whatever the user selects
  p_scope: 'part_category'
})
// data = { covered: true, source: 'amc', explanation: '...' }
```

**Ticket history**: `select * from ticket where unit_id = ? order by reported_at desc limit 20`.

---

## Contract creation — `/contracts/new`

Multi-step form. Use React state for steps, submit everything at the end.

**Step 1: Basic details**
- Customer (party select, type = 'customer')
- Contract number (auto-suggest: `AMC-{year}-{seq}`)
- Contract type (comprehensive / non_comprehensive / labour_only)
- Valid from / valid to (date pickers)
- Annual value

**Step 2: Equipment selection**
- Multi-select from `equipment_unit` filtered by the selected party's sites
- For each selected unit: set `pm_visits_per_year` and `pm_frequency`

**Step 3: Coverage rules**
- Default rules pre-filled based on contract type
  - comprehensive: labour covered, travel covered, parts covered
  - non_comprehensive: labour covered, travel covered, parts NOT covered
  - labour_only: labour covered only
- Allow adding/removing rules
- Each rule: scope dropdown, match_value text, is_covered toggle, cap_amount optional, priority

**Step 4: SLA targets (optional)**
- Override defaults: P1 response mins, P2 response mins, P3 response mins

**Submit**: Insert `contract`, then `contract_equipment` rows, then `coverage_rule` rows. DO NOT set status to 'active' yet. Redirect to the contract detail page where the owner explicitly activates.

---

## Contract activation — `src/app/api/contracts/[id]/activate/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const { error } = await supabase
    .from('contract')
    .update({ status: 'active' })
    .eq('contract_id', params.id)

  // The database trigger fn_on_contract_activate fires automatically
  // and calls fn_generate_pm_visits. Nothing else needed here.

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

Show an "Activate Contract" button on the contract detail page (only when status = 'draft', only for owner/dispatcher role).

---

## Coverage rules editor — `src/components/contracts/coverage-rule-editor.tsx`

A list of rules with inline edit. Each row:
- Scope: dropdown (part_category, fault_type, labour, travel, consumable)
- Match value: text input (disabled when scope is labour/travel)
- Is covered: toggle (green = covered, red = excluded)
- Cap amount: number input (optional)
- Priority: number (higher = wins)
- Delete button

Show a badge count like "5 rules" on the contract detail tab.

---

## PM visits — `/contracts/[id]` PM tab

```typescript
const { data: pmVisits } = await supabase
  .from('pm_visit')
  .select(`
    pm_visit_id, due_date, grace_days, status,
    contract_equipment(
      unit_id,
      equipment_unit(serial_no,
        product_model(name))
    )
  `)
  .in('contract_equipment_id', contractEquipmentIds)
  .order('due_date', { ascending: true })
```

Table: Due Date, Equipment, Serial No, Grace Until (due_date + grace_days), Status.

Status badge: `pending` = grey, `scheduled` = blue, `done` = green, `skipped` = amber, `breached` = red.

A PM visit is `breached` if `due_date + grace_days < today AND status = 'pending'`. Run this as a daily check in Track E's Edge Function.

---

## Renewal pipeline — `/renewals`

Read from the materialized view:
```typescript
const { data: renewals } = await supabase
  .from('v_renewal_pipeline')
  .select('*')
  .eq('org_id', org.org_id)
  .order('days_until_expiry', { ascending: true })
```

Three columns: expiring in 30 days (red), 31-60 days (amber), 61-90 days (grey).

Each card: customer name, phone, contract no, annual value, expiry date, equipment count.

"Initiate Renewal" button: creates a new contract with `renewed_from_id` pointing to the current one and pre-fills all the same details. The original stays active until the new one is activated.

---

## Key queries to know

```typescript
// All contracts for this org
supabase.from('contract').select('*, party(name, phone)').eq('org_id', orgId)

// Units covered by a contract
supabase.from('contract_equipment')
  .select('*, equipment_unit(serial_no, product_model(name))')
  .eq('contract_id', contractId)

// Overdue PM visits across all contracts
supabase.from('pm_visit')
  .select('*, contract_equipment(contract_id, unit_id)')
  .eq('status', 'pending')
  .lt('due_date', new Date().toISOString().split('T')[0])
```

---

## What you expose to other tracks

- `/equipment/[id]` page (Track C links to it from tickets)
- `/contracts/[id]` page (Track C links from job detail)
- Equipment unit selector component used in ticket creation (Track C)
- Customer/party selector used in ticket creation (Track C)

---

## What you do NOT build

- Ticket creation (Track C)
- Job assignment (Track C)
- Technician view (Track D)
- WhatsApp notifications (Track E)
