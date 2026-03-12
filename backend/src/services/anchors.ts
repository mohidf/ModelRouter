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
      'Implement a REST API endpoint in Express.js that validates user input and returns JSON',
      'Refactor this JavaScript class to follow the repository pattern with dependency injection',
      'What is the time complexity of quicksort and how does it compare to mergesort',
      'Set up a PostgreSQL database schema with foreign keys for a multi-tenant SaaS application',
      'Write a React hook that fetches data from an API and handles loading and error states',
      'Create a Python script that reads a CSV file and outputs a sorted JSON object',
      'What is the best pattern for sharing state between two isolated components in a React app',
      'How do I prevent prop drilling in a deeply nested component tree',
      'How should I structure a TypeScript service to handle background job processing and retries',
    ],
  },
  {
    domain: 'coding_debug',
    examples: [
      'Debug this Python error: TypeError unsupported operand type for addition between int and str',
      'My React component re-renders infinitely — here is the useEffect code, why is it broken',
      'This SQL query returns no rows but I expect results, what is wrong with the JOIN',
      'Why is my async function not awaiting correctly and returning undefined instead of data',
      'Stack trace: NullPointerException at line 42 in UserService.findById — how do I fix this',
      'My unit test fails with AssertionError: expected 5 but got undefined, help me debug',
      'The build crashes with Cannot find module ts-node, what is the resolution',
      'Why does my loop exit after one iteration instead of processing the whole array',
      'There is a bug in my subroutine that produces incorrect output on certain inputs',
      'Why does my variable inside a loop capture the wrong value when I access it later',
      'My scheduled job produces correct results most days but wrong totals on certain conditions',
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
      'Find the steepest descent direction for f(x,y) at the point (1, 2)',
      'What is the minimum number of moves for a chess knight to traverse the entire board',
    ],
  },
  {
    domain: 'math_reasoning',
    examples: [
      'If a train travels at 60 mph and another at 80 mph how long until they are 280 miles apart',
      'Step by step how many handshakes occur if 10 people each shake hands with every other person',
      'Given that all cats are animals and Mittens is a cat reason through what we can conclude',
      'A bag has 5 red and 3 blue balls what is the probability of drawing two red balls in a row',
      'Work through this logic puzzle Alice is taller than Bob Bob is taller than Carol who is shortest',
      'Show your work how many ways can 4 students be arranged in a line of 4 seats',
      'A store marks up items by 30 percent then offers a 20 percent discount what is the net change',
      'Prove by induction that 2 to the power of n is greater than n squared for all n greater than 4',
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
      'Brainstorm ten creative names for a startup that delivers fresh herbs to restaurants',
    ],
  },
  {
    domain: 'research',
    examples: [
      'What does the peer-reviewed literature say about the long-term cognitive effects of social media use',
      'Summarize the current scientific consensus on the gut microbiome and its effects on mental health',
      'What do empirical studies show about the effectiveness of mindfulness-based stress reduction programs',
      'Analyze the evidence for and against the hypothesis that dark matter is made of WIMPs',
      'What does recent research say about the health effects of intermittent fasting on metabolic markers',
      'Evaluate the arguments for and against universal basic income based on randomized control trial evidence',
      'What are the key findings from meta-analyses on the effectiveness of cognitive behavioral therapy',
      'How do researchers measure and study the long-term economic impact of immigration on host countries',
      'What methodologies do climate scientists use to attribute extreme weather events to climate change',
      'Why do some cities successfully reduce car usage and traffic while others with similar policies fail',
    ],
  },
  {
    domain: 'summarization',
    examples: [
      'Summarize the key points of this article in three bullet points',
      'Give me a TL;DR of the main arguments in this document',
      'Condense this 500-word report into a two-sentence executive summary',
      'What are the main takeaways from this research paper',
      'Recap the plot of the movie in under 100 words',
      'Extract the five most important action items from this meeting transcript',
      'Shorten this email to remove redundant information while keeping the core message',
      'Give me a brief overview of the pros and cons mentioned in this review',
    ],
  },
  {
    domain: 'vision',
    examples: [
      'What is in this image and can you describe the scene in detail',
      'Read the text visible in this screenshot and transcribe it',
      'Analyze this chart and explain what trend it shows',
      'Describe what objects are present in this photo and their positions',
      'What does this diagram illustrate and what are its main components',
      'Can you identify the handwriting in this image and tell me what it says',
      'Look at this architecture diagram and explain the data flow between services',
      'What emotion does the person in this photograph appear to be expressing',
      'What type of document does this image show and what key information can you extract from it',
    ],
  },
  {
    domain: 'general_chat',
    examples: [
      'Hello how are you doing today',
      'Hey can you help me think through something',
      'What do you think about learning a new language as an adult',
      'Good morning I need a quick suggestion for something to watch tonight',
      'Quick question what is a good book to read on a long flight',
      'Hi I was wondering if you could recommend a good recipe for dinner',
      'What are your thoughts on remote work versus working in an office',
      'I am just curious what would you say is the most interesting science fact',
    ],
  },
  {
    domain: 'multilingual',
    examples: [
      'Translate this English sentence to French: The weather is beautiful today',
      'How do you say thank you in Japanese and what is the cultural context',
      'Translate and explain the meaning of this Spanish proverb',
      'Write a short greeting in German for a business email',
      'What is the difference between formal and informal you in Spanish',
      'Explain the meaning of the Chinese character for harmony and how it is used in sentences',
      'Correct my French grammar in this sentence: Je suis allé au magasin hier',
      'Translate this paragraph from Portuguese to English while preserving the tone',
      'Why do some languages have grammatical gender while others like English largely lost it',
      'What linguistic features distinguish analytic languages from synthetic ones like Latin',
    ],
  },
  {
    domain: 'general',
    examples: [
      'What is the capital of Australia',
      'Explain how the human immune system fights viral infections',
      'What time zone is Tokyo in and how does it compare to UTC',
      'What are some healthy breakfast options that are quick to prepare in the morning',
      'Who was Ada Lovelace and why is she significant in the history of computing',
      'Why do trees change color and lose their leaves in the autumn season',
      'What lifestyle changes help someone manage their weight in a sustainable way',
      'What qualities make a person an effective leader when their team is under pressure',
      'Who was Marie Curie and what scientific discoveries made her historically important',
      'How do neural networks learn to recognize patterns and what happens during model training',
      // Social and historical convention questions
      'Why do some countries drive on the left side of the road instead of the right',
      'Why did ancient civilizations build their cities near rivers',
      'How did the tradition of shaking hands originate',
      // Natural phenomenon explanation questions
      'What causes the Northern Lights and where is the best place in the world to see them',
      'What causes seasons to change and why is summer hotter than winter',
      'Why does the moon appear larger near the horizon than high in the sky',
      // Historical figure questions
      'Who was Isaac Newton and why are his discoveries considered important in science',
      'Who was Nikola Tesla and what were his most important inventions',
      // Process and recovery questions
      'How does a country recover economically after a major natural disaster',
      'How do governments typically respond when inflation rises sharply',
      // Biology and health questions
      'Why do some animals hibernate in winter and what happens to their bodies during that time',
      'How does a vaccine work and why does it protect people from getting sick',
    ],
  },
] as const;
