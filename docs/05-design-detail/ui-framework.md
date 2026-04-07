# P1-5: UI Framework Decision

> Date: 2026-03-21
> Status: Confirmed
> Scope: User app + Admin app

---

## 1. Decision

| Item | Decision |
|------|----------|
| UI Framework | shadcn/ui (Radix UI primitives + Tailwind CSS) |
| Scope | User app + Admin app unified |
| Admin app priority | (a) High completeness per P0-4~P0-11 requirements |
| Admin app form | Same Next.js project, `/admin/*` routes |

## 2. Architecture: `client/ui/` Layer

### Rationale

`client/core/` must remain project-agnostic (reusable across different business services). shadcn/ui is a specific UI library choice. Placing it in core would couple core to that choice. A separate `ui/` layer allows:

- core replacement: NO impact on ui/ or features/
- ui replacement (shadcn -> Ark UI etc): NO impact on core
- features replacement (Essenly -> other business): NO impact on core or ui/

### Structure

```
src/client/
  core/                    # System infra (UI library agnostic)
    supabase-browser.ts

  ui/                      # Design system (replaceable unit)
    primitives/            # shadcn components (button, dialog, input...)

  features/                # Business UI (Essenly-specific)
    cards/
    chat/
    onboarding/
    profile/
    layout/
    admin/
      components/          # AdminDataTable, MultiLangInput, ImageUploader
      layouts/             # AdminSidebar, AdminHeader
```

### Dependency Direction

```
app/ -> features/ -> ui/primitives/ -> shared/utils/cn
                  -> core/           -> shared/
```

Forbidden:
- ui/ -> features/ (R-11)
- core/ -> ui/ (R-12)
- ui/ contains K-beauty terms (R-13)

### cn() Utility Placement

`shared/utils/cn.ts` — pure function (clsx + tailwind-merge), no side effects. Placed in shared/ because both server components (RSC) and client components need Tailwind class composition.

## 3. CLAUDE.md Rule Updates

### P-6 Amendment

Before: `shared/` excluded from binding chain count.
After: `shared/` and `client/ui/` internal imports excluded from binding chain count.

### New Rules

| ID | Rule | Description |
|----|------|-------------|
| R-11 | `ui/ -> features/` import forbidden | ui/ must not depend on business logic |
| R-12 | `core/ -> ui/` import forbidden | core must not depend on UI library choice |
| R-13 | No K-beauty terms in `ui/` | Same principle as L-5, extended to ui/ |

### L-0b Extension

`client/ui/` files must also include `import "client-only"` boundary guard.

## 4. TDD Update

TDD section 3.6 project structure updated to include `client/ui/` layer.

## 5. shadcn Components (MVP)

### Shared (user + admin): 18 components

Button, Input, Dialog, Alert Dialog, Dropdown Menu, Tabs, Badge, Toast (Sonner), Card, Select, Checkbox, Label, Separator, Skeleton, Table, Pagination, Switch, Textarea

### Deferred to P1-4 evaluation

Popover (if needed for filter UI)

## 6. Token Integration

- shadcn CSS variables mapped to Essenly tokens in globals.css
- S-2 (single source of truth): globals.css is the only value definition point
- S-5 (no hardcoding): ui/primitives/ must not contain #hex values

## 7. Replaceability Verification

| Scenario | Affected | core modified? |
|----------|----------|----------------|
| shadcn -> Ark UI | client/ui/ + features/ imports | NO |
| Essenly -> other business | features/ + shared/ | NO |
| Supabase -> Firebase | core/ files | YES (infra change = justified) |
| Design token change | globals.css only | NO |
