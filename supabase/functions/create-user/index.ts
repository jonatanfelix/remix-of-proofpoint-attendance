import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create regular client to verify the requesting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the requesting user
    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestingUser) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requesting user's role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (roleError) {
      console.error('Role fetch error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestingRole = roleData?.role;
    console.log('Requesting user role:', requestingRole);

    // Only admin or developer can create users
    if (requestingRole !== 'admin' && requestingRole !== 'developer') {
      return new Response(
        JSON.stringify({ error: 'Only admin or developer can create users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requesting user's profile to fetch company_id
    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('user_id', requestingUser.id)
      .maybeSingle();

    if (adminProfileError) {
      console.error('Admin profile fetch error:', adminProfileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch admin profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminCompanyId = adminProfile?.company_id;
    console.log('Admin company_id:', adminCompanyId);

    // Parse request body
    const { password, fullName, role: newUserRole } = await req.json();

    if (!password || !fullName || !newUserRole) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: password, fullName, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Input validation
    const trimmedFullName = String(fullName).trim();
    const trimmedPassword = String(password);

    // Validate fullName
    if (trimmedFullName.length < 2 || trimmedFullName.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Nama harus antara 2-100 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate fullName format (only letters, spaces, and common name characters)
    const nameRegex = /^[a-zA-Z0-9\s'.,-]+$/;
    if (!nameRegex.test(trimmedFullName)) {
      return new Response(
        JSON.stringify({ error: 'Nama hanya boleh mengandung huruf dan spasi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password
    if (trimmedPassword.length < 6 || trimmedPassword.length > 72) {
      return new Response(
        JSON.stringify({ error: 'Password harus antara 6-72 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate username from fullName (lowercase, replace spaces with dots)
    const baseUsername = trimmedFullName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');

    // Check if username already exists and add number if needed
    let username = baseUsername;
    let counter = 1;
    while (true) {
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (!existingUser) break;
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Generate internal email from username (not shown to users)
    let email = `${username}@internal.local`;

    // Validate role assignment permissions
    // Developer can create admin or employee
    // Admin can only create employee
    if (newUserRole === 'admin' && requestingRole !== 'developer') {
      return new Response(
        JSON.stringify({ error: 'Only developer can create admin users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newUserRole === 'developer') {
      return new Response(
        JSON.stringify({ error: 'Cannot create developer users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newUserRole !== 'admin' && newUserRole !== 'employee') {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be admin or employee' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating user:', { username, email, fullName, role: newUserRole, company_id: adminCompanyId });

    // Loop to try creating user (handling potential email collisions in Auth but not in Profiles)
    let newUser;
    let finalUsername = username;
    let createAttempts = 0;
    const MAX_CREATE_ATTEMPTS = 5;

    while (createAttempts < MAX_CREATE_ATTEMPTS) {
      if (createAttempts > 0) {
        // Generate new username with suffix if retrying
        counter++;
        finalUsername = `${baseUsername}${counter}`;
      }

      const emailAttempt = `${finalUsername}@internal.local`;

      console.log(`Attempt ${createAttempts + 1}: Creating user with email ${emailAttempt}`);

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: emailAttempt,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: trimmedFullName,
        },
      });

      if (!createError && createData.user) {
        newUser = createData.user;
        username = finalUsername; // Update the variable for later use
        email = emailAttempt;
        break;
      }

      console.warn(`Failed to create user ${emailAttempt}:`, createError?.message);

      // If error is NOT about already registered, break and return error
      if (!createError?.message?.includes('already registered') && !createError?.message?.includes('already has been registered')) {
        return new Response(
          JSON.stringify({ error: createError?.message || 'Failed to create user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      createAttempts++;
    }

    if (!newUser) {
      return new Response(
        JSON.stringify({ error: 'Failed to find unique username after multiple attempts' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User created:', newUser.id);

    // Update the role in user_roles table (trigger creates with 'employee' default)
    // First check if user_role exists
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', newUser.id)
      .maybeSingle();

    if (!existingRole) {
      // Create user_role if it doesn't exist
      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: newUser.id, role: newUserRole });

      if (insertRoleError) {
        console.error('Insert role error:', insertRoleError);
      }
    } else if (newUserRole !== 'employee') {
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: newUserRole })
        .eq('user_id', newUser.id);

      if (updateRoleError) {
        console.error('Update role error:', updateRoleError);
      }
    }

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', newUser.id)
      .maybeSingle();

    if (!existingProfile) {
      // Create profile if it doesn't exist
      const { error: insertProfileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: newUser.id,
          email: email,
          full_name: trimmedFullName,
          username: username,
          role: newUserRole,
          company_id: adminCompanyId,
          is_active: true,
          attendance_required: true,
          employee_type: 'office',
          leave_balance: 12,
        });

      if (insertProfileError) {
        console.error('Insert profile error:', insertProfileError);
      }
    } else {
      // Update profile with role, company_id, and username
      const profileUpdate: { role?: string; company_id?: string; username: string } = {
        username: username,
      };
      if (newUserRole !== 'employee') {
        profileUpdate.role = newUserRole;
      }
      if (adminCompanyId) {
        profileUpdate.company_id = adminCompanyId;
      }

      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', newUser.id);

      if (updateProfileError) {
        console.error('Update profile error:', updateProfileError);
      }
    }

    console.log('User created successfully with username:', username, 'role:', newUserRole, 'company_id:', adminCompanyId);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.id,
          username: username,
          role: newUserRole,
          company_id: adminCompanyId
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
