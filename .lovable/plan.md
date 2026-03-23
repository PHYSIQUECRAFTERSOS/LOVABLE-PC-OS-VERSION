# Plan: Fix Apple Guideline 3.1.2(c) — Add Subscription Length Details

## Problem

Apple is rejecting because the subscribe page lacks **explicit subscription duration language**. Currently:

- "Weekly Updates" shows `$399.99/mo` — no clear statement of billing period
- "Bi-Weekly Updates" shows `$299.99/mo` — same issue
- "Training Only" shows `$174.99/2mo` — ambiguous

Apple requires each plan to clearly state: the **length of subscription**, the **billing period**, and what **content/services** are provided during each period. The current bottom disclaimer is also incomplete — it doesn't mention per-plan durations.

## Changes

### File: `src/pages/Subscribe.tsx`

**1. Add a `duration` field to the Plan interface and each plan:**


| Plan              | price display      | new `duration` text         |
| ----------------- | ------------------ | --------------------------- |
| Weekly Updates    | `$399.99/month`    | `1 month · Auto-renewable`  |
| Bi-Weekly Updates | `$299.99/month`    | `1 month · Auto-renewable`  |
| Training Only     | `$174.99/2 months` | `2 months · Auto-renewable` |


**2. Render the duration line below the price on each plan card** — small muted text clearly stating the billing cycle length.

**3. Update each plan's features to explicitly describe what's provided per period:**

- Weekly Updates: "Weekly progress updates **each week reviewing over your progress and we make changes to your program as necessary "**
- Bi-Weekly Updates: "Bi-weekly progress updates **every other week** **reviewing over your progress and we make changes to your program as necessary "**
- Training Only: "Customized Training Program **updated every 2 months**"

**4. Rewrite the bottom disclaimer** to comply with all Apple-required disclosures:

> "Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. Weekly Updates and Bi-Weekly Updates are billed monthly. Training Only is billed every 2 months. No long-term commitment required — cancel anytime. Payment will be charged to your Apple ID account at confirmation of purchase. You can manage or cancel your subscription in your Apple ID Account Settings."

This covers: length per plan, auto-renewal, cancellation window, no commitment, and management instructions — all items Apple reviewers check for.

### Technical Detail

- Add `duration: string` to the `Plan` interface
- Add the field to each entry in `DEFAULT_PLANS`
- Render it as a `<span>` below the price in the plan card JSX
- Replace the existing `<p>` disclaimer text at line 228-231

No database or backend changes needed.

&nbsp;

the most recent update we previous did is the first time everything is working with he subscription , payment , and showing up . so make sure these functions still work perfectly 

&nbsp;