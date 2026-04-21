"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import {
  AUCTIONEER_EMAILS,
  SUPER_ADMIN_EMAIL,
  isAuctioneerEmail,
  isSuperAdminEmail,
} from "@/lib/admin-users";

type AdminRole = "auctioneer" | "super_admin";

export default function AdminLoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Please choose login type first.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const isAllowedForRole =
      (selectedRole === "auctioneer" && isAuctioneerEmail(normalizedEmail)) ||
      (selectedRole === "super_admin" && isSuperAdminEmail(normalizedEmail));

    if (!isAllowedForRole) {
      setError(
        selectedRole === "auctioneer"
          ? "Use one of the Auctioneer emails listed below."
          : "Use only the Super Admin email for this login.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const userEmail = data.user?.email?.toLowerCase() ?? "";

      if (selectedRole === "super_admin" && isSuperAdminEmail(userEmail)) {
        router.push("/admin/super-admin");
        return;
      }

      if (selectedRole === "auctioneer" && isAuctioneerEmail(userEmail)) {
        router.push("/auctioneer2");
        return;
      }

      setError("Unauthorized user for selected role.");

    } catch (err: any) {
      const message = err?.message || "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("invalid login credentials")) {
        setError("Invalid email/password. Ensure this exact user exists in Supabase Auth and use the password from ADMIN_LOGIN_CREDENTIALS.txt.");
      } else if (typeof message === "string" && message.toLowerCase().includes("email not confirmed")) {
        setError("Email not confirmed. In Supabase Auth, mark the user as confirmed or create the user with auto-confirm.");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full flex flex-col font-sans overflow-x-hidden selection:bg-red-600 selection:text-white px-4 pt-6 md:pt-10">
      {/* Background Video (Same as Landing Page) */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black/50 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-transparent to-[#000]/80 z-10" />
        <video 
          className="w-full h-full object-cover opacity-60 scale-105"
          autoPlay 
          muted 
          loop 
          playsInline
        >
          <source src="/bgv.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="relative z-20 w-full max-w-[1120px] mx-auto flex flex-col gap-6 items-center justify-center min-h-screen">
        <section 
          className="w-full max-w-[480px] mx-auto p-6 md:p-8 text-center rounded-[1.5rem] border border-[rgba(255,255,255,0.2)] shadow-2xl backdrop-blur-md"
          style={{ backgroundColor: 'transparent' }}
        >
          <h1 className="!text-white drop-shadow-md text-3xl font-serif">Admin Login</h1>
          <p className="!text-neutral-300 drop-shadow mt-2 mb-6">Choose role first, then login using assigned credentials.</p>

          <div className="grid grid-cols-2 gap-3 mb-6" aria-label="Admin role selector">
            <button
              type="button"
              className={`rounded-xl border-[3px] py-2 px-4 font-bold text-sm leading-tight transition duration-200 ${
                selectedRole === "auctioneer" 
                  ? "!bg-white !text-black !border-white shadow-[0_4px_14px_0_rgba(255,255,255,0.39)]" 
                  : "!bg-transparent !text-white !border-[rgba(255,255,255,0.4)] hover:!border-white"
              }`}
              style={selectedRole === "auctioneer" ? { backgroundColor: 'white', color: 'black' } : { backgroundColor: 'transparent' }}
              onClick={() => {
                setSelectedRole("auctioneer");
                setError("");
              }}
            >
              AUCTIONEER LOGIN
            </button>
            <button
              type="button"
              className={`rounded-xl border-[3px] py-2 px-4 font-bold text-sm leading-tight transition duration-200 ${
                selectedRole === "super_admin" 
                  ? "!bg-white !text-black !border-white shadow-[0_4px_14px_0_rgba(255,255,255,0.39)]" 
                  : "!bg-transparent !text-white !border-[rgba(255,255,255,0.4)] hover:!border-white"
              }`}
              style={selectedRole === "super_admin" ? { backgroundColor: 'white', color: 'black' } : { backgroundColor: 'transparent' }}
              onClick={() => {
                setSelectedRole("super_admin");
                setError("");
              }}
            >
              SUPER ADMIN LOGIN
            </button>
          </div>

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={selectedRole === "super_admin" ? "Super Admin Email" : "Auctioneer Email"}
              required
              className="w-full rounded-xl border-[3px] !border-[rgba(255,255,255,0.3)] !bg-transparent px-4 py-3 !text-white placeholder:text-neutral-400 focus:!border-white transition-colors outline-none"
              style={{ backgroundColor: 'transparent' }}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              className="w-full rounded-xl border-[3px] !border-[rgba(255,255,255,0.3)] !bg-transparent px-4 py-3 !text-white placeholder:text-neutral-400 focus:!border-white transition-colors outline-none"
              style={{ backgroundColor: 'transparent' }}
            />

            {error ? <p className="text-red-400 font-medium drop-shadow-md text-sm text-left">{error}</p> : null}

            <button 
              type="submit" 
              className="w-full rounded-xl border-[3px] border-transparent !bg-white hover:!bg-gray-200 !text-black font-bold uppercase py-3 mt-2 transition-colors shadow-[0_4px_14px_0_rgba(255,255,255,0.39)]" 
              style={{ backgroundColor: 'white', color: 'black' }}
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Login"}
            </button>
          </form>

          <div 
            className="mt-6 rounded-xl border border-[rgba(255,255,255,0.15)] p-4 text-left text-sm text-neutral-300"
            style={{ backgroundColor: 'transparent' }}
          >
            <p>
              <strong className="text-white">Auctioneer Emails:</strong> {AUCTIONEER_EMAILS.join(", ")}
            </p>
            <p className="mt-2">
              <strong className="text-white">Super Admin Email:</strong> {SUPER_ADMIN_EMAIL}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
