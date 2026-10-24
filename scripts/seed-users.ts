/**
 * SmartSeat: User & Booking Seed Script
 * Uses Supabase Admin API to create demo accounts with fixed passwords and seed bookings.
 * Run with: npm run seed:users
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_KEY || SERVICE_KEY.includes("dummy")) {
  console.log("⚠️ SUPABASE_SERVICE_ROLE_KEY is not set or using dummy value.");
  console.log("To run against live Supabase, configure .env.local with real credentials.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  {
    email: "admin@demo.com",
    password: "Admin@123",
    name: "System Administrator",
    role: "ADMIN" as const,
  },
  {
    email: "staff@demo.com",
    password: "Staff@123",
    name: "Lead Venue Marshal",
    role: "STAFF" as const,
  },
  {
    email: "user1@demo.com",
    password: "User@123",
    name: "Alex Johnson (User 1)",
    role: "USER" as const,
  },
  {
    email: "user2@demo.com",
    password: "User@123",
    name: "Morgan Lee (User 2)",
    role: "USER" as const,
  },
];

async function seed() {
  console.log("🌱 Starting SmartSeat User & Booking Provisioning...");

  const userIds: Record<string, string> = {};

  for (const u of DEMO_USERS) {
    try {
      // Check if user already exists
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((x) => x.email === u.email);

      let uid = existing?.id;
      if (!uid) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { name: u.name, role: u.role },
        });
        if (error) {
          console.error(`❌ Failed to create user ${u.email}:`, error.message);
          continue;
        }
        uid = data.user.id;
        console.log(`✅ Created user: ${u.email} (${u.role}) -> ${uid}`);
      } else {
        console.log(`ℹ️ User already exists: ${u.email} -> ${uid}`);
        // Ensure metadata is up to date
        await supabase.auth.admin.updateUserById(uid, {
          user_metadata: { name: u.name, role: u.role },
        });
      }

      userIds[u.email] = uid;

      // Upsert profile
      await supabase.from("profiles").upsert({
        id: uid,
        name: u.name,
        role: u.role,
        active: true,
      });
    } catch (err: any) {
      console.error(`Error processing ${u.email}:`, err.message);
    }
  }

  // Seed standard booking BK829173 for user1 on seat A12
  const user1Id = userIds["user1@demo.com"];
  if (user1Id) {
    const eventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const seatA12Id = "a1200000-0000-0000-0000-000000000a12";

    const { data: booking, error: bError } = await supabase
      .from("bookings")
      .upsert(
        {
          booking_ref: "BK829173",
          user_id: user1Id,
          event_id: eventId,
          seat_id: seatA12Id,
          status: "BOOKED",
          ticket_link_token: "tok_bk829173_secure_demo_link",
          booking_secret: "sec_bk829173_super_secret_hmac_key",
        },
        { onConflict: "booking_ref" }
      )
      .select()
      .single();

    if (bError) {
      console.error("❌ Failed to seed booking BK829173:", bError.message);
    } else {
      console.log(`🎟️ Seeded Booking BK829173 for user1 on Seat A12`);

      // Seed email outbox item
      await supabase.from("email_outbox").upsert(
        {
          user_id: user1Id,
          booking_id: booking.id,
          recipient_email: "user1@demo.com",
          subject: "Your SmartSeat Confirmation: Movie XYZ (Seat A12)",
          body_html: `<h1>SmartSeat Ticket Confirmed</h1><p>Your seat A12 is reserved for Movie XYZ.</p><p><a href="/t/tok_bk829173_secure_demo_link">Access Dynamic Ticket</a></p>`,
          ticket_link: `/t/tok_bk829173_secure_demo_link`,
        },
        { onConflict: "id" }
      );
    }
  }

  console.log("🏁 Seed provisioning completed successfully!");
}

seed().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
