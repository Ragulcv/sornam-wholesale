CREATE TYPE "public"."book_mode" AS ENUM('metal', 'amount');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('open', 'partial', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."line_kind" AS ENUM('sale', 'sale_return', 'purchase', 'purchase_return');--> statement-breakpoint
CREATE TYPE "public"."metal" AS ENUM('gold', 'silver');--> statement-breakpoint
CREATE TYPE "public"."move_dir" AS ENUM('received', 'paid');--> statement-breakpoint
CREATE TYPE "public"."pay_mode" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."trn_type" AS ENUM('booking', 'sales', 'purchase', 'expense');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "bookings_serial_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"party_id" uuid NOT NULL,
	"metal" "metal" NOT NULL,
	"book_mode" "book_mode" NOT NULL,
	"weight_booked" numeric(12, 3),
	"locked_rate" numeric(12, 2),
	"amount" numeric(14, 2),
	"advance_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "booking_status" DEFAULT 'open' NOT NULL,
	"delivered_txn_id" uuid,
	"created_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metal_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"direction" "move_dir" NOT NULL,
	"particulars" text,
	"weight" numeric(12, 3) NOT NULL,
	"touch" numeric(6, 3),
	"a_touch" numeric(6, 3),
	"pure" numeric(12, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"gstin" text,
	"type" text DEFAULT 'customer' NOT NULL,
	"opening_pure_gold" numeric(14, 3) DEFAULT '0' NOT NULL,
	"opening_pure_silver" numeric(14, 3) DEFAULT '0' NOT NULL,
	"opening_cash" numeric(14, 2) DEFAULT '0' NOT NULL,
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
	"tax_percent" numeric(5, 2) DEFAULT '3' NOT NULL,
	"tds_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"default_gold_rate" numeric(12, 2),
	"default_silver_rate" numeric(12, 2),
	"price_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"mode" "pay_mode" NOT NULL,
	"direction" "move_dir" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"bank_name" text
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"opening_pure_gold" numeric(14, 3) DEFAULT '0' NOT NULL,
	"opening_pure_silver" numeric(14, 3) DEFAULT '0' NOT NULL,
	"opening_cash" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_bank" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"kind" "line_kind" NOT NULL,
	"particulars" text,
	"weight" numeric(12, 3) NOT NULL,
	"touch" numeric(6, 3),
	"pure" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "transactions_serial_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trn_type" "trn_type" NOT NULL,
	"party_id" uuid,
	"metal" "metal" NOT NULL,
	"txn_date" timestamp with time zone DEFAULT now() NOT NULL,
	"bar_rate" numeric(12, 2),
	"ref_no" text,
	"thru" text,
	"narration" text,
	"tds_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_by" text,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metal_movements" ADD CONSTRAINT "metal_movements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;