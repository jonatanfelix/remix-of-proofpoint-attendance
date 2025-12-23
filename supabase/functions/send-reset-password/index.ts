import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  email: string;
  redirectTo: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Reset password request received");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email: rawEmail, redirectTo }: ResetPasswordRequest = await req.json();
    const email = rawEmail.toLowerCase().trim();
    console.log("Processing reset password for email:", email);

    if (!email) {
      throw new Error("Email is required");
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Generate password reset link using Supabase
    const { data, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (resetError) {
      console.error("Supabase reset error:", resetError);
      throw new Error(resetError.message);
    }

    if (!data?.properties?.action_link) {
      throw new Error("Failed to generate reset link");
    }

    const resetLink = data.properties.action_link;
    console.log("Reset link generated successfully");

    // Send email using Resend via fetch
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GeoAttend <onboarding@resend.dev>",
        to: [email],
        subject: "Reset Password - GeoAttend",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px; text-align: center;">
                🔐 Reset Password
              </h1>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Halo! Anda menerima email ini karena ada permintaan reset password untuk akun GeoAttend Anda.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Reset Password
                </a>
              </div>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin-top: 24px;">
                Jika Anda tidak meminta reset password, abaikan email ini. Link ini akan kedaluwarsa dalam 1 jam.
              </p>
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
              <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
                GeoAttend - Sistem Absensi GPS
              </p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const emailResult = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResult);
      throw new Error(emailResult.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, message: "Reset password email sent" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-reset-password function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
