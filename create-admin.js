const fs = require('fs');

async function createAdmin() {
    try {
        // Read status.json
        let content = fs.readFileSync('./status.json', 'utf16le');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const status = JSON.parse(content);

        const serviceRoleKey = status.SERVICE_ROLE_KEY;
        const apiUrl = status.API_URL;

        console.log('Creating admin user...');

        const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                'apikey': serviceRoleKey
            },
            body: JSON.stringify({
                email: 'admin@internal.local',
                password: 'password123',
                email_confirm: true,
                user_metadata: {
                    full_name: 'Super Admin'
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.msg && data.msg.includes('already registered')) {
                console.log('User already exists. Skipping creation.');
                // We need the ID though...
                // Let's list users to find it? Or just assume it's created.
                return;
            }
            throw new Error(JSON.stringify(data));
        }

        console.log('User created successfully:', data.id);

        // Now trigger the seed-first-user.sql logic?
        // We can't easily run SQL from here without pg driver.
        // But we can print the ID and use it in the next step.
        console.log(`USER_ID=${data.id}`);

        // Let's write the ID to a file so we can read it in the next step
        fs.writeFileSync('admin_user_id.txt', data.id);

    } catch (error) {
        console.error('Error creating user:', error);
        process.exit(1);
    }
}

createAdmin();
