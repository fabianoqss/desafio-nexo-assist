CREATE SEQUENCE "public"."draft_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 400 CACHE 1;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text NOT NULL,
	"assigned_analyst_id" uuid,
	"handoff_reason" text,
	"handoff_summary" text,
	"handoff_priority" text,
	"handoff_requested_at" timestamp with time zone,
	"handoff_due_at" timestamp with time zone,
	"assumed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"employee_message_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('WITH_AGENT', 'WAITING_ANALYST', 'WITH_ANALYST', 'CLOSED')),
	CONSTRAINT "conversations_handoff_reason_check" CHECK ("conversations"."handoff_reason" in ('EMPLOYEE_REQUEST', 'CRITICAL_CASE', 'OVERDUE_TICKET', 'LOW_CONFIDENCE', 'MESSAGE_LIMIT')),
	CONSTRAINT "conversations_handoff_priority_check" CHECK ("conversations"."handoff_priority" in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "conversations_handoff_fields_check" CHECK (num_nonnulls("conversations"."handoff_reason", "conversations"."handoff_summary", "conversations"."handoff_priority", "conversations"."handoff_requested_at", "conversations"."handoff_due_at") in (0, 5))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messages_author_check" CHECK ("messages"."author" in ('EMPLOYEE', 'AGENT', 'ANALYST', 'SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ticket_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "ticket_drafts_status_check" CHECK ("ticket_drafts"."status" in ('PENDING', 'CONFIRMED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"department" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('EMPLOYEE', 'ANALYST'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_analyst_id_users_id_fk" FOREIGN KEY ("assigned_analyst_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_drafts" ADD CONSTRAINT "ticket_drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_open_per_employee_idx" ON "conversations" USING btree ("employee_id") WHERE "conversations"."status" <> 'CLOSED';--> statement-breakpoint
CREATE INDEX "messages_conversation_id_id_idx" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");