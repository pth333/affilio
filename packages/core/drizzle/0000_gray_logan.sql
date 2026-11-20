CREATE TABLE "ai_call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" text,
	"video_id" text,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"units" numeric DEFAULT 0 NOT NULL,
	"cost_estimate" numeric,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"prompt" text,
	"output" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"product_id" text,
	"source" text NOT NULL,
	"license" text,
	"cache_key" text,
	"prompt" text,
	"model" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"budget_neurons" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_item" (
	"batch_id" text NOT NULL,
	"product_id" text NOT NULL,
	"video_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	CONSTRAINT "batch_item_batch_id_product_id_pk" PRIMARY KEY("batch_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "experiment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"hypothesis" text NOT NULL,
	"variable" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"conclusion" text
);
--> statement-breakpoint
CREATE TABLE "experiment_variant" (
	"experiment_id" text NOT NULL,
	"video_id" text NOT NULL,
	"variant" text NOT NULL,
	CONSTRAINT "experiment_variant_experiment_id_video_id_pk" PRIMARY KEY("experiment_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "hook_template" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"pattern" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"queue" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"idempotency_key" text,
	"last_error" text,
	"video_id" text,
	"batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "membership_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "metric_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"checkpoint" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"completion_rate" real,
	"clicks" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"revenue" numeric
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"affiliate_url" text NOT NULL,
	"source_url" text,
	"description" text,
	"category" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_id" text NOT NULL,
	"video_version_id" text NOT NULL,
	"platform" text NOT NULL,
	"account" text,
	"url" text,
	"posted_at" timestamp with time zone,
	"ai_label_on" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"workspace_id" text NOT NULL,
	"provider" text NOT NULL,
	"day" text NOT NULL,
	"reserved" numeric DEFAULT 0 NOT NULL,
	"used" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "quota_usage_workspace_id_provider_day_pk" PRIMARY KEY("workspace_id","provider","day")
);
--> statement-breakpoint
CREATE TABLE "render" (
	"id" text PRIMARY KEY NOT NULL,
	"video_version_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"asset_id" text,
	"preset_version" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"video_version_id" text NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_note" (
	"id" text PRIMARY KEY NOT NULL,
	"video_version_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"applied_in_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_cache" (
	"workspace_id" text NOT NULL,
	"scene_hash" text NOT NULL,
	"asset_id" text NOT NULL,
	"preset_version" integer NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_cache_workspace_id_scene_hash_pk" PRIMARY KEY("workspace_id","scene_hash")
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "video" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_version_id" text,
	"approved_version_id" text,
	"template_id" text,
	"template_version" integer,
	"batch_id" text,
	"created_by" text,
	"failed_reason" text,
	"failed_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_check" (
	"id" text PRIMARY KEY NOT NULL,
	"video_version_id" text NOT NULL,
	"rules" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"ai_score" real,
	"ai_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_version" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"parent_version_id" text,
	"spec" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"source" text NOT NULL,
	"author_user_id" text,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_item" ADD CONSTRAINT "batch_item_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_item" ADD CONSTRAINT "batch_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_item" ADD CONSTRAINT "batch_item_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variant" ADD CONSTRAINT "experiment_variant_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variant" ADD CONSTRAINT "experiment_variant_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_template" ADD CONSTRAINT "hook_template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_video_version_id_video_version_id_fk" FOREIGN KEY ("video_version_id") REFERENCES "public"."video_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render" ADD CONSTRAINT "render_video_version_id_video_version_id_fk" FOREIGN KEY ("video_version_id") REFERENCES "public"."video_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render" ADD CONSTRAINT "render_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_video_version_id_video_version_id_fk" FOREIGN KEY ("video_version_id") REFERENCES "public"."video_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_note" ADD CONSTRAINT "review_note_video_version_id_video_version_id_fk" FOREIGN KEY ("video_version_id") REFERENCES "public"."video_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_note" ADD CONSTRAINT "review_note_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_cache" ADD CONSTRAINT "scene_cache_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_cache" ADD CONSTRAINT "scene_cache_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_check" ADD CONSTRAINT "video_check_video_version_id_video_version_id_fk" FOREIGN KEY ("video_version_id") REFERENCES "public"."video_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_version" ADD CONSTRAINT "video_version_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_version" ADD CONSTRAINT "video_version_author_user_id_app_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_log_ws_created_idx" ON "ai_call_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_log_video_idx" ON "ai_call_log" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_ws_sha_uq" ON "asset" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_ws_cache_key_uq" ON "asset" USING btree ("workspace_id","cache_key") WHERE cache_key is not null;--> statement-breakpoint
CREATE INDEX "asset_ws_kind_idx" ON "asset" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "asset_product_idx" ON "asset" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "audit_log_ws_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "batch_ws_created_idx" ON "batch" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "experiment_ws_idx" ON "experiment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "hook_template_ws_idx" ON "hook_template" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("queue","priority","run_after") WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_status_locked_idx" ON "jobs" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "metric_snapshot_pub_taken_idx" ON "metric_snapshot" USING btree ("publication_id","taken_at");--> statement-breakpoint
CREATE INDEX "product_ws_created_idx" ON "product" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "publication_ws_posted_idx" ON "publication" USING btree ("workspace_id","posted_at");--> statement-breakpoint
CREATE INDEX "publication_video_idx" ON "publication" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "render_version_kind_idx" ON "render" USING btree ("video_version_id","kind");--> statement-breakpoint
CREATE INDEX "review_version_idx" ON "review" USING btree ("video_version_id");--> statement-breakpoint
CREATE INDEX "review_note_version_status_idx" ON "review_note" USING btree ("video_version_id","status");--> statement-breakpoint
CREATE INDEX "template_ws_status_idx" ON "template" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "video_ws_status_updated_idx" ON "video" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "video_product_idx" ON "video" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "video_check_version_idx" ON "video_check" USING btree ("video_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_version_video_no_uq" ON "video_version" USING btree ("video_id","version_no");