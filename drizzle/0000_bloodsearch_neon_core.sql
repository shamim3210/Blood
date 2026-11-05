CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(24) NOT NULL,
	"permissions_json" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"granted_by_uid" varchar(128),
	"revoked_by_uid" varchar(128),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_admin_role_type" CHECK ("admin_roles"."role" IN ('SUPER_ADMIN', 'CO_ADMIN', 'MODERATOR'))
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_type" varchar(24) DEFAULT 'BROADCAST' NOT NULL,
	"title" varchar(220) NOT NULL,
	"body" text NOT NULL,
	"priority" varchar(20) DEFAULT 'INFO' NOT NULL,
	"target_version" varchar(32),
	"apk_download_url" text,
	"force_update" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"author_uid" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_announcements_priority" CHECK ("announcements"."priority" IN ('INFO', 'WARNING', 'CRITICAL')),
	CONSTRAINT "chk_announcements_type" CHECK ("announcements"."announcement_type" IN ('BROADCAST', 'OTA_APP_UPDATE'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_uid" varchar(128),
	"actor_role" varchar(28) DEFAULT 'USER' NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_entity_type" varchar(48) NOT NULL,
	"target_entity_id" varchar(128) NOT NULL,
	"outcome" varchar(20) DEFAULT 'SUCCESS' NOT NULL,
	"ip_hash" varchar(64),
	"details_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_audit_outcome" CHECK ("audit_logs"."outcome" IN ('SUCCESS', 'DENIED', 'ERROR'))
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_subject" varchar(255) NOT NULL,
	"email" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_reset_token_hash" varchar(128),
	"password_reset_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_auth_provider_type" CHECK ("auth_identities"."provider" IN ('GOOGLE_OIDC', 'EMAIL_PASSWORD', 'PHONE_OTP')),
	CONSTRAINT "chk_auth_failed_non_negative" CHECK ("auth_identities"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blood_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"hospital_id" uuid,
	"district" varchar(80) NOT NULL,
	"address" text NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"license_number" varchar(80),
	"latitude" double precision,
	"longitude" double precision,
	"is_24_hours" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blood_bank_id" uuid NOT NULL,
	"blood_group" varchar(5) NOT NULL,
	"component_type" varchar(32) DEFAULT 'WHOLE_BLOOD' NOT NULL,
	"units_available" integer DEFAULT 0 NOT NULL,
	"units_reserved" integer DEFAULT 0 NOT NULL,
	"critical_threshold" integer DEFAULT 5 NOT NULL,
	"stock_status" varchar(20) DEFAULT 'ADEQUATE' NOT NULL,
	"updated_by_uid" varchar(128),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_blood_group" CHECK ("blood_inventory"."blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
	CONSTRAINT "chk_inventory_units_non_negative" CHECK ("blood_inventory"."units_available" >= 0 AND "blood_inventory"."units_reserved" >= 0 AND "blood_inventory"."critical_threshold" >= 0),
	CONSTRAINT "chk_inventory_stock_status" CHECK ("blood_inventory"."stock_status" IN ('ADEQUATE', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'))
);
--> statement-breakpoint
CREATE TABLE "blood_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_uid" varchar(128) NOT NULL,
	"target_donor_uid" varchar(128),
	"patient_name" varchar(160) NOT NULL,
	"patient_age" integer,
	"patient_gender" varchar(20),
	"hemoglobin" double precision,
	"blood_group" varchar(5) NOT NULL,
	"bags_needed" integer DEFAULT 1 NOT NULL,
	"bags_fulfilled" integer DEFAULT 0 NOT NULL,
	"is_platelet_request" boolean DEFAULT false NOT NULL,
	"urgency" varchar(20) DEFAULT 'URGENT' NOT NULL,
	"required_window" varchar(32) DEFAULT 'IMMEDIATE',
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"hospital_id" uuid,
	"hospital_name" varchar(220) NOT NULL,
	"district" varchar(80) NOT NULL,
	"area" varchar(180) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"needed_at" timestamp with time zone,
	"clinical_reason" text,
	"requisition_slip_verified" boolean DEFAULT false NOT NULL,
	"hospital_slip_data_url" text,
	"contact_name" varchar(140),
	"contact_phone_private" varchar(28),
	"share_direct_contact" boolean DEFAULT false NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"search_radius_km" integer DEFAULT 5 NOT NULL,
	"responders_count" integer DEFAULT 0 NOT NULL,
	"resolved_by_uid" varchar(128),
	"resolved_at" timestamp with time zone,
	"resolution_reason" varchar(160),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_request_blood_group" CHECK ("blood_requests"."blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
	CONSTRAINT "chk_request_urgency" CHECK ("blood_requests"."urgency" IN ('CRITICAL', 'URGENT', 'STANDARD')),
	CONSTRAINT "chk_request_status" CHECK ("blood_requests"."status" IN ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "chk_request_bags_range" CHECK ("blood_requests"."bags_needed" >= 1 AND "blood_requests"."bags_needed" <= 20 AND "blood_requests"."bags_fulfilled" >= 0),
	CONSTRAINT "chk_request_escalation_range" CHECK ("blood_requests"."escalation_level" >= 0 AND "blood_requests"."escalation_level" <= 4)
);
--> statement-breakpoint
CREATE TABLE "community_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_uid" varchar(128) NOT NULL,
	"sender_name" varchar(140) NOT NULL,
	"sender_avatar" text,
	"sender_role" varchar(32) DEFAULT 'DONOR',
	"is_verified_donor" boolean DEFAULT false NOT NULL,
	"sender_blood_group" varchar(5),
	"district" varchar(80),
	"message_text" text NOT NULL,
	"attachment_type" varchar(24),
	"attachment_json" jsonb,
	"reply_to_id" varchar(80),
	"reply_to_name" varchar(140),
	"reply_to_text" text,
	"reactions_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_uid" varchar(128) NOT NULL,
	"requester_name" varchar(140) NOT NULL,
	"donor_uid" varchar(128) NOT NULL,
	"donor_name" varchar(140) NOT NULL,
	"blood_group" varchar(5) NOT NULL,
	"related_request_id" uuid,
	"channel_requested" varchar(24) DEFAULT 'ALL' NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_contact_requests_status" CHECK ("contact_requests"."status" IN ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED')),
	CONSTRAINT "chk_contact_requests_channel" CHECK ("contact_requests"."channel_requested" IN ('CALL', 'SMS', 'WHATSAPP', 'FACEBOOK', 'ALL'))
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"push_token" text NOT NULL,
	"platform" varchar(24) DEFAULT 'WEB_PWA' NOT NULL,
	"device_label" varchar(140),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_device_platform" CHECK ("device_tokens"."platform" IN ('WEB_PWA', 'ANDROID_APK', 'IOS_WEB'))
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar(160) NOT NULL,
	"sender_uid" varchar(128) NOT NULL,
	"sender_name" varchar(140),
	"sender_blood_group" varchar(5),
	"message_text" text NOT NULL,
	"attachment_type" varchar(24),
	"metadata_json" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_chat_rooms" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"participant_one_uid" varchar(128) NOT NULL,
	"participant_two_uid" varchar(128) NOT NULL,
	"participant_names_json" jsonb DEFAULT '{}'::jsonb,
	"participant_avatars_json" jsonb DEFAULT '{}'::jsonb,
	"participant_blood_groups_json" jsonb DEFAULT '{}'::jsonb,
	"related_request_id" uuid,
	"hospital_name" varchar(200),
	"last_message_preview" text,
	"last_sender_uid" varchar(128),
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_uid" varchar(128) NOT NULL,
	"request_id" uuid,
	"hospital_id" uuid,
	"hospital_name" varchar(200) NOT NULL,
	"blood_group" varchar(5) NOT NULL,
	"units_donated" integer DEFAULT 1 NOT NULL,
	"donated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cooldown_until" timestamp with time zone NOT NULL,
	"verified_by_uid" varchar(128),
	"certificate_code" varchar(64),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_donations_blood_group" CHECK ("donations"."blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
	CONSTRAINT "chk_donations_units" CHECK ("donations"."units_donated" >= 1 AND "donations"."units_donated" <= 4)
);
--> statement-breakpoint
CREATE TABLE "donor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"donor_smart_id" varchar(40) NOT NULL,
	"public_name" varchar(140) NOT NULL,
	"avatar_url" text,
	"blood_group" varchar(5) NOT NULL,
	"age" integer,
	"gender" varchar(20),
	"weight_kg" integer,
	"district" varchar(80) NOT NULL,
	"upazila" varchar(100),
	"area" varchar(180) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"availability_status" varchar(24) DEFAULT 'AVAILABLE' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"last_donation_date" timestamp with time zone,
	"next_eligible_date" timestamp with time zone,
	"total_donations" integer DEFAULT 0 NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"medical_declaration_accepted" boolean DEFAULT false NOT NULL,
	"share_direct_contact" boolean DEFAULT false NOT NULL,
	"contact_preference" varchar(24) DEFAULT 'IN_APP_ONLY' NOT NULL,
	"masked_phone_hint" varchar(32),
	"has_whatsapp" boolean DEFAULT false NOT NULL,
	"has_facebook" boolean DEFAULT false NOT NULL,
	"rating" double precision DEFAULT 5 NOT NULL,
	"response_rate_percent" integer DEFAULT 100 NOT NULL,
	"avg_response_minutes" integer DEFAULT 10 NOT NULL,
	"bio" text,
	"last_availability_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_donor_blood_group" CHECK ("donor_profiles"."blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
	CONSTRAINT "chk_donor_age_range" CHECK ("donor_profiles"."age" IS NULL OR ("donor_profiles"."age" >= 18 AND "donor_profiles"."age" <= 65)),
	CONSTRAINT "chk_donor_lat_range" CHECK ("donor_profiles"."latitude" IS NULL OR ("donor_profiles"."latitude" >= -90 AND "donor_profiles"."latitude" <= 90)),
	CONSTRAINT "chk_donor_lng_range" CHECK ("donor_profiles"."longitude" IS NULL OR ("donor_profiles"."longitude" >= -180 AND "donor_profiles"."longitude" <= 180)),
	CONSTRAINT "chk_donor_availability_status" CHECK ("donor_profiles"."availability_status" IN ('AVAILABLE', 'BUSY', 'OFFLINE', 'COOLDOWN')),
	CONSTRAINT "chk_donor_contact_preference" CHECK ("donor_profiles"."contact_preference" IN ('CALL_ALLOWED', 'WHATSAPP_ONLY', 'IN_APP_ONLY', 'DND')),
	CONSTRAINT "chk_donor_total_donations" CHECK ("donor_profiles"."total_donations" >= 0)
);
--> statement-breakpoint
CREATE TABLE "emergency_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"target_donor_uid" varchar(128),
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"radius_km" integer DEFAULT 5 NOT NULL,
	"channel" varchar(24) DEFAULT 'IN_APP' NOT NULL,
	"alert_state" varchar(28) DEFAULT 'DISPATCHED' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(255),
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	CONSTRAINT "chk_emergency_alert_channel" CHECK ("emergency_alerts"."channel" IN ('IN_APP', 'WEB_PUSH', 'SMS_FALLBACK')),
	CONSTRAINT "chk_emergency_alert_state" CHECK ("emergency_alerts"."alert_state" IN ('DISPATCHED', 'DELIVERED', 'FAILED_RETRYABLE', 'ACKNOWLEDGED', 'STOPPED_RESOLVED', 'EXPIRED')),
	CONSTRAINT "chk_emergency_alert_retries" CHECK ("emergency_alerts"."retry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gratitude_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_uid" varchar(128) NOT NULL,
	"author_name" varchar(140) NOT NULL,
	"honored_donor_uid" varchar(128),
	"honored_donor_name" varchar(140),
	"blood_group" varchar(5),
	"district" varchar(80),
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(140) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_bn" varchar(200),
	"district" varchar(80) NOT NULL,
	"upazila" varchar(100),
	"address" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"emergency_phone" varchar(32),
	"blood_bank_phone" varchar(32),
	"hospital_type" varchar(32) DEFAULT 'GOVERNMENT' NOT NULL,
	"has_blood_bank" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_hospitals_type" CHECK ("hospitals"."hospital_type" IN ('GOVERNMENT', 'PRIVATE', 'MEDICAL_COLLEGE', 'SPECIALIZED', 'NON_PROFIT'))
);
--> statement-breakpoint
CREATE TABLE "live_donor_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"donor_uid" varchar(128) NOT NULL,
	"requester_uid" varchar(128) NOT NULL,
	"donor_name" varchar(140) NOT NULL,
	"blood_group" varchar(5) NOT NULL,
	"current_lat" double precision NOT NULL,
	"current_lng" double precision NOT NULL,
	"hospital_lat" double precision,
	"hospital_lng" double precision,
	"eta_minutes" integer,
	"distance_km" double precision,
	"trip_status" varchar(24) DEFAULT 'EN_ROUTE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_live_trips_status" CHECK ("live_donor_trips"."trip_status" IN ('EN_ROUTE', 'ARRIVED', 'COMPLETED', 'STOPPED'))
);
--> statement-breakpoint
CREATE TABLE "login_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"session_token_hash" varchar(128) NOT NULL,
	"csrf_token_hash" varchar(128) NOT NULL,
	"auth_method" varchar(32) NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"user_agent_summary" varchar(255),
	"is_admin_console" boolean DEFAULT false NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_reason" varchar(120),
	"rotated_from_session_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_uid" varchar(128) NOT NULL,
	"notification_type" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"related_request_id" uuid,
	"delivery_status" varchar(24) DEFAULT 'DELIVERED' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(255),
	"metadata_json" jsonb DEFAULT '{}'::jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_notifications_delivery_status" CHECK ("notifications"."delivery_status" IN ('DELIVERED', 'FAILED_RETRYABLE', 'RETRIED_DELIVERED'))
);
--> statement-breakpoint
CREATE TABLE "oidc_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce_hash" varchar(128) NOT NULL,
	"state_hash" varchar(128),
	"ip_hash" varchar(64) NOT NULL,
	"redirect_origin" varchar(255),
	"is_consumed" boolean DEFAULT false NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_contacts" (
	"user_uid" varchar(128) PRIMARY KEY NOT NULL,
	"phone_e164" varchar(24) NOT NULL,
	"whatsapp_number" varchar(24),
	"alternate_phone" varchar(24),
	"facebook_profile_url" text,
	"emergency_contact_name" varchar(140),
	"emergency_contact_phone" varchar(24),
	"exact_street_address" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"contact_visibility" varchar(28) DEFAULT 'REQUEST_ONLY' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_private_contact_visibility" CHECK ("private_contacts"."contact_visibility" IN ('PUBLIC_OPT_IN', 'REQUEST_ONLY', 'EMERGENCY_VERIFIED_ONLY', 'DND_PRIVATE'))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket_key" varchar(180) PRIMARY KEY NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone,
	CONSTRAINT "chk_rate_limit_hits" CHECK ("rate_limit_buckets"."hit_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_uid" varchar(128) NOT NULL,
	"reporter_name" varchar(140),
	"accused_uid" varchar(128),
	"accused_name" varchar(140),
	"accused_phone_hash" varchar(64),
	"category" varchar(48) DEFAULT 'ILLEGAL_MONEY_DEMAND' NOT NULL,
	"description" text NOT NULL,
	"status" varchar(24) DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"reviewed_by_uid" varchar(128),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_reports_status" CHECK ("reports"."status" IN ('OPEN', 'UNDER_REVIEW', 'ACTION_TAKEN', 'DISMISSED'))
);
--> statement-breakpoint
CREATE TABLE "request_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"donor_uid" varchar(128) NOT NULL,
	"donor_name" varchar(140) NOT NULL,
	"donor_blood_group" varchar(5) NOT NULL,
	"response_status" varchar(28) DEFAULT 'ACCEPTED' NOT NULL,
	"eta_minutes" integer,
	"note" text,
	"donor_latitude" double precision,
	"donor_longitude" double precision,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_response_status" CHECK ("request_responses"."response_status" IN ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DONATED', 'DECLINED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" varchar(128) NOT NULL,
	"counterparty_uid" varchar(128),
	"related_request_id" uuid,
	"consent_type" varchar(40) NOT NULL,
	"status" varchar(24) DEFAULT 'GRANTED' NOT NULL,
	"policy_version" varchar(24) DEFAULT '3.0.0' NOT NULL,
	"reason" text,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_user_consent_status" CHECK ("user_consents"."status" IN ('PENDING', 'GRANTED', 'DENIED', 'REVOKED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"uid" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_hint" varchar(32),
	"display_name" varchar(140) NOT NULL,
	"photo_url" text,
	"blood_group" varchar(5),
	"district" varchar(80),
	"area" varchar(160),
	"account_status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"auth_provider" varchar(40) DEFAULT 'GOOGLE_OIDC' NOT NULL,
	"preferred_language" varchar(8) DEFAULT 'bn' NOT NULL,
	"family_circle_json" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_users_blood_group" CHECK ("users"."blood_group" IS NULL OR "users"."blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
	CONSTRAINT "chk_users_account_status" CHECK ("users"."account_status" IN ('ACTIVE', 'SUSPENDED', 'DELETED'))
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_uid" varchar(128),
	"related_request_id" uuid,
	"verification_type" varchar(40) NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"proof_hash" varchar(128),
	"evidence_summary" text,
	"reviewed_by_uid" varchar(128),
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_verification_status" CHECK ("verification_records"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED'))
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_uid_users_uid_fk" FOREIGN KEY ("granted_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_revoked_by_uid_users_uid_fk" FOREIGN KEY ("revoked_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_uid_users_uid_fk" FOREIGN KEY ("author_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_banks" ADD CONSTRAINT "blood_banks_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_inventory" ADD CONSTRAINT "blood_inventory_blood_bank_id_blood_banks_id_fk" FOREIGN KEY ("blood_bank_id") REFERENCES "public"."blood_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_inventory" ADD CONSTRAINT "blood_inventory_updated_by_uid_users_uid_fk" FOREIGN KEY ("updated_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_requester_uid_users_uid_fk" FOREIGN KEY ("requester_uid") REFERENCES "public"."users"("uid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_target_donor_uid_users_uid_fk" FOREIGN KEY ("target_donor_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_resolved_by_uid_users_uid_fk" FOREIGN KEY ("resolved_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_sender_uid_users_uid_fk" FOREIGN KEY ("sender_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_requester_uid_users_uid_fk" FOREIGN KEY ("requester_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_donor_uid_users_uid_fk" FOREIGN KEY ("donor_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_related_request_id_blood_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_room_id_direct_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."direct_chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_uid_users_uid_fk" FOREIGN KEY ("sender_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_chat_rooms" ADD CONSTRAINT "direct_chat_rooms_participant_one_uid_users_uid_fk" FOREIGN KEY ("participant_one_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_chat_rooms" ADD CONSTRAINT "direct_chat_rooms_participant_two_uid_users_uid_fk" FOREIGN KEY ("participant_two_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_chat_rooms" ADD CONSTRAINT "direct_chat_rooms_related_request_id_blood_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_uid_users_uid_fk" FOREIGN KEY ("donor_uid") REFERENCES "public"."users"("uid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_verified_by_uid_users_uid_fk" FOREIGN KEY ("verified_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_profiles" ADD CONSTRAINT "donor_profiles_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_target_donor_uid_users_uid_fk" FOREIGN KEY ("target_donor_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratitude_notes" ADD CONSTRAINT "gratitude_notes_author_uid_users_uid_fk" FOREIGN KEY ("author_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratitude_notes" ADD CONSTRAINT "gratitude_notes_honored_donor_uid_users_uid_fk" FOREIGN KEY ("honored_donor_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_donor_trips" ADD CONSTRAINT "live_donor_trips_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_donor_trips" ADD CONSTRAINT "live_donor_trips_donor_uid_users_uid_fk" FOREIGN KEY ("donor_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_donor_trips" ADD CONSTRAINT "live_donor_trips_requester_uid_users_uid_fk" FOREIGN KEY ("requester_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_uid_users_uid_fk" FOREIGN KEY ("recipient_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_request_id_blood_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_contacts" ADD CONSTRAINT "private_contacts_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_uid_users_uid_fk" FOREIGN KEY ("reporter_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_accused_uid_users_uid_fk" FOREIGN KEY ("accused_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_uid_users_uid_fk" FOREIGN KEY ("reviewed_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_donor_uid_users_uid_fk" FOREIGN KEY ("donor_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_counterparty_uid_users_uid_fk" FOREIGN KEY ("counterparty_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_related_request_id_blood_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_subject_uid_users_uid_fk" FOREIGN KEY ("subject_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_related_request_id_blood_requests_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."blood_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_reviewed_by_uid_users_uid_fk" FOREIGN KEY ("reviewed_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admin_roles_user_uid" ON "admin_roles" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "idx_admin_roles_active_role" ON "admin_roles" USING btree ("is_active","role");--> statement-breakpoint
CREATE INDEX "idx_announcements_active_type_created" ON "announcements" USING btree ("is_active","announcement_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_created" ON "audit_logs" USING btree ("actor_uid","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action_outcome" ON "audit_logs" USING btree ("action","outcome","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target" ON "audit_logs" USING btree ("target_entity_type","target_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auth_identities_provider_sub" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "idx_auth_identities_user_uid" ON "auth_identities" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "idx_auth_identities_reset_hash" ON "auth_identities" USING btree ("password_reset_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_blood_banks_code" ON "blood_banks" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_blood_banks_district" ON "blood_banks" USING btree ("district","is_verified");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_bank_group_comp" ON "blood_inventory" USING btree ("blood_bank_id","blood_group","component_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_group_status" ON "blood_inventory" USING btree ("blood_group","stock_status");--> statement-breakpoint
CREATE INDEX "idx_requests_status_bg_district" ON "blood_requests" USING btree ("status","blood_group","district");--> statement-breakpoint
CREATE INDEX "idx_requests_requester_created" ON "blood_requests" USING btree ("requester_uid","created_at");--> statement-breakpoint
CREATE INDEX "idx_requests_geo" ON "blood_requests" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "idx_requests_expires" ON "blood_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_community_msg_created" ON "community_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_community_msg_district" ON "community_messages" USING btree ("district","created_at");--> statement-breakpoint
CREATE INDEX "idx_contact_requests_donor_status" ON "contact_requests" USING btree ("donor_uid","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_contact_requests_requester_donor" ON "contact_requests" USING btree ("requester_uid","donor_uid","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_tokens_push" ON "device_tokens" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user_active" ON "device_tokens" USING btree ("user_uid","is_active");--> statement-breakpoint
CREATE INDEX "idx_direct_msg_room_created" ON "direct_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_direct_chat_p1" ON "direct_chat_rooms" USING btree ("participant_one_uid","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_direct_chat_p2" ON "direct_chat_rooms" USING btree ("participant_two_uid","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_donations_certificate_code" ON "donations" USING btree ("certificate_code");--> statement-breakpoint
CREATE INDEX "idx_donations_donor_date" ON "donations" USING btree ("donor_uid","donated_at");--> statement-breakpoint
CREATE INDEX "idx_donations_request" ON "donations" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_donor_profiles_user_uid" ON "donor_profiles" USING btree ("user_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_donor_profiles_smart_id" ON "donor_profiles" USING btree ("donor_smart_id");--> statement-breakpoint
CREATE INDEX "idx_donor_search_bg_dist_avail" ON "donor_profiles" USING btree ("blood_group","district","is_available");--> statement-breakpoint
CREATE INDEX "idx_donor_geo_lat_lng" ON "donor_profiles" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "idx_donor_verified_donations" ON "donor_profiles" USING btree ("is_verified","total_donations");--> statement-breakpoint
CREATE INDEX "idx_emergency_alerts_request_state" ON "emergency_alerts" USING btree ("request_id","alert_state");--> statement-breakpoint
CREATE INDEX "idx_emergency_alerts_donor_state" ON "emergency_alerts" USING btree ("target_donor_uid","alert_state");--> statement-breakpoint
CREATE INDEX "idx_gratitude_notes_created" ON "gratitude_notes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hospitals_slug" ON "hospitals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_hospitals_district" ON "hospitals" USING btree ("district","is_verified");--> statement-breakpoint
CREATE INDEX "idx_hospitals_geo" ON "hospitals" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "idx_live_trips_request_status" ON "live_donor_trips" USING btree ("request_id","trip_status");--> statement-breakpoint
CREATE INDEX "idx_live_trips_donor_status" ON "live_donor_trips" USING btree ("donor_uid","trip_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_login_sessions_token_hash" ON "login_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "idx_login_sessions_user_active" ON "login_sessions" USING btree ("user_uid","is_revoked","expires_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" USING btree ("recipient_uid","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_delivery_retry" ON "notifications" USING btree ("delivery_status","retry_count");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_oidc_nonces_hash" ON "oidc_nonces" USING btree ("nonce_hash");--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_state" ON "oidc_nonces" USING btree ("state_hash","is_consumed");--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_expires" ON "oidc_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_private_contacts_visibility" ON "private_contacts" USING btree ("contact_visibility");--> statement-breakpoint
CREATE INDEX "idx_rate_limit_expires" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_reports_status_created" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_request_donor_response" ON "request_responses" USING btree ("request_id","donor_uid");--> statement-breakpoint
CREATE INDEX "idx_responses_request_status" ON "request_responses" USING btree ("request_id","response_status");--> statement-breakpoint
CREATE INDEX "idx_user_consents_owner_type" ON "user_consents" USING btree ("user_uid","consent_type","status");--> statement-breakpoint
CREATE INDEX "idx_user_consents_counterparty" ON "user_consents" USING btree ("counterparty_uid","user_uid","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email_lower" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_district_status" ON "users" USING btree ("district","account_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_verification_proof_hash" ON "verification_records" USING btree ("proof_hash");--> statement-breakpoint
CREATE INDEX "idx_verification_subject_type" ON "verification_records" USING btree ("subject_uid","verification_type","status");