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
    const { email, password, fullName, role: newUserRole } = await req.json();

    if (!email || !password || !fullName || !newUserRole) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, fullName, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log('Creating user:', { email, fullName, role: newUserRole, company_id: adminCompanyId });

    // Create user using admin API
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
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

    // Update the role in user_roles table (trigger creates with 'employee' default)
    if (newUserRole !== 'employee') {
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: newUserRole })
        .eq('user_id', newUser.id);

      if (updateRoleError) {
        console.error('Update role error:', updateRoleError);
      }
    }

    // Update profile with role and company_id from admin
    const profileUpdate: { role?: string; company_id?: string } = {};
    if (newUserRole !== 'employee') {
      profileUpdate.role = newUserRole;
    }
    if (adminCompanyId) {
      profileUpdate.company_id = adminCompanyId;
    }

    if (Object.keys(profileUpdate).length > 0) {
      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', newUser.id);

      if (updateProfileError) {
        console.error('Update profile error:', updateProfileError);
      }
    }

    console.log('User created successfully with role:', newUserRole, 'company_id:', adminCompanyId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.id, 
          email: newUser.email,
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
