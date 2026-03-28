export const PHASE_TEMPLATES = [
  {
    name: "Reset",
    description:
      "Here we are focusing on fixing gut health, improving our metabolism and optimizing our hormones. By starting the triple O method, we will have our body work for us rather than against us to optimize fat loss and improve health.",
    nextPhase: "Refine",
  },
  {
    name: "Refine",
    description:
      "Cutting down our body fat and accelerating our fat loss. Belly fat & love handles are going down. Throughout the phase we will need to make adjustments to break plateaus in order to have consistent progress to sculpt your ideal physique.",
    nextPhase: "Build",
  },
  {
    name: "Build",
    description:
      "Reverse Diet leading into surplus for optimized lean muscle growth and strength while maintaining the progress we've made. We'll be gradually increasing our calories over time to build up our metabolism. This is how we stay lean and keep the fat off while building muscle.",
    nextPhase: "Recomp",
  },
  {
    name: "Sustain",
    description:
      "Maintaining our results we have experienced through the program and giving our body a break for digestion and recovery so when we tackle the next phase our body is in a primed state. This is also where we set our next goal to work towards.",
    nextPhase: "",
  },
  {
    name: "Recomp",
    description:
      "This phase is used post/in between build phases to bring body fat back down to reduce carbohydrate resistance that leads to higher body fat and to also regulate blood sugar levels. Essential to give the body rest and pulling away excess fat to make the following build phase even more optimal.",
    nextPhase: "Build",
  },
] as const;

export type PhaseName = (typeof PHASE_TEMPLATES)[number]["name"];
