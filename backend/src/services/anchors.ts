import type { TaskDomain } from '../providers/types';

// ---------------------------------------------------------------------------
// Domain anchor prompts
//
// Each anchor set contains 7–11 diverse examples that clearly represent that
// domain. Diversity matters: anchors that are too similar to each other
// cluster in embedding space and fail to cover the full domain surface.
//
// Rule of thumb per domain:
//   - Cover different sub-types (e.g. coding: debug / implement / explain / schema)
//   - Avoid vocabulary overlap with other domains (e.g. "calculate" is math,
//     so coding anchors use "compute" only when paired with code context)
//   - Write anchors at the same register as real user prompts (imperative,
//     conversational, or question form) — not as category labels.
//
// When to update: if real traffic consistently misclassifies a prompt type,
// add 1–2 representative examples to the appropriate anchor set.
// ---------------------------------------------------------------------------

export interface DomainAnchors {
  domain: TaskDomain;
  examples: readonly string[];
}

export const DOMAIN_ANCHORS: readonly DomainAnchors[] = [
  {
    domain: 'coding',
    examples: [
      'Write a TypeScript function that implements binary search on a sorted array',
      'Debug this Python error: TypeError unsupported operand type for addition between int and str',
      'Implement a REST API endpoint in Express.js that validates user input and returns JSON',
      'Refactor this JavaScript class to follow the repository pattern with dependency injection',
      'What is the time complexity of quicksort and how does it compare to mergesort',
      'Set up a PostgreSQL database schema with foreign keys for a multi-tenant SaaS application',
      'Write a React hook that fetches data from an API and handles loading and error states',
      // Added after benchmark: "subroutine/fault" and "closures/variable" prompts
      // drifted toward math. These anchors pull them back to coding.
      'There is a bug in my subroutine that produces incorrect output on certain inputs',
      'Why does my variable inside a loop capture the wrong value when I access it later',
    ],
  },
  {
    domain: 'math',
    examples: [
      'Solve the differential equation dy/dx = 2xy with initial condition y(0) = 1',
      'Prove that the sum of the first n natural numbers equals n times n plus one divided by two using induction',
      'Calculate the eigenvalues and eigenvectors of the matrix with rows 3 1 and 1 3',
      'Find the derivative of f of x equals x cubed times the natural log of x using the product rule',
      'Compute the probability that two fair dice sum to seven or eleven',
      'Solve the system of equations: 2x plus 3y equals 12 and 4x minus y equals 5',
      'Evaluate the definite integral of x squared from zero to three',
    ],
  },
  {
    domain: 'creative',
    examples: [
      'Write a short story about a lighthouse keeper who discovers a message in a bottle',
      'Compose a haiku about the transition from winter to spring',
      'Write the opening paragraph of a noir detective novel set in 1940s Los Angeles',
      'Create a dialogue between two characters arguing about whether to leave their hometown',
      'Write a persuasive essay arguing that public libraries are essential to democracy',
      'Describe a scene where an aging chef prepares their last meal before retiring',
      'Write a poem about the feeling of coming home after a long journey',
    ],
  },
  {
    domain: 'general',
    examples: [
      'What is the capital of Australia',
      'Explain how the human immune system fights viral infections',
      'What are the main differences between the French Revolution and the American Revolution',
      'What time zone is Tokyo in and how does it compare to UTC',
      'Summarize the plot of George Orwell\'s 1984',
      'What are some healthy breakfast options that are quick to prepare in the morning',
      'Who was Ada Lovelace and why is she historically significant',
      // Added after benchmark: nature/science questions drifted to creative,
      // health/lifestyle questions drifted to creative, leadership drifted to creative.
      // These anchors cover factual questions that use descriptive or qualitative language.
      'Why do trees change color and lose their leaves in the autumn season',
      'What lifestyle changes help someone manage their weight in a sustainable way',
      'What qualities make a person an effective leader when their team is under pressure',
      'How does the global economy affect the prices consumers pay for everyday goods',
      // Added after benchmark round 2: biographical/historical questions drifted to creative,
      // ML/AI conceptual questions drifted to math.
      'Who was Marie Curie and what scientific discoveries made her historically important',
      'How do neural networks learn to recognize patterns and what happens during model training',
    ],
  },
] as const;
