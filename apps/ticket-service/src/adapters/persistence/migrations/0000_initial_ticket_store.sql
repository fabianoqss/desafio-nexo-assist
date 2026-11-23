CREATE SEQUENCE "public"."inc_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 20400 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."req_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10500 CACHE 1;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"actor_id" uuid NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"ticket_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_actor_id_key_pk" PRIMARY KEY("actor_id","key")
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ticket_events_kind_check" CHECK ("ticket_events"."kind" in ('CREATED', 'INFO_ADDED', 'REOPENED', 'TRANSFERRED', 'ASSUMED', 'UPDATED', 'RESOLVED'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"item" text,
	"impact" text NOT NULL,
	"urgency" text NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"requester_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_update_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "tickets_type_check" CHECK ("tickets"."type" in ('INC', 'REQ')),
	CONSTRAINT "tickets_category_check" CHECK ("tickets"."category" in ('ACCESS', 'NETWORK_VPN', 'HARDWARE', 'SOFTWARE', 'EMAIL', 'OTHER')),
	CONSTRAINT "tickets_impact_check" CHECK ("tickets"."impact" in ('SELF', 'TEAM', 'COMPANY')),
	CONSTRAINT "tickets_urgency_check" CHECK ("tickets"."urgency" in ('BLOCKED', 'SAME_DAY_COMMITMENT', 'HAS_WORKAROUND', 'NO_URGENCY')),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('OPEN', 'IN_PROGRESS', 'WAITING_ANALYST', 'APPROVED', 'RESOLVED'))
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_id_idx" ON "ticket_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_requester_last_update_idx" ON "tickets" USING btree ("requester_id","last_update_at" DESC NULLS LAST);