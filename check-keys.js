const fs = require('fs');
const path = require('path');

const statusPath = path.join(__dirname, 'status.json');
try {
    // Try reading with utf8, then strip BOM if needed
    let content = fs.readFileSync(statusPath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    // If it fails, try utf16le
    if (content.includes('\0')) {
        content = fs.readFileSync(statusPath, 'utf16le');
    }

    const status = JSON.parse(content);
    console.log('ANON_KEY_START:', status.ANON_KEY.substring(0, 50));
    console.log('ANON_KEY_END:', status.ANON_KEY.substring(status.ANON_KEY.length - 20));
    console.log('API_URL:', status.API_URL);
} catch (e) {
    console.error('Error:', e.message);
}
