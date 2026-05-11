# AI Coding Agent Task Brief: Fast Improvements for the Existing oPet Stack

These tasks are limited to fast, practical improvements within the existing oPet stack:

SolidJS/Vite frontend, Tailwind with CSS variables, shadcn/solid components, Hono backend, Prisma schema, existing signature and verification flows, and the current page structure.

Do not introduce a new design system, UI library, animation framework, or major architectural change unless explicitly required.

---

## 1. Add Campaign/Organization Theming via Existing Tailwind CSS Variables

oPet already uses Tailwind design tokens through CSS variables such as `--primary`, `--primary-foreground`, `--background`, `--foreground`, `--accent`, `--card`, `--border`, etc. These tokens are already wired into `tailwind.config.js`.

Do not build a new design system.

### Task

Update the existing global CSS variable definitions to create a greener, organization-oriented campaign theme. Prefer changing CSS variables globally instead of editing individual components.

### Implementation

Find the frontend file where variables like `--primary`, `--background`, `--foreground`, `--accent`, `--card`, etc. are defined. This is likely one of:

```text
frontend/src/index.css
frontend/src/app.css
```

Set a light theme similar to this:

```css
:root {
  --background: 78 45% 92%;
  --foreground: 80 20% 12%;
  --primary: 82 88% 40%;
  --primary-foreground: 0 0% 100%;
  --accent: 82 70% 88%;
  --accent-foreground: 80 30% 18%;
  --card: 0 0% 100%;
  --card-foreground: 80 20% 12%;
  --border: 82 25% 78%;
  --ring: 82 88% 40%;
}
```

Then check whether buttons, cards, inputs, and links already use classes such as:

```text
bg-primary
text-primary-foreground
bg-card
border-border
```

If hardcoded colors are used, such as:

```text
bg-blue-600
text-gray-900
bg-white
```

replace them with existing token-based Tailwind classes where appropriate.

### Acceptance Criteria

The public petition pages visibly use a greener, organization-oriented theme.

The admin area remains usable.

No new UI library is added.

Avoid inline colors unless absolutely necessary.

Frontend type checking still passes with:

```bash
bun run typecheck
```

---

## 2. Add Branding Header to the Existing Public Layout

The frontend already has a central layout and public pages such as Home, Petition, Verify, Withdraw, and Success.

Use the existing layout instead of editing every page individually.

### Task

Add a simple branding header to the public layout with a logo/wordmark on the left and a short claim on the right or below.

Static branding is sufficient for this first step.

### Implementation

In the existing layout component, likely:

```text
frontend/src/components/Layout.tsx
```

or the equivalent layout component, add a header similar to this:

```tsx
<header class="border-b border-border bg-background">
  <div class="container flex items-center justify-between py-4">
    <a href="/" class="flex items-baseline gap-1 font-bold tracking-tight">
      <span class="text-3xl text-primary">4|CHANGE</span>
      <span class="text-xl text-foreground/70">.NOW</span>
    </a>
    <p class="hidden text-sm text-muted-foreground md:block">
      Gemeinsam Veränderung sichtbar machen
    </p>
  </div>
</header>
```

If a header already exists, adjust it instead of duplicating it.

### Acceptance Criteria

The header appears on public pages.

The admin login and admin dashboard either remain unchanged or intentionally use the same header without breaking.

The mobile layout remains clean.

---

## 3. Add Social Sharing to the Success Page

oPet already has a signature flow: a user signs, receives a verification email, clicks the verification link, and the signature is counted.

The frontend also already has a Success page.

### Task

Extend the existing Success page with share buttons and a copy-link button.

### Implementation

In:

```text
frontend/src/pages/Success.tsx
```

or the equivalent file, determine the petition URL.

If the Success page has access to the petition slug, use it to build the petition URL.

If no slug is available, use:

```ts
window.location.origin
```

plus the best available link back to the petition.

No backend change is required.

Create share text:

```ts
const shareText = "Ich habe unterschrieben – mach doch auch mit!";
const shareUrl = petitionUrl;
```

Add share links:

```ts
const links = {
  whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
  email: `mailto:?subject=${encodeURIComponent("Petition unterstützen")}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
  x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
};
```

Use existing button components from `components/ui` if available.

If no button component exists, use existing Tailwind token classes such as:

```text
bg-primary
text-primary-foreground
border
bg-card
```

Add a copy button:

```ts
await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
```

Show either a toast or a simple status text after copying. If `solid-sonner` is already installed, it may be used.

### Acceptance Criteria

After signing, the user sees a clear sharing section.

WhatsApp, email, Facebook, and X links open correctly.

Copying the link works.

No backend change is required.

---

## 4. Make Petition Progress More Visible Using Existing Data

The existing Petition model already contains `goalCount`, and signatures are relationally available.

If the API already returns a signature count, a progress bar can be built immediately.

### Task

Add a prominent supporter progress section to the public petition detail page.

It should show:

```text
X of Y signatures
```

plus a progress bar.

### Implementation

In:

```text
frontend/src/pages/Petition.tsx
```

check which petition fields are returned by the API client in:

```text
frontend/src/lib/api.ts
```

If `goalCount` and `signatureCount`, or similar fields, already exist, use them directly.

Progress calculation:

```ts
const progress = () => {
  if (!petition()?.goalCount || !petition()?.signatureCount) return 0;
  return Math.min(
    100,
    Math.round((petition()!.signatureCount / petition()!.goalCount!) * 100)
  );
};
```

Example UI:

```tsx
<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
  <p class="text-sm text-muted-foreground">Aktueller Stand</p>
  <p class="mt-1 text-3xl font-bold text-foreground">
    {petition().signatureCount} Unterstützer:innen
  </p>

  <Show when={petition().goalCount}>
    <div class="mt-4 h-3 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full bg-primary transition-all"
        style={{ width: `${progress()}%` }}
      />
    </div>
    <p class="mt-2 text-sm text-muted-foreground">
      {progress()}% von {petition().goalCount} erreicht
    </p>
  </Show>
</div>
```

If the API does not return a signature count yet, add a small backend change to include a counted signature value in the public petition response.

Backend counting rule:

Only count signatures where:

```ts
verified: true
withdrawn: false
```

### Acceptance Criteria

The petition page clearly shows progress.

Unverified signatures are not counted.

Withdrawn signatures are not counted.

---

## 5. Explain Email Verification More Clearly

The platform already has email verification.

The goal here is to make the verification step more understandable to users.

### Task

Add clear explanatory text to the signature form and Success page explaining that a signature only counts after email confirmation.

### Implementation

In the existing signature form on the petition page, add a short note below the email field or before the submit button:

```tsx
<p class="text-sm text-muted-foreground">
  Deine Unterschrift zählt erst, nachdem du den Bestätigungslink in der E-Mail angeklickt hast.
</p>
```

On the Success page, add or adjust the content:

```tsx
<h1>Bitte bestätige deine E-Mail-Adresse</h1>
<p>
  Wir haben dir einen Bestätigungslink geschickt. Erst nach dem Klick auf diesen Link wird deine Unterschrift gezählt.
</p>
```

If the same page is used both after submitting the form and after successful verification, separate the text depending on the flow:

```text
Bitte bestätige deine E-Mail-Adresse
```

versus:

```text
Danke für deine Unterschrift
```

### Acceptance Criteria

Users understand the email verification step.

No backend change is required.

---

## 6. Prepare Public Comments Using Existing Opt-In Fields

The schema already contains:

```text
comment
publicOptIn
allowComments
```

This is enough for a careful first version of public supporter comments.

### Task

Show a small “Supporter voices” section on the petition page, but only when comments are allowed and the user explicitly opted in to public display.

### Implementation

Check the backend public petition endpoint.

If public comments are not returned yet, add a field like:

```ts
publicComments: [
  {
    fullName: string | null;
    city: string | null;
    comment: string;
    createdAt: string;
  }
]
```

Query rule:

Only include signatures where:

```ts
verified: true
withdrawn: false
publicOptIn: true
comment: { not: null }
```

Only return comments if:

```ts
petition.allowComments === true
```

Frontend example in `Petition.tsx`:

```tsx
<Show when={petition().allowComments && petition().publicComments?.length}>
  <section class="mt-8 rounded-xl border border-border bg-card p-6">
    <h2 class="text-xl font-semibold">Stimmen aus der Unterstützung</h2>
    <div class="mt-4 space-y-4">
      <For each={petition().publicComments.slice(0, 5)}>
        {(entry) => (
          <blockquote class="border-l-4 border-primary pl-4 text-sm">
            <p>{entry.comment}</p>
            <footer class="mt-2 text-muted-foreground">
              {entry.fullName ?? "Anonym"}{entry.city ? `, ${entry.city}` : ""}
            </footer>
          </blockquote>
        )}
      </For>
    </div>
  </section>
</Show>
```

Do not build a free-form public comment wall yet.

Only use existing opt-ins.

Never show comments without `publicOptIn`.

### Acceptance Criteria

Comments appear only when the petition allows comments.

Comments appear only when the signer opted in publicly.

No email addresses are displayed.

Unverified signatures are not displayed.

Withdrawn signatures are not displayed.

---

## 7. Add a Simple “Virtual Crowd” as an Avatar Grid

This is a small, safe first version of a virtual demonstration.

It should use only counted, verified signatures and does not require complex animation.

### Task

Build a decorative supporter crowd on the petition page using a grid of small circles or avatars.

### Implementation

Use the verified signature count and render a limited number of icons, for example a maximum of 120.

```ts
const avatarCount = () => Math.min(petition().signatureCount ?? 0, 120);
```

Example UI:

```tsx
<div class="rounded-xl border border-border bg-card p-6">
  <h2 class="text-xl font-semibold">Die Unterstützung wächst</h2>

  <div class="mt-4 grid grid-cols-12 gap-2">
    <For each={Array.from({ length: avatarCount() })}>
      {(_, i) => (
        <div
          class="h-4 w-4 rounded-full bg-primary/80"
          title={`Unterstützer:in ${i() + 1}`}
        />
      )}
    </For>
  </div>

  <p class="mt-3 text-sm text-muted-foreground">
    Jede bestätigte Unterschrift macht die Bewegung sichtbarer.
  </p>
</div>
```

Optional: add a small animation only if an existing Tailwind utility already supports it.

For example:

```text
animate-content-show
```

If this utility does not exist, do not add a new animation library.

### Acceptance Criteria

The crowd visually represents support without exposing personal data.

No new dependency is added.

No Canvas or WebGL is used.

---

## 8. Add Frontend Fallback Share Texts per Petition

The current schema does not need dedicated share-text fields for a first implementation.

### Task

Generate useful share texts automatically from existing petition fields such as `title` and `summary`.

### Implementation

Add a small helper file, for example:

```text
frontend/src/lib/share.ts
```

with:

```ts
export function buildShareText(petition: { title: string; summary?: string }) {
  return `Ich habe die Petition „${petition.title}“ unterschrieben. Mach doch auch mit!`;
}

export function buildShareUrl(slug: string) {
  return `${window.location.origin}/petitions/${slug}`;
}
```

Use this helper on both the Petition page and the Success page.

### Acceptance Criteria

Share text is not hardcoded to a single campaign.

It works for multiple petitions.

No backend change is required.

---

## 9. Add Helper Texts to the Admin Petition Form

The admin system already supports creating and managing petitions.

The goal is to make the form easier to use for non-technical admins.

### Task

Add helper texts to the existing admin petition form.

### Implementation

Add helpful descriptions near these existing fields:

```text
title
summary
body
goalCount
allowComments
allowPublicNames
```

Suggested helper texts:

```text
title:
Kurz, konkret, teilbar.

summary:
1–2 Sätze für Karten, Listen und Social Preview.

body:
Hier die ausführliche Begründung, Forderung und Kontext.

goalCount:
Wird für Fortschrittsanzeige genutzt.

allowComments:
Nur aktivieren, wenn öffentliche Kommentare gewünscht sind.

allowPublicNames:
Nur Namen anzeigen, wenn explizit zugestimmt wurde.
```

### Acceptance Criteria

Only UI text changes are made.

No logic change is required.

The admin form becomes easier to understand.

---

## 10. Improve the Public Home Page as a Campaign Overview

oPet already supports multiple petitions.

The homepage should look more like a campaign platform and less like a raw data list.

### Task

Update the existing Home page so active petitions are displayed as campaign cards.

### Implementation

In:

```text
frontend/src/pages/Home.tsx
```

keep the existing petition list logic, but present petitions as cards using existing UI or Tailwind token classes.

Example card grid:

```tsx
<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  <For each={petitions()}>
    {(petition) => (
      <a
        href={`/petitions/${petition.slug}`}
        class="rounded-xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <h2 class="text-xl font-semibold text-card-foreground">
          {petition.title}
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          {petition.summary}
        </p>
        <div class="mt-4 text-sm font-medium text-primary">
          Jetzt unterschreiben →
        </div>
      </a>
    )}
  </For>
</div>
```

Add a hero section before the list:

```tsx
<section class="py-12">
  <p class="text-sm font-medium uppercase tracking-wide text-primary">oPet</p>
  <h1 class="mt-2 text-4xl font-bold tracking-tight">
    Petitionen sichtbar machen.
  </h1>
  <p class="mt-4 max-w-2xl text-muted-foreground">
    Unterstütze Kampagnen, bestätige deine Stimme per E-Mail und teile Anliegen mit anderen.
  </p>
</section>
```

### Acceptance Criteria

The homepage looks like a real campaign platform.

No backend change is required.

It works with the existing:

```text
/api/petitions
```

endpoint.

---

## 11. Improve Meta Tags for Petition Pages

This is useful for social sharing.

Because the app runs as a Vite/Solid SPA, client-side OpenGraph updates may not be fully recognized by all social crawlers. Full social crawler support would require SSR or static HTML generation later.

This task is only about a fast baseline improvement.

### Task

Set `document.title` and the meta description based on the loaded petition.

### Implementation

In `Petition.tsx`, after the petition has loaded:

```ts
createEffect(() => {
  const p = petition();
  if (!p) return;

  document.title = `${p.title} – oPet`;

  let description = document.querySelector('meta[name="description"]');

  if (!description) {
    description = document.createElement("meta");
    description.setAttribute("name", "description");
    document.head.appendChild(description);
  }

  description.setAttribute(
    "content",
    p.summary ?? "Unterstütze diese Petition."
  );
});
```

Optionally also update:

```text
og:title
og:description
```

but keep in mind that some platforms do not evaluate client-side meta tag changes.

### Acceptance Criteria

The browser tab title reflects the current petition.

The meta description reflects the current petition.

No new dependency is added.

---

## 12. Make Existing Opt-In Labels Clearer

The schema already contains:

```text
publicOptIn
updatesOptIn
recipientShareOptIn
```

Keep the existing field names.

No migration is needed.

### Task

Rewrite the checkbox labels in the signature form to be clearer and more trustworthy.

### Implementation

Use labels like:

```text
publicOptIn:
Mein Name und mein Kommentar dürfen öffentlich auf der Petitionsseite angezeigt werden.

updatesOptIn:
Ich möchte per E-Mail über wichtige Neuigkeiten zu dieser Petition informiert werden.

recipientShareOptIn:
Meine Angaben dürfen im Rahmen der Übergabe an die Empfänger der Petition berücksichtigt werden.
```

Below the checkboxes, add a short privacy/withdrawal note:

```text
Du kannst deine Unterschrift später über einen Link per E-Mail zurückziehen.
```

This matches the existing withdrawal flow.

### Acceptance Criteria

Labels are understandable to users.

Existing field names remain unchanged.

No database migration is required.
