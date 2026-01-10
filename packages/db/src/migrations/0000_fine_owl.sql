CREATE TYPE "public"."message_roles" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."message_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model_key" text NOT NULL,
	"input_tokens_price" numeric(10, 3) NOT NULL,
	"output_tokens_price" numeric(10, 3) NOT NULL,
	"input_images_price" numeric(10, 3),
	"context_window" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_provider_model" UNIQUE("provider","model_key")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean,
	"seats" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_id" text NOT NULL,
	"type" text DEFAULT 'stream' NOT NULL,
	"parent_branch_id" text,
	"forked_from_version_id" text,
	"forkset_id" text,
	"head_version_id" text,
	"is_main" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "branches_name_unique" UNIQUE("project_id","name"),
	CONSTRAINT "branches_main_no_fork_chk" CHECK ((NOT "branches"."is_main" OR "branches"."forked_from_version_id" IS NULL)),
	CONSTRAINT "branches_variant_requirements_chk" CHECK (("branches"."type" <> 'variant' OR ("branches"."forked_from_version_id" IS NOT NULL AND "branches"."forkset_id" IS NOT NULL))),
	CONSTRAINT "branches_stream_no_forkset_chk" CHECK (("branches"."type" <> 'stream' OR "branches"."forkset_id" IS NULL)),
	CONSTRAINT "branches_stream_parent_requires_fork_chk" CHECK ((NOT ("branches"."type" = 'stream' AND "branches"."is_main" = false AND "branches"."parent_branch_id" IS NOT NULL) OR "branches"."forked_from_version_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "message_roles" DEFAULT 'assistant' NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declaration_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"uri" text,
	"path" text,
	"metadata" jsonb,
	"embedding" vector(1536),
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"integration_template_id" text NOT NULL,
	CONSTRAINT "declaration_template_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "declarations" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"uri" text,
	"path" text,
	"progress" text NOT NULL,
	"metadata" jsonb,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"previous_id" text,
	"task_id" text,
	"project_id" text NOT NULL,
	"node_id" text,
	"user_id" text NOT NULL,
	CONSTRAINT "declaration_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "dependencies" (
	"dependent_id" text NOT NULL,
	"dependency_id" text NOT NULL,
	CONSTRAINT "dependencies_dependent_id_dependency_id_pk" PRIMARY KEY("dependent_id","dependency_id")
);
--> statement-breakpoint
CREATE TABLE "environment_variables" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"secret_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "unique_key" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "integration_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"recommended_integrations" jsonb NOT NULL,
	"dependencies" jsonb,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"variables" jsonb,
	"options" jsonb,
	"recommended_options" jsonb,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"category_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_environment_variables" (
	"map_to" text NOT NULL,
	"integration_id" text NOT NULL,
	"environment_variable_id" text NOT NULL,
	CONSTRAINT "integration_environment_variables_integration_id_environment_variable_id_map_to_pk" PRIMARY KEY("integration_id","environment_variable_id","map_to")
);
--> statement-breakpoint
CREATE TABLE "integration_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"version_id" text NOT NULL,
	"status" text DEFAULT 'installing' NOT NULL,
	"installed_at" timestamp,
	"installation_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"options" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"integration_template_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"position" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"description" text,
	"subdomain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "projects_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"dependent_id" text NOT NULL,
	"dependency_id" text NOT NULL,
	CONSTRAINT "task_dependencies_dependent_id_dependency_id_pk" PRIMARY KEY("dependent_id","dependency_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"data" jsonb NOT NULL,
	"version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_declarations" (
	"version_id" text NOT NULL,
	"declaration_id" text NOT NULL,
	CONSTRAINT "version_declarations_version_id_declaration_id_pk" PRIMARY KEY("version_id","declaration_id")
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"parent_version_id" text,
	"snapshot_path" text,
	"kind" text DEFAULT 'checkpoint' NOT NULL,
	"commit_hash" text,
	"number" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"message" text,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"acceptance_criteria" jsonb,
	"changed_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_from_branch_id" text,
	"reverted_version_id" text,
	"published_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "versions_revert_link_chk" CHECK ((("versions"."kind" <> 'revert') OR "versions"."reverted_version_id" IS NOT NULL)
             AND (("versions"."kind" = 'revert') OR "versions"."reverted_version_id" IS NULL)),
	CONSTRAINT "versions_integration_link_chk" CHECK ((("versions"."kind" <> 'integration') OR "versions"."applied_from_branch_id" IS NOT NULL)
             AND (("versions"."kind" = 'integration') OR "versions"."applied_from_branch_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_parent_branch_id_branches_id_fk" FOREIGN KEY ("parent_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_forked_from_version_id_versions_id_fk" FOREIGN KEY ("forked_from_version_id") REFERENCES "public"."versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_head_version_id_versions_id_fk" FOREIGN KEY ("head_version_id") REFERENCES "public"."versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_templates" ADD CONSTRAINT "declaration_templates_integration_template_id_integration_templates_id_fk" FOREIGN KEY ("integration_template_id") REFERENCES "public"."integration_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_previous_id_declarations_id_fk" FOREIGN KEY ("previous_id") REFERENCES "public"."declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_dependent_id_declarations_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_dependency_id_declarations_id_fk" FOREIGN KEY ("dependency_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "vault"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_templates" ADD CONSTRAINT "integration_templates_category_id_integration_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."integration_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_environment_variables" ADD CONSTRAINT "integration_environment_variables_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_environment_variables" ADD CONSTRAINT "integration_environment_variables_environment_variable_id_environment_variables_id_fk" FOREIGN KEY ("environment_variable_id") REFERENCES "public"."environment_variables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_installations" ADD CONSTRAINT "integration_installations_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_installations" ADD CONSTRAINT "integration_installations_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_integration_template_id_integration_templates_id_fk" FOREIGN KEY ("integration_template_id") REFERENCES "public"."integration_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_id_tasks_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependency_id_tasks_id_fk" FOREIGN KEY ("dependency_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_declarations" ADD CONSTRAINT "version_declarations_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_declarations" ADD CONSTRAINT "version_declarations_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_parent_version_id_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_applied_from_branch_id_branches_id_fk" FOREIGN KEY ("applied_from_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_reverted_version_id_versions_id_fk" FOREIGN KEY ("reverted_version_id") REFERENCES "public"."versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_project_idx" ON "branches" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "branches_parent_fork_idx" ON "branches" USING btree ("parent_branch_id","forked_from_version_id");--> statement-breakpoint
CREATE INDEX "branches_forkset_idx" ON "branches" USING btree ("forkset_id");--> statement-breakpoint
CREATE INDEX "branches_head_idx" ON "branches" USING btree ("head_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_one_main_per_project_uidx" ON "branches" USING btree ("project_id") WHERE "branches"."is_main" = true;--> statement-breakpoint
CREATE INDEX "attachments_created_at_idx" ON "attachments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chats_created_at_idx" ON "chats" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "streams_chat_id_idx" ON "streams" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "declaration_template_created_at_idx" ON "declaration_templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "declaration_template_embedding_idx" ON "declaration_templates" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "declaration_created_at_idx" ON "declarations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "embeddingIndex" ON "declarations" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "integration_categories_created_at_idx" ON "integration_categories" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_categories_key_idx" ON "integration_categories" USING btree ("key");--> statement-breakpoint
CREATE INDEX "integration_templates_created_at_idx" ON "integration_templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "integration_templates_category_id_idx" ON "integration_templates" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_templates_key_version_idx" ON "integration_templates" USING btree ("key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_installations_unique_idx" ON "integration_installations" USING btree ("integration_id","version_id");--> statement-breakpoint
CREATE INDEX "integration_installations_version_idx" ON "integration_installations" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "integration_installations_integration_idx" ON "integration_installations" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "integration_installations_status_idx" ON "integration_installations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integrations_created_at_idx" ON "integrations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nodes_created_at_idx" ON "nodes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_dependencies_dependent_id_idx" ON "task_dependencies" USING btree ("dependent_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_dependency_id_idx" ON "task_dependencies" USING btree ("dependency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "version_number_unique_idx" ON "versions" USING btree ("project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "version_sequence_number_unique_idx" ON "versions" USING btree ("branch_id","sequence_number");--> statement-breakpoint
CREATE INDEX "versions_created_at_idx" ON "versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "versions_chat_id_idx" ON "versions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "versions_branch_created_idx" ON "versions" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_commit_hash_uidx" ON "versions" USING btree ("commit_hash") WHERE commit_hash IS NOT NULL;
