import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine formula to calculate distance between two coordinates in meters
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

interface ClockRequest {
  record_type: 'clock_in' | 'clock_out'
  latitude: number
  longitude: number
  accuracy_meters: number
  photo_url: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 'NO_AUTH' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's auth token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      console.error('User auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 'INVALID_USER' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing attendance for user: ${user.id}`)

    // Parse request body
    const body: ClockRequest = await req.json()
    const { record_type, latitude, longitude, accuracy_meters, photo_url } = body

    // Validate required fields
    if (!record_type || !['clock_in', 'clock_out'].includes(record_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid record_type', code: 'INVALID_TYPE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates', code: 'INVALID_COORDS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!photo_url) {
      return new Response(
        JSON.stringify({ error: 'Photo is required', code: 'NO_PHOTO' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY CHECK 1: Reject high accuracy (unreliable GPS)
    const MAX_ACCURACY_METERS = 100
    if (accuracy_meters > MAX_ACCURACY_METERS) {
      console.warn(`High accuracy rejected: ${accuracy_meters}m for user ${user.id}`)
      return new Response(
        JSON.stringify({ 
          error: `Akurasi GPS terlalu rendah (${Math.round(accuracy_meters)}m). Coba di tempat terbuka.`, 
          code: 'LOW_ACCURACY' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, requires_geofence, company_id, employee_type')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Profile not found:', profileError)
      return new Response(
        JSON.stringify({ error: 'Profile not found', code: 'NO_PROFILE' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Profile found: ${profile.full_name}, requires_geofence: ${profile.requires_geofence}`)

    // SECURITY CHECK 2: Backend geofence validation
    let suspected_mock = false
    let distance_to_office: number | null = null

    if (profile.requires_geofence && profile.company_id) {
      // Get company office location
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .select('office_latitude, office_longitude, radius_meters')
        .eq('id', profile.company_id)
        .single()

      if (companyError) {
        console.error('Company not found:', companyError)
      } else if (company?.office_latitude && company?.office_longitude) {
        // Calculate distance server-side
        distance_to_office = calculateDistance(
          latitude,
          longitude,
          company.office_latitude,
          company.office_longitude
        )

        console.log(`Distance to office: ${distance_to_office}m, radius: ${company.radius_meters}m`)

        if (distance_to_office > company.radius_meters) {
          // Log the attempt but reject
          console.warn(`Geofence violation: User ${user.id} is ${Math.round(distance_to_office)}m from office`)
          
          return new Response(
            JSON.stringify({ 
              error: `Anda berada ${Math.round(distance_to_office)}m dari kantor. Maksimal ${company.radius_meters}m untuk absen.`,
              code: 'OUTSIDE_GEOFENCE',
              distance: Math.round(distance_to_office),
              max_distance: company.radius_meters
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // SECURITY CHECK 3: Flag suspicious accuracy + distance combinations
        // Very accurate GPS but exactly at the edge could be spoofed
        if (accuracy_meters < 5 && Math.abs(distance_to_office - company.radius_meters) < 10) {
          suspected_mock = true
          console.warn(`Suspicious location pattern detected for user ${user.id}`)
        }
      }
    }

    // SECURITY CHECK 4: Check for duplicate clock-in/out today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { data: existingRecords, error: existingError } = await supabaseAdmin
      .from('attendance_records')
      .select('id, record_type, recorded_at')
      .eq('user_id', user.id)
      .gte('recorded_at', todayStart.toISOString())
      .lte('recorded_at', todayEnd.toISOString())
      .order('recorded_at', { ascending: false })

    if (existingError) {
      console.error('Error checking existing records:', existingError)
    } else {
      // Check if already clocked in/out today
      const lastRecord = existingRecords?.[0]
      
      if (record_type === 'clock_in') {
        // Can only clock in if not already clocked in, or if last record is clock_out
        if (lastRecord?.record_type === 'clock_in') {
          return new Response(
            JSON.stringify({ 
              error: 'Anda sudah clock in hari ini. Clock out dulu sebelum clock in lagi.',
              code: 'ALREADY_CLOCKED_IN'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else {
        // Can only clock out if last record is clock_in
        if (!lastRecord || lastRecord.record_type !== 'clock_in') {
          return new Response(
            JSON.stringify({ 
              error: 'Tidak dapat clock out karena belum clock in.',
              code: 'NOT_CLOCKED_IN'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Use server timestamp, not client timestamp
    const serverTimestamp = new Date().toISOString()

    // Insert attendance record using admin client
    const { data: newRecord, error: insertError } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        user_id: user.id,
        record_type,
        latitude,
        longitude,
        accuracy_meters,
        photo_url,
        recorded_at: serverTimestamp,
        notes: suspected_mock ? 'suspected_mock_location' : null
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to record attendance', code: 'INSERT_FAILED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Attendance recorded successfully: ${newRecord.id}`)

    // Log audit event
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    await supabaseAdmin.rpc('log_audit_event', {
      p_user_id: user.id,
      p_user_email: profile.email,
      p_user_role: roleData?.role || 'employee',
      p_company_id: profile.company_id,
      p_action: record_type,
      p_resource_type: 'attendance',
      p_resource_id: newRecord.id,
      p_details: {
        latitude,
        longitude,
        accuracy_meters,
        distance_to_office,
        suspected_mock,
        server_timestamp: serverTimestamp
      },
      p_ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
      p_user_agent: req.headers.get('user-agent')
    })

    return new Response(
      JSON.stringify({
        success: true,
        record: newRecord,
        message: record_type === 'clock_in' ? 'Berhasil Clock In!' : 'Berhasil Clock Out!'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
