CREATE TYPE "public"."booking_status" AS ENUM('open', 'partial', 'completed');--> statement-breakpoint
CREATE TYPE "public"."metal" AS ENUM('gold', 'silver');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'bank', 'upi');--> statement-breakpoint
CREATE TYPE "public"."rate_mode" AS ENUM('locked', 'float');--> statement-breakpoint
CREATE TYPE "public"."rate_unit" AS ENUM('per_10g', 'per_kg', 'per_g');--> statement-breakpoint
CREATE TYPE "public"."slip_type" AS ENUM('gst', 'plain');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"metal" "metal" NOT NULL,
	"purity" text NOT NULL,
	"weight_booked_g" numeric(12, 3) NOT NULL,
	"rate_mode" "rate_mode" NOT NULL,
	"locked_rate" numeric(12, 2),
	"rate_unit" "rate_unit" DEFAULT 'per_10g' NOT NULL,
	"advance_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "booking_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"bill_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "collections_bill_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"weight_collected_g" numeric(12, 3) NOT NULL,
	"rate_applied" numeric(12, 2) NOT NULL,
	"payment_mode" "payment_mode" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"slip_type" "slip_type" DEFAULT 'plain' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"gstin" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pin_hash" text,
	"auto_logoff_minutes" integer DEFAULT 7 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"gstin" text,
	"default_gold_rate" numeric(12, 2),
	"default_silver_rate" numeric(12, 2)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;