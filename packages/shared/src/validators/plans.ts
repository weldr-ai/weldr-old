import { z } from "zod";

export const taskSchema = z.object({
  id: z.number().describe(`
    Auto-incrementing unique task identifier.
    Always a positive integer starting from 1.
  `),
  summary: z.string().describe(`
    A concise summary of this task.
    Should be a single sentence that captures the essence of the task.

    Examples:
    - Create user database table
    - Build user profile page
    - Add authentication API endpoints
    - Fix login session timeout issue
    - Add email validation to registration form
    - Optimize database query performance
  `),
  description: z.string().describe(`
    Detailed specification for this task, including:
    - Functional requirements and objectives
    - Technical constraints and considerations
    - Expected behavior and outcomes
    - Integration points and dependencies
    - Context about the current state and what needs to change

    Should provide enough context for implementation without ambiguity.

    Examples:
    - "Create a users table to store user accounts with email, name, and authentication data. The table should support unique email constraints and proper password hashing."
    - "Create a user profile page that allows users to view and edit their personal information, including name, email, bio, and profile picture. The page should integrate with the user authentication system."
    - "The login session expires too quickly (currently 15 minutes), causing users to be logged out while actively using the application. Update the session timeout to 2 hours."
  `),
  acceptanceCriteria: z
    .string()
    .array()
    .describe(`
    Specific conditions that must be met for this task to be considered complete.
    Each criterion should be testable and verifiable.
    Each array item is a separate acceptance criterion.

    Examples:
    [
      "Users table exists with all required fields",
      "Email field has unique constraint",
      "Passwords are properly hashed",
      "Users can view their profile information",
      "Profile changes are saved to the database"
    ]
  `),
  dependencies: z
    .number()
    .array()
    .optional()
    .describe(`
    Array of other task IDs that this task depends on.
    These are the direct dependencies that must be completed before this task can be started.

    Examples:
    [] (no dependencies)
    [1] (depends on task 1 to complete first)
    [1, 3] (depends on both tasks 1 and 3 to complete first)
  `),
  implementationNotes: z
    .string()
    .array()
    .optional()
    .describe(`
    Technical implementation guidance specific to this task.
    Should include patterns, conventions, libraries, or architectural decisions to follow.
    Each array item is a separate implementation note.

    Examples:
    [
      "Use Drizzle ORM schema definition in src/db/schema/",
      "Follow existing API endpoint patterns in src/api/routes/",
      "Use shadcn/ui components for consistent styling"
    ]
  `),
  subTasks: z
    .string()
    .array()
    .describe(`
    Implementation guidance broken into specific, actionable pieces for THIS task only.
    Each subtask should be a clear, concrete action that moves toward completing the overall task.
    Each array item is a separate subtask.

    Examples:
    [
      "Define the database schema with all required fields",
      "Add indexes for frequently queried columns",
      "Create the API endpoint for CRUD operations",
      "Build the UI component with form validation",
      "Add loading states and error handling"
    ]
  `),
});

export const planSchema = z.object({
  acceptanceCriteria: z
    .string()
    .array()
    .describe(`
      Plan-level acceptance criteria that validate the entire plan is complete.
      Each array item is a separate acceptance criterion for the overall plan.

      Examples:
      [
        "Users can register with email and password",
        "Users can log in and access protected pages",
        "Password reset functionality works via email",
        "User sessions persist across browser restarts",
        "Admin can view and manage user accounts"
      ]
    `),
  tasks: z.array(taskSchema).describe(`
      Individual high-level tasks that need to be
      implemented to complete this plan. Each task represents a specific
      piece of work with its own specifications and acceptance criteria.
    `),
});
