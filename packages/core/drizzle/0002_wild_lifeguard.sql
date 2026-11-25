CREATE TABLE "script" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text NOT NULL,
	"template_id" text,
	"template_version" integer,
	"origin" text NOT NULL,
	"status" text DEFAULT 'writing' NOT NULL,
	"current_version_id" text,
	"failed_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_version" (
	"id" text PRIMARY KEY NOT NULL,
	"script_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"parent_version_id" text,
	"spec" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"source" text NOT NULL,
	"rules" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"author_user_id" text,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "script_id" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "script_version_id" text;--> statement-breakpoint
ALTER TABLE "script" ADD CONSTRAINT "script_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script" ADD CONSTRAINT "script_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script" ADD CONSTRAINT "script_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_version" ADD CONSTRAINT "script_version_script_id_script_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_version" ADD CONSTRAINT "script_version_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_ws_status_updated_idx" ON "script" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "script_product_idx" ON "script" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "script_version_script_no_uq" ON "script_version" USING btree ("script_id","version_no");--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_script_id_script_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script"("id") ON DELETE no action ON UPDATE no action;