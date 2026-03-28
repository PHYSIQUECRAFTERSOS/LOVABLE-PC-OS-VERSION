

# Plan: Phase Template System with Quick-Assign Dropdowns

## What We're Building

Replace the free-text phase name/description inputs with a dropdown-driven template system. Five predefined phases (Reset, Refine, Build, Sustain, Recomp) with auto-populating descriptions. Selecting a phase from the dropdown instantly fills the description. Coach Notes and Additional Notes stay as free-text fields.

---

## Changes

### 1. Add Phase Templates Constant

**Files:** `src/components/nutrition/PhaseInfoEditor.tsx` + `src/components/clients/workspace/PlanTab.tsx`

Define a shared constant (or inline in both files) with the 5 phase templates:

```
PHASE_TEMPLATES = [
  { name: "Reset", description: "Here we are focusing on fixing gut health, improving our metabolism and optimizing our hormones. By starting the triple O method, we will have our body work for us rather than against us to optimize fat loss and improve health." },
  { name: "Refine", description: "Cutting down our body fat and accelerating our fat loss. Belly fat & love handles are going down. Throughout the phase we will need to make adjustments to break plateaus in order to have consistent progress to sculpt your ideal physique." },
  { name: "Build", description: "Reverse Diet leading into surplus for optimized lean muscle growth and strength while maintaining the progress we've made. We'll be gradually increasing our calories over time to build up our metabolism. This is how we stay lean and keep the fat off while building muscle." },
  { name: "Sustain", description: "Maintaining our results we have experienced through the program and giving our body a break for digestion and recovery so when we tackle the next phase our body is in a primed state. This is also where we set our next goal to work towards." },
  { name: "Recomp", description: "This phase is used post/in between build phases to bring body fat back down to reduce carbohydrate resistance that leads to higher body fat and to also regulate blood sugar levels. Essential to give the body rest and pulling away excess fat to make the following build phase even more optimal." },
]
```

### 2. Replace Input Fields with Select Dropdowns

**Files:** `PhaseInfoEditor.tsx` + `PlanTab.tsx` (both have the same phase form)

For "Current Phase Name" and "Next Phase Name":
- Replace `<Input>` with `<Select>` dropdown listing all 5 phases
- On selection, auto-populate the corresponding description textarea
- Description textarea remains editable (in case coach wants to tweak for a specific client)
- Add a "Custom" option at the bottom of the dropdown for edge cases where a phase name doesn't match the templates

### 3. Smart Next Phase Suggestion

When "Current Phase" is selected, auto-suggest the logical next phase:
- Reset → Refine (95% of clients)
- Refine → Build
- Build → Sustain or Recomp
- Sustain → next goal-dependent (no auto-fill)
- Recomp → Build

This