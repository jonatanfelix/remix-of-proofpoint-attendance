import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if any admin/developer exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .in('role', ['admin', 'developer'])
      .limit(1);

    if (checkError) {
      console.error('Check error:', checkError);
      return new Response(
        JSON.stringify({ error: 'Failed to check existing admins' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Admin already exists. Use the app to create more users.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { username, password, fullName } = await req.json();

    if (!username || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: username, password, fullName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate inputs
    const trimmedUsername = String(username).trim().toLowerCase();
    const trimmedFullName = String(fullName).trim();
    const trimmedPassword = String(password);

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return new Response(
        JSON.stringify({ error: 'Username harus antara 3-30 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (trimmedFullName.length < 2 || trimmedFullName.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Nama harus antara 2-100 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (trimmedPassword.length < 6 || trimmedPassword.length > 72) {
      return new Response(
        JSON.stringify({ error: 'Password harus antara 6-72 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get default company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (companyError) {
      console.error('Company error:', companyError);
    }

    // Get default shift
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (shiftError) {
      console.error('Shift error:', shiftError);
    }

    const email = `${trimmedUsername}@internal.local`;

    console.log('Creating bootstrap admin user:', { username: trimmedUsername, email, fullName: trimmedFullName });

    // Create user in Auth
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: trimmedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: trimmedFullName,
      },
    });

    if (createError) {
      console.error('Create user error:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newUser = createData.user;
    console.log('User created:', newUser.id);

    // Update user_roles to developer
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: 'developer' })
      .eq('user_id', newUser.id);

    if (roleError) {
      console.error('Role update error:', roleError);
    }

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        username: trimmedUsername,
        role: 'developer',
        company_id: company?.id || null,
        shift_id: shift?.id || null,
        job_title: 'System Administrator',
        department: 'IT',
        is_active: true,
        requires_geofence: false,
        employee_type: 'office',
      })
      .eq('user_id', newUser.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    console.log('Bootstrap admin created successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin berhasil dibuat! Silakan login dengan username dan password yang sudah diset.',
        user: {
          id: newUser.id,
          username: trimmedUsername,
          role: 'developer',
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
